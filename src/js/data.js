/**
 * data.js — Pole definitions, GAS API adapter, local cache
 *
 * SW marker variable naming convention:
 *   All electrical pole objects and arrays use the prefix "sw" (NOT "sp").
 *   e.g. swMarkers, swData, swLayer, nearestSw, etc.
 */

const Data = (() => {

  // ─────────────────────────────────────────────────────────────────
  // SAMPLE SW (Streetlight / Electrical Pole) DATA
  // In production, this is fetched from GAS / Google Sheets.
  // Coordinates are sample positions along the Kanchanaphisek route.
  // ─────────────────────────────────────────────────────────────────
  const SAMPLE_SW_DATA = [
    // ── บางใหญ่ area ──────────────────────────────────────────────
    { id: 'SW-KAE-001', name: 'เสาไฟ SW-KAE-001', tollgate: 'TG-KAE-01', lat: 13.8621, lng: 100.4102, km: 'กม. 0+050', status: 'normal',  lastChecked: '2025-06-01' },
    { id: 'SW-KAE-002', name: 'เสาไฟ SW-KAE-002', tollgate: 'TG-KAE-01', lat: 13.8639, lng: 100.4118, km: 'กม. 0+150', status: 'warning', lastChecked: '2025-06-01' },
    { id: 'SW-KAE-003', name: 'เสาไฟ SW-KAE-003', tollgate: 'TG-KAE-01', lat: 13.8658, lng: 100.4135, km: 'กม. 0+250', status: 'normal',  lastChecked: '2025-06-01' },
    // ── บางบัวทอง area ────────────────────────────────────────────
    { id: 'SW-KAE-010', name: 'เสาไฟ SW-KAE-010', tollgate: 'TG-KAE-02', lat: 13.9240, lng: 100.4315, km: 'กม. 8+500', status: 'normal',  lastChecked: '2025-06-02' },
    { id: 'SW-KAE-011', name: 'เสาไฟ SW-KAE-011', tollgate: 'TG-KAE-02', lat: 13.9255, lng: 100.4330, km: 'กม. 8+600', status: 'danger',  lastChecked: '2025-06-02' },
    { id: 'SW-KAE-012', name: 'เสาไฟ SW-KAE-012', tollgate: 'TG-KAE-02', lat: 13.9270, lng: 100.4345, km: 'กม. 8+700', status: 'normal',  lastChecked: '2025-06-02' },
    // ── ปทุมธานี area ─────────────────────────────────────────────
    { id: 'SW-KAE-020', name: 'เสาไฟ SW-KAE-020', tollgate: 'TG-KAE-03', lat: 13.9810, lng: 100.5201, km: 'กม.19+200', status: 'pending', lastChecked: null },
    { id: 'SW-KAE-021', name: 'เสาไฟ SW-KAE-021', tollgate: 'TG-KAE-03', lat: 13.9825, lng: 100.5218, km: 'กม.19+300', status: 'warning', lastChecked: '2025-05-30' },
    // ── ลำลูกกา area ─────────────────────────────────────────────
    { id: 'SW-KAE-030', name: 'เสาไฟ SW-KAE-030', tollgate: 'TG-KAE-04', lat: 14.0420, lng: 100.6550, km: 'กม.28+100', status: 'normal',  lastChecked: '2025-06-03' },
    { id: 'SW-KAE-031', name: 'เสาไฟ SW-KAE-031', tollgate: 'TG-KAE-04', lat: 14.0435, lng: 100.6565, km: 'กม.28+200', status: 'normal',  lastChecked: '2025-06-03' },
    { id: 'SW-KAE-032', name: 'เสาไฟ SW-KAE-032', tollgate: 'TG-KAE-04', lat: 14.0450, lng: 100.6580, km: 'กม.28+300', status: 'danger',  lastChecked: '2025-06-03' },
    // ── วังน้อย area ──────────────────────────────────────────────
    { id: 'SW-KAE-040', name: 'เสาไฟ SW-KAE-040', tollgate: 'TG-KAE-05', lat: 14.1180, lng: 100.7020, km: 'กม.38+600', status: 'normal',  lastChecked: '2025-06-04' },
    { id: 'SW-KAE-041', name: 'เสาไฟ SW-KAE-041', tollgate: 'TG-KAE-05', lat: 14.1195, lng: 100.7038, km: 'กม.38+700', status: 'normal',  lastChecked: '2025-06-04' },
    // ── บางนา area ────────────────────────────────────────────────
    { id: 'SW-KAE-080', name: 'เสาไฟ SW-KAE-080', tollgate: 'TG-KAE-09', lat: 13.6770, lng: 100.6250, km: 'กม.14+000', status: 'normal',  lastChecked: '2025-06-05' },
    { id: 'SW-KAE-081', name: 'เสาไฟ SW-KAE-081', tollgate: 'TG-KAE-09', lat: 13.6785, lng: 100.6265, km: 'กม.14+100', status: 'warning', lastChecked: '2025-06-05' },
  ];

  // In-memory cache for session
  let _swCache = [];          // All sw pole records
  let _inspectionCache = [];  // All submitted inspection records

  // ─────────────────────────────────────────────────────────────────
  // LOCAL STORAGE HELPERS
  // ─────────────────────────────────────────────────────────────────
  function _saveLocal(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) { console.warn('localStorage write fail', e); }
  }
  function _loadLocal(key, fallback = []) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch(e) { return fallback; }
  }

  // ─────────────────────────────────────────────────────────────────
  // GAS API ADAPTER
  // ─────────────────────────────────────────────────────────────────
  async function fetchSwFromGAS() {
    if (!CONFIG.GAS_URL) {
      console.info('[Data] No GAS URL — using sample data');
      _swCache = [...SAMPLE_SW_DATA];
      _saveLocal('exp_sw_cache', _swCache);
      return _swCache;
    }
    try {
      const url = `${CONFIG.GAS_URL}?action=getSW`;
      const res = await fetch(url, { redirect: 'follow' });
      const json = await res.json();
      if (json.status === 'ok' && Array.isArray(json.data)) {
        _swCache = json.data;
        _saveLocal('exp_sw_cache', _swCache);
        return _swCache;
      }
      throw new Error(json.message || 'Unknown GAS error');
    } catch (err) {
      console.warn('[Data] GAS fetch failed, falling back to cache/sample:', err.message);
      const cached = _loadLocal('exp_sw_cache', SAMPLE_SW_DATA);
      _swCache = cached;
      return _swCache;
    }
  }

  async function fetchInspectionsFromGAS() {
    if (!CONFIG.GAS_URL) {
      _inspectionCache = _loadLocal('exp_inspections', []);
      return _inspectionCache;
    }
    try {
      const url = `${CONFIG.GAS_URL}?action=getInspections`;
      const res = await fetch(url, { redirect: 'follow' });
      const json = await res.json();
      if (json.status === 'ok' && Array.isArray(json.data)) {
        _inspectionCache = json.data;
        _saveLocal('exp_inspections', _inspectionCache);
        return _inspectionCache;
      }
    } catch (err) {
      console.warn('[Data] Inspections fetch failed:', err.message);
    }
    _inspectionCache = _loadLocal('exp_inspections', []);
    return _inspectionCache;
  }

  async function postInspectionToGAS(record) {
    // Always save locally first (offline-first)
    _inspectionCache.push(record);
    _saveLocal('exp_inspections', _inspectionCache);

    if (!CONFIG.GAS_URL) {
      console.info('[Data] No GAS URL — saved locally only');
      return { status: 'local', message: 'บันทึกเฉพาะใน Cache (ไม่มี GAS URL)' };
    }
    try {
      const res = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' }, // avoid CORS preflight with GAS
        body: JSON.stringify({ action: 'addInspection', data: record })
      });
      const json = await res.json();
      return json;
    } catch (err) {
      console.warn('[Data] POST to GAS failed (record saved locally):', err.message);
      return { status: 'local_only', message: 'บันทึกใน Cache รอซิงค์' };
    }
  }

  async function testConnection() {
    if (!CONFIG.GAS_URL) return { status: 'error', message: 'ยังไม่ได้ตั้งค่า GAS URL' };
    try {
      const res = await fetch(`${CONFIG.GAS_URL}?action=ping`, { redirect: 'follow' });
      const json = await res.json();
      return json;
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PROXIMITY UTILITY
  // Returns distance in metres between two lat/lng pairs (Haversine)
  // ─────────────────────────────────────────────────────────────────
  function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000; // metres
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2
            + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  /**
   * Find the nearest SW pole to a given coordinate.
   * Returns { sw, distanceM } or null.
   */
  function findNearestSw(lat, lng) {
    if (!_swCache.length) return null;
    let nearestSw = null, minDist = Infinity;
    for (const sw of _swCache) {
      const d = haversineM(lat, lng, sw.lat, sw.lng);
      if (d < minDist) { minDist = d; nearestSw = sw; }
    }
    return { sw: nearestSw, distanceM: Math.round(minDist) };
  }

  /**
   * Get all SW poles within a given radius (metres).
   */
  function getSwWithinRadius(lat, lng, radiusM) {
    return _swCache
      .map(sw => ({ sw, distanceM: Math.round(haversineM(lat, lng, sw.lat, sw.lng)) }))
      .filter(r => r.distanceM <= radiusM)
      .sort((a, b) => a.distanceM - b.distanceM);
  }

  // ─────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────
  return {
    get swList()           { return _swCache; },
    get inspectionList()   { return _inspectionCache; },
    fetchSwFromGAS,
    fetchInspectionsFromGAS,
    postInspectionToGAS,
    testConnection,
    haversineM,
    findNearestSw,
    getSwWithinRadius,
    sampleData: SAMPLE_SW_DATA
  };
})();
