/**
 * data.js — Pole data layer (v2 — ตรงกับ SW_Poles sheet จริง)
 *
 * Status ที่ใช้จริงในระบบ:
 *   "ไฟติดAB"  → category: normal   (ไฟทั้ง 2 ฝั่งติด)
 *   "ไฟดับA"   → category: warning  (ดับฝั่ง A)
 *   "ไฟดับB"   → category: warning  (ดับฝั่ง B)
 *   "ไฟดับAB"  → category: danger   (ดับทั้งคู่)
 *   "Off-B"    → category: warning
 *   SP01/HM1   → category: landmark (เสาหลัก ไม่มีสถานะไฟ)
 *   (ว่าง)     → category: pending
 *
 * SW marker naming: ตัวแปรทั้งหมดใช้ prefix "sw" เท่านั้น (ไม่ใช้ "sp")
 */

const Data = (() => {

  // ── Status definitions (ตรงกับข้อมูลจริงใน Sheet) ─────────────────────────
  const STATUS_DEFS = {
    normal:   { label: 'ไฟติดปกติ',   color: '#22c55e', icon: '✅' },
    warning:  { label: 'ไฟดับบางส่วน',color: '#f4a400', icon: '⚠️' },
    danger:   { label: 'ไฟดับทั้งหมด',color: '#ef4444', icon: '🚨' },
    pending:  { label: 'ยังไม่ตรวจ',  color: '#64748b', icon: '❓' },
    landmark: { label: 'เสาหลัก/จุดอ้างอิง', color: '#00bcd4', icon: '📍' }
  };

  // Map raw Thai status text → category key
  function classifyStatus(rawStatus, rawStatusNew) {
    const s = String(rawStatusNew || rawStatus || '').trim();
    if (!s) return 'pending';
    if (/^(SP|HM)\d*/i.test(s) && !s.includes('ไฟ')) return 'landmark';
    if (s.includes('ไฟติดAB') || s.includes('ติดAB'))  return 'normal';
    if (s.includes('ไฟดับAB') || s.includes('ดับAB'))  return 'danger';
    if (s.includes('ไฟดับA')  || s.includes('ดับA'))   return 'warning';
    if (s.includes('ไฟดับB')  || s.includes('ดับB'))   return 'warning';
    if (s.toLowerCase().includes('off'))                 return 'warning';
    return 'pending';
  }

  // ── In-memory caches ───────────────────────────────────────────────────────
  let _swCache = [];
  let _maintCache = [];

  // ── localStorage helpers ───────────────────────────────────────────────────
  const LS_SW   = 'exp_sw_cache_v2';
  const LS_MAINT= 'exp_maint_cache';

  function _saveLS(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
  }
  function _loadLS(key, fb = []) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fb; } catch(e) { return fb; }
  }

  // ── GAS fetch helpers ──────────────────────────────────────────────────────
  async function _gasGet(params = {}) {
    if (!CONFIG.GAS_URL) throw new Error('NO_GAS_URL');
    const url = new URL(CONFIG.GAS_URL);
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
    const res  = await fetch(url.toString(), { redirect: 'follow' });
    return res.json();
  }

  async function _gasPost(body) {
    if (!CONFIG.GAS_URL) throw new Error('NO_GAS_URL');
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  // ── Fetch & normalise SW poles from GAS ────────────────────────────────────
  async function fetchSwFromGAS() {
    try {
      const json = await _gasGet({ action: 'getSW' });
      if (json.status === 'ok' && Array.isArray(json.data)) {
        // Normalise: ensure every record has a category field
        _swCache = json.data.map(p => ({
          ...p,
          category: p.category || classifyStatus(p.statusRaw, p.statusNew)
        }));
        _saveLS(LS_SW, _swCache);
        console.info(`[Data] Loaded ${_swCache.length} poles from GAS`);
        return _swCache;
      }
      throw new Error(json.message || 'GAS error');
    } catch (err) {
      console.warn('[Data] GAS fetch failed:', err.message);
      const cached = _loadLS(LS_SW, []);
      if (cached.length) {
        _swCache = cached;
        console.info(`[Data] Using ${_swCache.length} cached poles`);
      } else {
        console.warn('[Data] No cache — loading fallback sample');
        _swCache = _buildFallbackData();
      }
      return _swCache;
    }
  }

  // ── Update a single pole status ────────────────────────────────────────────
  async function updateSwStatus(swId, newStatus, editor) {
    // Optimistic update in memory
    const pole = _swCache.find(p => String(p.id) === String(swId));
    if (pole) {
      pole.statusNew  = newStatus;
      pole.status     = newStatus;
      pole.category   = classifyStatus(null, newStatus);
      pole.lastEditor = editor || '';
      pole.lastUpdated= new Date().toLocaleDateString('th-TH');
    }
    _saveLS(LS_SW, _swCache);

    try {
      return await _gasPost({ action: 'updateStatus', data: { swId, status: newStatus, editor } });
    } catch (err) {
      console.warn('[Data] updateStatus GAS failed (local only):', err.message);
      return { status: 'local_only', message: 'บันทึกใน Cache รอซิงค์' };
    }
  }

  // ── Add maintenance record ─────────────────────────────────────────────────
  async function addMaintenance(record) {
    _maintCache.push({ ...record, syncStatus: 'pending' });
    _saveLS(LS_MAINT, _maintCache);

    try {
      const res = await _gasPost({ action: 'addMaintenance', data: record });
      if (res.status === 'ok') {
        _maintCache[_maintCache.length - 1].syncStatus = 'ok';
        _saveLS(LS_MAINT, _maintCache);
      }
      return res;
    } catch (err) {
      return { status: 'local_only', message: 'บันทึกใน Cache รอซิงค์' };
    }
  }

  // ── Fetch maintenance list ─────────────────────────────────────────────────
  async function fetchMaintenance() {
    try {
      const json = await _gasGet({ action: 'getMaintenance' });
      if (json.status === 'ok' && Array.isArray(json.data)) {
        _maintCache = json.data;
        _saveLS(LS_MAINT, _maintCache);
        return _maintCache;
      }
    } catch {}
    _maintCache = _loadLS(LS_MAINT, []);
    return _maintCache;
  }

  // ── Test GAS connection ────────────────────────────────────────────────────
  async function testConnection() {
    if (!CONFIG.GAS_URL) return { status: 'error', message: 'ยังไม่ได้ตั้งค่า GAS URL' };
    try {
      const res = await fetch(`${CONFIG.GAS_URL}?action=ping`, { redirect: 'follow' });
      return res.json();
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  }

  // ── Haversine distance (metres) ────────────────────────────────────────────
  function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2
            + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180)
            * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function findNearestSw(lat, lng) {
    if (!_swCache.length) return null;
    let nearestSw = null, minDist = Infinity;
    for (const sw of _swCache) {
      if (!sw.lat || !sw.lng) continue;
      const d = haversineM(lat, lng, sw.lat, sw.lng);
      if (d < minDist) { minDist = d; nearestSw = sw; }
    }
    return nearestSw ? { sw: nearestSw, distanceM: Math.round(minDist) } : null;
  }

  function getSwWithinRadius(lat, lng, radiusM) {
    return _swCache
      .filter(sw => sw.lat && sw.lng)
      .map(sw => ({ sw, distanceM: Math.round(haversineM(lat, lng, sw.lat, sw.lng)) }))
      .filter(r => r.distanceM <= radiusM)
      .sort((a, b) => a.distanceM - b.distanceM);
  }

  // ── Fallback sample data (พิกัดจากข้อมูลจริง) ────────────────────────────
  function _buildFallbackData() {
    // ข้อมูลจาก SW_Poles sheet (rows 2-100 ที่มองเห็น)
    return [
      { id:'SP01', lat:13.64585, lng:100.68277, status:'SP01',    statusRaw:'SP01',    statusNew:'',        category:'landmark', repairDate:'20/08/2025', repairItem:'เปลี่ยนหลอดโซเดียม 250W', repairBy:'ทีมช่าง D', lastEditor:'',              lastUpdated:'' },
      { id:'HM1',  lat:13.64676, lng:100.68316, status:'HM1',     statusRaw:'HM1',     statusNew:'',        category:'landmark', repairDate:'23/08/2025', repairItem:'เปลี่ยนหลอด LED300W',    repairBy:'ทีมช่าง E', lastEditor:'',              lastUpdated:'' },
      { id:'HM3',  lat:13.64478, lng:100.68236, status:'HM3',     statusRaw:'HM3',     statusNew:'',        category:'landmark', repairDate:'22/08/2025', repairItem:'ตรวจสอบสายไฟ',          repairBy:'ทีมช่าง F', lastEditor:'',              lastUpdated:'' },
      { id:'HM2',  lat:13.64547, lng:100.68268, status:'HM2',     statusRaw:'HM2',     statusNew:'',        category:'landmark', repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'',              lastUpdated:'' },
      { id:'SP02', lat:13.64492, lng:100.68416, status:'SP02',    statusRaw:'SP02',    statusNew:'',        category:'landmark', repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'',              lastUpdated:'' },
      { id:'HM9',  lat:13.64288, lng:100.68291, status:'HM9',     statusRaw:'HM9',     statusNew:'',        category:'landmark', repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'ไม่ระบุผู้ตรวจ',lastUpdated:'22/10/2025' },
      { id:'HM11', lat:13.64112, lng:100.68117, status:'HM11',    statusRaw:'HM11',    statusNew:'',        category:'landmark', repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'ไม่ระบุผู้ตรวจ',lastUpdated:'24/10/2025' },
      { id:'HM13', lat:13.64243, lng:100.68116, status:'HM13',    statusRaw:'HM13',    statusNew:'Off-B',   category:'warning',  repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'',              lastUpdated:'29/10/2025' },
      { id:'1',    lat:13.63867, lng:100.67865, status:'ไฟติดAB', statusRaw:'ไฟติดAB', statusNew:'',        category:'normal',   repairDate:'13/10/2025', repairItem:'',                       repairBy:'',          lastEditor:'ไม่ระบุผู้ตรวจ',lastUpdated:'26/11/2025' },
      { id:'2',    lat:13.63838, lng:100.67844, status:'ไฟติดAB', statusRaw:'ไฟติดAB', statusNew:'',        category:'normal',   repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'ไม่ระบุผู้ตรวจ',lastUpdated:'26/11/2025' },
      { id:'3',    lat:13.63806, lng:100.67822, status:'ไฟติดAB', statusRaw:'ไฟติดAB', statusNew:'',        category:'normal',   repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'ไม่ระบุผู้ตรวจ',lastUpdated:'26/11/2025' },
      { id:'13',   lat:13.63512, lng:100.67601, status:'ไฟติดAB', statusRaw:'ไฟติดAB', statusNew:'ไฟดับB',  category:'warning',  repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'ศุภณัฐ',        lastUpdated:'29/10/2025' },
      { id:'14',   lat:13.63487, lng:100.67581, status:'ไฟติดAB', statusRaw:'ไฟติดAB', statusNew:'ไฟดับA',  category:'warning',  repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'ศุภณัฐ',        lastUpdated:'29/10/2025' },
      { id:'26',   lat:13.63149, lng:100.673,   status:'ไฟดับA',  statusRaw:'ไฟดับA',  statusNew:'',        category:'warning',  repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'ไม่ระบุผู้ตรวจ',lastUpdated:'27/11/2025' },
      { id:'48',   lat:13.62529, lng:100.66785, status:'ไฟดับAB', statusRaw:'ไฟดับAB', statusNew:'',        category:'danger',   repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'',              lastUpdated:'06/11/2025' },
      { id:'SP06', lat:13.63526, lng:100.67594, status:'SP06',    statusRaw:'SP06',    statusNew:'',        category:'landmark', repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'',              lastUpdated:'' },
      { id:'SP07', lat:13.63,    lng:100.67156, status:'SP07',    statusRaw:'SP07',    statusNew:'',        category:'landmark', repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'',              lastUpdated:'' },
      { id:'SP08', lat:13.62496, lng:100.66738, status:'SP08',    statusRaw:'SP08',    statusNew:'',        category:'landmark', repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'',              lastUpdated:'' },
      { id:'SP09', lat:13.62109, lng:100.6642,  status:'SP09',    statusRaw:'SP09',    statusNew:'',        category:'landmark', repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'',              lastUpdated:'' },
      { id:'SP10', lat:13.6179,  lng:100.66251, status:'SP10',    statusRaw:'SP10',    statusNew:'',        category:'landmark', repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'',              lastUpdated:'' },
      { id:'HM17', lat:13.6207,  lng:100.66383, status:'HM17',    statusRaw:'HM17',    statusNew:'',        category:'landmark', repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'',              lastUpdated:'' },
      { id:'HM18', lat:13.61964, lng:100.66354, status:'HM18',    statusRaw:'HM18',    statusNew:'',        category:'landmark', repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'',              lastUpdated:'' },
      { id:'66',   lat:13.61767, lng:100.66197, status:'ไฟดับA',  statusRaw:'ไฟดับA',  statusNew:'',        category:'warning',  repairDate:'',           repairItem:'',                       repairBy:'',          lastEditor:'ไม่ระบุผู้ตรวจ',lastUpdated:'26/11/2025' },
    ];
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────
  return {
    get swList()       { return _swCache;    },
    get maintList()    { return _maintCache; },
    get statusDefs()   { return STATUS_DEFS; },
    classifyStatus,
    fetchSwFromGAS,
    updateSwStatus,
    addMaintenance,
    fetchMaintenance,
    testConnection,
    haversineM,
    findNearestSw,
    getSwWithinRadius
  };
})();
