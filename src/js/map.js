/**
 * map.js — Leaflet Map, GPS Tracking, SW Marker Layer, TTS Voice Alerts
 *
 * Naming convention strictly followed:
 *   - All pole marker variables use "sw" prefix (NOT "sp").
 *   - Examples: swMarkers, swLayer, swMarkerGroup, nearestSw, swIconFor()
 */

const MapModule = (() => {

  let map = null;
  let userMarker = null;
  let userAccCircle = null;
  let swMarkerGroup = null;       // Leaflet layer group for all SW markers
  const swMarkers = {};           // { swId: L.Marker } lookup

  let watchId = null;             // navigator.geolocation watchPosition ID
  let lastUserLat = null;
  let lastUserLng = null;
  let lastNearestSwId = null;     // Track last announced SW to avoid repeats
  let ttsLock = false;            // Debounce TTS calls

  // ─────────────────────────────────────────────────────────────────
  // SW MARKER ICON FACTORY
  // Returns a custom L.DivIcon coloured by pole status.
  // Variable name uses "sw" convention.
  // ─────────────────────────────────────────────────────────────────
  function swIconFor(status, highlighted = false) {
    const colors = { normal: '#22c55e', warning: '#f4a400', danger: '#ef4444', pending: '#64748b' };
    const fill = colors[status] || colors.pending;
    const ring = highlighted ? '3px solid #fff' : '2px solid rgba(255,255,255,0.4)';
    const size = highlighted ? 20 : 14;
    const pulse = highlighted ? `
      box-shadow: 0 0 0 0 ${fill};
      animation: sw-pulse 1.2s ease-out infinite;
    ` : '';
    const styleBlock = highlighted ? `<style>
      @keyframes sw-pulse {
        0%   { box-shadow: 0 0 0 0 ${fill}88; }
        70%  { box-shadow: 0 0 0 10px transparent; }
        100% { box-shadow: 0 0 0 0 transparent; }
      }
    </style>` : '';

    return L.divIcon({
      className: '',
      html: `${styleBlock}<div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${fill};border:${ring};
        position:relative;${pulse}
      "></div>`,
      iconSize:   [size, size],
      iconAnchor: [size/2, size/2],
      popupAnchor:[0, -(size/2 + 4)]
    });
  }

  // User location icon
  function userIcon() {
    return L.divIcon({
      className: '',
      html: `<div style="
        width:20px;height:20px;border-radius:50%;
        background:#00bcd4;border:3px solid #fff;
        box-shadow:0 0 0 0 #00bcd4;
        animation:user-ping 1.8s ease-out infinite;
      "></div>
      <style>
        @keyframes user-ping {
          0%   { box-shadow: 0 0 0 0 #00bcd488; }
          70%  { box-shadow: 0 0 0 14px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
      </style>`,
      iconSize:   [20, 20],
      iconAnchor: [10, 10]
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // MAP INITIALISATION
  // ─────────────────────────────────────────────────────────────────
  function init() {
    map = L.map('map', {
      center: CONFIG.MAP_CENTER,
      zoom:   CONFIG.MAP_ZOOM,
      zoomControl: true,
      attributionControl: false
    });

    // Base tile layer — CartoDB dark for night-driving readability
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '© OpenStreetMap © CARTO'
    }).addTo(map);

    // Faint attribution
    L.control.attribution({ prefix: '© OSM / CARTO' }).addTo(map);

    // SW marker layer group
    swMarkerGroup = L.layerGroup().addTo(map);

    // Center-map button
    document.getElementById('btn-center-map').addEventListener('click', () => {
      if (lastUserLat !== null) {
        map.setView([lastUserLat, lastUserLng], 16);
      }
    });

    return map;
  }

  // ─────────────────────────────────────────────────────────────────
  // PLOT ALL SW MARKERS
  // Clears and redraws every pole from the Data cache.
  // All variables use "sw" prefix.
  // ─────────────────────────────────────────────────────────────────
  function plotSwMarkers() {
    swMarkerGroup.clearLayers();
    Object.keys(swMarkers).forEach(k => delete swMarkers[k]);

    for (const swPole of Data.swList) {
      const swMarker = L.marker([swPole.lat, swPole.lng], {
        icon: swIconFor(swPole.status),
        title: swPole.id
      });

      const statusLabel  = CONFIG.STATUS_LABELS[swPole.status] || swPole.status;
      const statusColor  = CONFIG.STATUS_COLORS[swPole.status] || '#64748b';
      const lastDate     = swPole.lastChecked || 'ยังไม่ตรวจ';

      swMarker.bindPopup(`
        <div class="sw-popup-title">${swPole.id}</div>
        <div>${swPole.name}</div>
        <div style="margin:4px 0;"><span style="
          display:inline-block;padding:2px 8px;border-radius:12px;
          background:${statusColor}22;color:${statusColor};
          font-size:0.75rem;font-weight:700;border:1px solid ${statusColor}55;
        ">${statusLabel}</span></div>
        <div style="font-size:0.7rem;color:#94a3b8;margin-top:2px;">${swPole.km}</div>
        <div style="font-size:0.7rem;color:#64748b;">ตรวจล่าสุด: ${lastDate}</div>
        <div style="margin-top:8px;">
          <button onclick="App.openFormForSw('${swPole.id}')"
            style="background:#f4a400;color:#000;border:none;border-radius:5px;
                   padding:4px 10px;font-size:0.72rem;font-weight:700;cursor:pointer;">
            📋 บันทึกผล
          </button>
        </div>
      `, { className: 'sw-popup' });

      swMarkerGroup.addLayer(swMarker);
      swMarkers[swPole.id] = swMarker;
    }

    console.info(`[Map] Plotted ${Data.swList.length} sw markers`);
  }

  // Update a single SW marker's icon (after status change)
  function updateSwMarkerIcon(swId, status, highlighted = false) {
    const swMark = swMarkers[swId];
    if (swMark) swMark.setIcon(swIconFor(status, highlighted));
  }

  // ─────────────────────────────────────────────────────────────────
  // GPS TRACKING
  // ─────────────────────────────────────────────────────────────────
  function startGPS() {
    if (!('geolocation' in navigator)) {
      App.toast('อุปกรณ์ไม่รองรับ GPS');
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      _onGPSSuccess,
      _onGPSError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000
      }
    );

    document.getElementById('gps-dot').classList.add('active');
    document.getElementById('gps-label').textContent = 'GPS Active';
  }

  function stopGPS() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    document.getElementById('gps-dot').classList.remove('active');
    document.getElementById('gps-label').textContent = 'GPS Off';
  }

  function _onGPSSuccess(pos) {
    const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
    lastUserLat = lat;
    lastUserLng = lng;

    // ── Update user marker ──────────────────────────────────────
    if (!userMarker) {
      userMarker    = L.marker([lat, lng], { icon: userIcon(), zIndexOffset: 1000 }).addTo(map);
      userAccCircle = L.circle([lat, lng], { radius: accuracy, color: '#00bcd4', fillOpacity: 0.08, weight: 1 }).addTo(map);
    } else {
      userMarker.setLatLng([lat, lng]);
      userAccCircle.setLatLng([lat, lng]).setRadius(accuracy);
    }

    // ── Auto-follow ─────────────────────────────────────────────
    if (CONFIG.FOLLOW_MAP) {
      map.setView([lat, lng], map.getZoom(), { animate: true, duration: 0.5 });
    }

    // ── HUD update ──────────────────────────────────────────────
    const kmh = speed != null ? Math.round(speed * 3.6) : '–';
    document.getElementById('hud-speed').textContent = kmh;
    document.getElementById('hud-acc').textContent   = Math.round(accuracy);
    document.getElementById('hud-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    // ── Proximity check ─────────────────────────────────────────
    _checkSwProximity(lat, lng);
  }

  function _onGPSError(err) {
    console.warn('[GPS]', err.message);
    document.getElementById('gps-label').textContent = 'GPS Error';
  }

  // ─────────────────────────────────────────────────────────────────
  // SW PROXIMITY CHECK & TTS VOICE ALERT
  // ─────────────────────────────────────────────────────────────────
  function _checkSwProximity(lat, lng) {
    const result = Data.findNearestSw(lat, lng);
    if (!result) return;

    const { sw: nearestSw, distanceM } = result;

    // Update HUD
    document.getElementById('hud-sw-id').textContent   = nearestSw.id.replace('SW-KAE-', 'SW-');
    document.getElementById('hud-sw-name').textContent  = nearestSw.name;
    document.getElementById('hud-sw-dist').textContent  = `${distanceM} ม.`;

    // Highlight nearest SW marker
    if (lastNearestSwId && lastNearestSwId !== nearestSw.id) {
      updateSwMarkerIcon(lastNearestSwId, (Data.swList.find(s => s.id === lastNearestSwId)?.status || 'pending'), false);
    }
    updateSwMarkerIcon(nearestSw.id, nearestSw.status, true);
    lastNearestSwId = nearestSw.id;

    // ── Voice alert when within threshold distance ───────────────
    if (distanceM <= CONFIG.ALERT_DISTANCE_M && CONFIG.TTS_ENABLED && !ttsLock) {
      _triggerVoiceAlert(nearestSw);
    }
  }

  /**
   * _triggerVoiceAlert — fires TTS for a given SW pole.
   * Debounced with ttsLock to prevent repeated announcements.
   */
  function _triggerVoiceAlert(swPole) {
    ttsLock = true;

    // Visual alert
    const alertBox = document.getElementById('voice-alert-box');
    alertBox.textContent = `⚡ ${swPole.id} — ${swPole.name}`;
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 4000);

    // Web Speech API TTS
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // stop any ongoing speech
      const utter = new SpeechSynthesisUtterance();

      // Build Thai-friendly announcement
      const poleNumber = swPole.id.split('-').pop(); // e.g. "001"
      const statusLabel = CONFIG.STATUS_LABELS[swPole.status] || swPole.status;
      utter.text  = `เสาไฟ หมายเลข ${poleNumber}. สถานะ ${statusLabel}`;
      utter.lang  = 'th-TH';
      utter.rate  = 0.95;
      utter.pitch = 1.0;
      utter.volume = 1.0;

      // Fallback to en-US if Thai voice unavailable
      const voices = window.speechSynthesis.getVoices();
      const thVoice = voices.find(v => v.lang.startsWith('th'));
      if (thVoice) utter.voice = thVoice;

      window.speechSynthesis.speak(utter);
      console.info(`[TTS] Announced: ${utter.text}`);
    }

    // Unlock after cooldown (allow next alert after 8 seconds)
    setTimeout(() => { ttsLock = false; }, 8000);
  }

  // Manual TTS test (from settings or dev tools)
  function testTTS(message = 'ทดสอบระบบเสียงแจ้งเตือน เสาไฟหมายเลขหนึ่ง ปกติ') {
    if (!('speechSynthesis' in window)) {
      App.toast('อุปกรณ์ไม่รองรับ TTS');
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(message);
    utter.lang = 'th-TH'; utter.rate = 0.95;
    const thVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('th'));
    if (thVoice) utter.voice = thVoice;
    window.speechSynthesis.speak(utter);
  }

  // ─────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────
  return {
    init,
    plotSwMarkers,
    updateSwMarkerIcon,
    startGPS,
    stopGPS,
    testTTS,
    swMarkers,   // expose for external highlight calls
    get map()         { return map; },
    get userLat()     { return lastUserLat; },
    get userLng()     { return lastUserLng; },
    get nearestSwId() { return lastNearestSwId; }
  };
})();
