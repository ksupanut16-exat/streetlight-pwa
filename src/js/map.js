/**
 * map.js — Leaflet Map, GPS, SW Markers, TTS Voice Alerts (v2)
 *
 * สถานะ → สี:
 *   normal   → #22c55e (เขียว)  — ไฟติดAB
 *   warning  → #f4a400 (เหลือง) — ไฟดับA / ไฟดับB / Off-B
 *   danger   → #ef4444 (แดง)    — ไฟดับAB
 *   landmark → #00bcd4 (ฟ้า)    — SP01/HM1 เสาหลัก
 *   pending  → #64748b (เทา)
 *
 * ตัวแปรทั้งหมดที่เกี่ยวกับเสา ใช้ prefix "sw" เท่านั้น
 */

const MapModule = (() => {

  let map = null;
  let userMarker     = null;
  let userAccCircle  = null;
  let swMarkerGroup  = null;
  const swMarkers    = {};   // { id: L.Marker }

  let watchId        = null;
  let lastUserLat    = null;
  let lastUserLng    = null;
  let lastNearestSwId= null;
  let ttsLock        = false;

  // ── Color map by category ──────────────────────────────────────────────────
  const CAT_COLOR = {
    normal:   '#22c55e',
    warning:  '#f4a400',
    danger:   '#ef4444',
    landmark: '#00bcd4',
    pending:  '#64748b'
  };

  // ── SW icon factory ────────────────────────────────────────────────────────
  function swIconFor(category, highlighted = false) {
    const fill = CAT_COLOR[category] || CAT_COLOR.pending;
    const isLandmark = category === 'landmark';
    const size = highlighted ? (isLandmark ? 22 : 18) : (isLandmark ? 16 : 13);
    const shape = isLandmark
      ? `border-radius:3px;transform:rotate(45deg);`  // diamond for landmarks
      : `border-radius:50%;`;

    const pulseStyle = highlighted
      ? `animation:sw-pulse 1.2s ease-out infinite;`
      : '';

    const styleTag = highlighted ? `<style>
      @keyframes sw-pulse {
        0%   {box-shadow:0 0 0 0 ${fill}99}
        70%  {box-shadow:0 0 0 10px transparent}
        100% {box-shadow:0 0 0 0 transparent}
      }
    </style>` : '';

    return L.divIcon({
      className: '',
      html: `${styleTag}<div style="
        width:${size}px;height:${size}px;
        background:${fill};
        border:${highlighted ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,0.5)'};
        ${shape}${pulseStyle}
      "></div>`,
      iconSize:   [size, size],
      iconAnchor: [size/2, size/2],
      popupAnchor:[0, -(size/2 + 5)]
    });
  }

  // ── User location icon (cyan ping) ────────────────────────────────────────
  function _userIcon() {
    return L.divIcon({
      className: '',
      html: `<div style="
        width:18px;height:18px;border-radius:50%;
        background:#00bcd4;border:3px solid #fff;
        animation:user-ping 1.8s ease-out infinite;
      "></div>
      <style>@keyframes user-ping{
        0%{box-shadow:0 0 0 0 #00bcd488}
        70%{box-shadow:0 0 0 14px transparent}
        100%{box-shadow:0 0 0 0 transparent}
      }</style>`,
      iconSize:   [18,18],
      iconAnchor: [9,9]
    });
  }

  // ── Build popup HTML for a SW pole ────────────────────────────────────────
  function _swPopupHtml(swPole) {
    const cat   = swPole.category || 'pending';
    const color = CAT_COLOR[cat];
    const def   = Data.statusDefs[cat] || { label: swPole.status, icon: '❓' };
    const statusDisplay = swPole.statusNew || swPole.status || '–';

    const repairSection = swPole.repairDate ? `
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #243447;">
        <div style="font-size:0.68rem;color:#94a3b8;">🔧 ซ่อมล่าสุด: ${swPole.repairDate}</div>
        ${swPole.repairItem ? `<div style="font-size:0.68rem;color:#94a3b8;">${swPole.repairItem}</div>` : ''}
        ${swPole.repairBy   ? `<div style="font-size:0.68rem;color:#94a3b8;">โดย: ${swPole.repairBy}</div>` : ''}
      </div>` : '';

    const photoBtn = swPole.photoUrl ? `
      <a href="${swPole.photoUrl}" target="_blank" style="
        display:inline-block;background:#1a2d42;color:#e2e8f0;
        border:1px solid #243447;border-radius:4px;padding:3px 8px;
        font-size:0.68rem;text-decoration:none;margin-top:6px;">
        📷 ดูรูปภาพ
      </a>` : '';

    const workOrderBtn = swPole.workOrderUrl ? `
      <a href="${swPole.workOrderUrl}" target="_blank" style="
        display:inline-block;background:#1a2d42;color:#e2e8f0;
        border:1px solid #243447;border-radius:4px;padding:3px 8px;
        font-size:0.68rem;text-decoration:none;margin-top:6px;margin-left:4px;">
        📋 ใบแจ้งงาน
      </a>` : '';

    const editorInfo = swPole.lastEditor
      ? `<div style="font-size:0.65rem;color:#64748b;margin-top:2px;">แก้ไขโดย: ${swPole.lastEditor} · ${swPole.lastUpdated || ''}</div>`
      : '';

    return `
      <div style="min-width:180px;">
        <div style="font-weight:900;font-size:0.95rem;color:#f4a400;">${swPole.id}</div>
        ${swPole.name && swPole.name !== swPole.id ? `<div style="font-size:0.75rem;color:#94a3b8;">${swPole.name}</div>` : ''}
        <div style="margin:5px 0;">
          <span style="
            display:inline-block;padding:2px 9px;border-radius:12px;
            background:${color}22;color:${color};
            font-size:0.75rem;font-weight:700;border:1px solid ${color}66;
          ">${def.icon} ${statusDisplay}</span>
        </div>
        ${editorInfo}
        ${repairSection}
        <div style="${photoBtn||workOrderBtn?'margin-top:6px;':''}">${photoBtn}${workOrderBtn}</div>
        <div style="margin-top:8px;display:flex;gap:6px;">
          <button onclick="App.openFormForSw('${swPole.id}')"
            style="flex:1;background:#f4a400;color:#000;border:none;border-radius:5px;
                   padding:5px 0;font-size:0.72rem;font-weight:800;cursor:pointer;">
            📝 บันทึก
          </button>
        </div>
      </div>`;
  }

  // ── Map init ───────────────────────────────────────────────────────────────
  function init() {
    map = L.map('map', {
      center:           CONFIG.MAP_CENTER,
      zoom:             CONFIG.MAP_ZOOM,
      zoomControl:      true,
      attributionControl:false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 21,
      attribution: '© OSM © CARTO'
    }).addTo(map);

    L.control.attribution({ prefix: '© OSM / CARTO' }).addTo(map);

    swMarkerGroup = L.layerGroup().addTo(map);

    // Legend control
    _addLegend();

    document.getElementById('btn-center-map').addEventListener('click', () => {
      if (lastUserLat !== null) map.setView([lastUserLat, lastUserLng], 18);
    });

    return map;
  }

  // ── Legend ─────────────────────────────────────────────────────────────────
  function _addLegend() {
    const legend = L.control({ position: 'topright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div');
      div.style.cssText = 'background:rgba(18,31,47,0.9);border:1px solid #243447;border-radius:8px;padding:8px 10px;font-size:0.67rem;color:#e2e8f0;line-height:1.8;backdrop-filter:blur(4px);';
      div.innerHTML = `
        <div style="font-weight:700;color:#f4a400;margin-bottom:4px;">สถานะเสาไฟ</div>
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;margin-right:5px;"></span>ไฟติดปกติ (AB)</div>
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f4a400;margin-right:5px;"></span>ไฟดับบางส่วน</div>
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;margin-right:5px;"></span>ไฟดับทั้งหมด</div>
        <div><span style="display:inline-block;width:10px;height:10px;background:#00bcd4;transform:rotate(45deg);margin-right:5px;"></span>เสาหลัก</div>
        <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#64748b;margin-right:5px;"></span>ยังไม่ตรวจ</div>`;
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    legend.addTo(map);
  }

  // ── Plot all SW markers ────────────────────────────────────────────────────
  function plotSwMarkers() {
    swMarkerGroup.clearLayers();
    Object.keys(swMarkers).forEach(k => delete swMarkers[k]);

    let plotted = 0;
    for (const swPole of Data.swList) {
      if (!swPole.lat || !swPole.lng) continue;

      const swMarker = L.marker([swPole.lat, swPole.lng], {
        icon:  swIconFor(swPole.category || 'pending'),
        title: `${swPole.id} — ${swPole.status}`
      });

      swMarker.bindPopup(_swPopupHtml(swPole), {
        className:   'sw-popup',
        maxWidth:    240,
        minWidth:    180
      });

      swMarkerGroup.addLayer(swMarker);
      swMarkers[swPole.id] = swMarker;
      plotted++;
    }

    console.info(`[Map] Plotted ${plotted} sw markers`);
  }

  // Update a single SW marker icon
  function updateSwMarkerIcon(swId, category, highlighted = false) {
    const swMark = swMarkers[swId];
    if (swMark) swMark.setIcon(swIconFor(category, highlighted));
  }

  // ── GPS tracking ───────────────────────────────────────────────────────────
  function startGPS() {
    if (!('geolocation' in navigator)) { App.toast('อุปกรณ์ไม่รองรับ GPS'); return; }
    watchId = navigator.geolocation.watchPosition(
      _onGPSSuccess, _onGPSError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
    );
    document.getElementById('gps-dot').classList.add('active');
    document.getElementById('gps-label').textContent = 'GPS Active';
  }

  function stopGPS() {
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    document.getElementById('gps-dot').classList.remove('active');
    document.getElementById('gps-label').textContent = 'GPS Off';
  }

  function _onGPSSuccess(pos) {
    const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
    lastUserLat = lat;
    lastUserLng = lng;

    if (!userMarker) {
      userMarker    = L.marker([lat, lng], { icon: _userIcon(), zIndexOffset: 2000 }).addTo(map);
      userAccCircle = L.circle([lat, lng],  { radius: accuracy, color:'#00bcd4', fillOpacity:0.07, weight:1 }).addTo(map);
    } else {
      userMarker.setLatLng([lat, lng]);
      userAccCircle.setLatLng([lat, lng]).setRadius(accuracy);
    }

    if (CONFIG.FOLLOW_MAP) map.setView([lat, lng], map.getZoom(), { animate: true, duration: 0.4 });

    const kmh = speed != null ? Math.round(speed * 3.6) : '–';
    document.getElementById('hud-speed').textContent = kmh;
    document.getElementById('hud-acc').textContent   = Math.round(accuracy);
    document.getElementById('hud-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    _checkSwProximity(lat, lng);
  }

  function _onGPSError(err) {
    console.warn('[GPS]', err.message);
    document.getElementById('gps-label').textContent = 'GPS Error';
  }

  // ── Proximity check + TTS ──────────────────────────────────────────────────
  function _checkSwProximity(lat, lng) {
    const result = Data.findNearestSw(lat, lng);
    if (!result) return;

    const { sw: nearestSw, distanceM } = result;

    document.getElementById('hud-sw-id').textContent  = nearestSw.id;
    document.getElementById('hud-sw-name').textContent = nearestSw.status || '–';
    document.getElementById('hud-sw-dist').textContent = `${distanceM} ม.`;

    // Un-highlight previous, highlight current
    if (lastNearestSwId && lastNearestSwId !== nearestSw.id) {
      const prev = Data.swList.find(s => s.id === lastNearestSwId);
      if (prev) updateSwMarkerIcon(lastNearestSwId, prev.category || 'pending', false);
    }
    updateSwMarkerIcon(nearestSw.id, nearestSw.category || 'pending', true);
    lastNearestSwId = nearestSw.id;

    // TTS alert
    if (distanceM <= CONFIG.ALERT_DISTANCE_M && CONFIG.TTS_ENABLED && !ttsLock) {
      _triggerVoiceAlert(nearestSw);
    }
  }

  // ── TTS voice alert ────────────────────────────────────────────────────────
  function _triggerVoiceAlert(swPole) {
    ttsLock = true;

    // Visual flash
    const box = document.getElementById('voice-alert-box');
    const cat  = swPole.category || 'pending';
    const def  = Data.statusDefs[cat];
    box.textContent = `${def?.icon || '⚡'} ${swPole.id} — ${swPole.status || swPole.id}`;
    box.style.background = cat === 'danger' ? '#ef4444' : cat === 'warning' ? '#f4a400' : '#22c55e';
    box.style.display = 'block';
    setTimeout(() => { box.style.display = 'none'; }, 4000);

    // Web Speech TTS
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance();

      // Construct Thai announcement from real status values
      let announcement;
      const s = String(swPole.statusNew || swPole.status || '').trim();
      if (s.includes('ไฟติดAB')) {
        announcement = `เสา ${swPole.id} ไฟติดปกติ ทั้งสองฝั่ง`;
      } else if (s.includes('ไฟดับAB') || s.includes('ดับAB')) {
        announcement = `เสา ${swPole.id} ไฟดับ ทั้งสองฝั่ง ต้องแจ้งซ่อมด่วน`;
      } else if (s.includes('ไฟดับA') || s.includes('ดับA')) {
        announcement = `เสา ${swPole.id} ไฟดับ ฝั่ง เอ`;
      } else if (s.includes('ไฟดับB') || s.includes('ดับB')) {
        announcement = `เสา ${swPole.id} ไฟดับ ฝั่ง บี`;
      } else if (s.toLowerCase().includes('off')) {
        announcement = `เสา ${swPole.id} ไฟออฟไลน์`;
      } else {
        announcement = `เสาหลัก ${swPole.id}`;
      }

      utter.text   = announcement;
      utter.lang   = 'th-TH';
      utter.rate   = 0.9;
      utter.pitch  = 1.0;
      utter.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const thVoice = voices.find(v => v.lang.startsWith('th'));
      if (thVoice) utter.voice = thVoice;

      window.speechSynthesis.speak(utter);
      console.info(`[TTS] ${announcement}`);
    }

    setTimeout(() => { ttsLock = false; }, 8000);
  }

  // Manual TTS test
  function testTTS() {
    if (!('speechSynthesis' in window)) { App.toast('อุปกรณ์ไม่รองรับ TTS'); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance('ทดสอบระบบเสียง เสาหนึ่ง ไฟติดปกติ ทั้งสองฝั่ง');
    utter.lang = 'th-TH';
    const thVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('th'));
    if (thVoice) utter.voice = thVoice;
    window.speechSynthesis.speak(utter);
    App.toast('🔊 ทดสอบเสียง TTS');
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    init,
    plotSwMarkers,
    updateSwMarkerIcon,
    startGPS,
    stopGPS,
    testTTS,
    swMarkers,
    get map()         { return map; },
    get userLat()     { return lastUserLat; },
    get userLng()     { return lastUserLng; },
    get nearestSwId() { return lastNearestSwId; }
  };
})();
