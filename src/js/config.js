/**
 * config.js — Application Constants & Toll Gate Lookup Data
 * ระบบตรวจสอบเสาไฟฟ้า | การทางพิเศษแห่งประเทศไทย สายทางกาญจนาภิเษก
 */

const CONFIG = {
  APP_NAME: 'EXP Streetlight Inspect',
  VERSION: '1.0.0',

  // ── Google Apps Script ──────────────────────────────────────────
  // Set your deployed GAS URL here, or enter it in Settings at runtime.
  GAS_URL: '',        // e.g. https://script.google.com/macros/s/AKfy.../exec
  SHEET_ID: '',       // Google Sheets document ID

  // ── GPS / Alert ─────────────────────────────────────────────────
  ALERT_DISTANCE_M:  50,   // default proximity alert distance in metres
  GPS_INTERVAL_MS:   2000, // how often we read GPS (ms)
  TTS_ENABLED:       true,
  FOLLOW_MAP:        true,

  // ── Map defaults ─────────────────────────────────────────────────
  MAP_CENTER: [13.636, 100.675],  // Bangkok approx — overridden by GPS
  MAP_ZOOM:   16,

  // ── Toll Gate Master Data ─────────────────────────────────────────
  // Structure: routeId -> [ { id, name, km, swIds: [] } ]
  TOLL_GATES: {
    kanchanaphisek: [
      { id: 'TG-KAE-01', name: 'ด่านบางใหญ่',       km: 'กม. 0+000', swIds: ['SW-KAE-001','SW-KAE-002','SW-KAE-003'] },
      { id: 'TG-KAE-02', name: 'ด่านบางบัวทอง',     km: 'กม. 8+500', swIds: ['SW-KAE-010','SW-KAE-011','SW-KAE-012'] },
      { id: 'TG-KAE-03', name: 'ด่านปทุมธานี',       km: 'กม. 19+200', swIds: ['SW-KAE-020','SW-KAE-021'] },
      { id: 'TG-KAE-04', name: 'ด่านลำลูกกา',        km: 'กม. 28+100', swIds: ['SW-KAE-030','SW-KAE-031','SW-KAE-032'] },
      { id: 'TG-KAE-05', name: 'ด่านวังน้อย',        km: 'กม. 38+600', swIds: ['SW-KAE-040','SW-KAE-041'] },
      { id: 'TG-KAE-06', name: 'ด่านอยุธยา',         km: 'กม. 52+000', swIds: ['SW-KAE-050','SW-KAE-051','SW-KAE-052'] },
      { id: 'TG-KAE-07', name: 'ด่านบางปะอิน',       km: 'กม. 58+500', swIds: ['SW-KAE-060','SW-KAE-061'] },
      { id: 'TG-KAE-08', name: 'ด่านสุวรรณภูมิ',    km: 'กม. 42+000', swIds: ['SW-KAE-070','SW-KAE-071','SW-KAE-072'] },
      { id: 'TG-KAE-09', name: 'ด่านบางนา',          km: 'กม. 14+000', swIds: ['SW-KAE-080','SW-KAE-081'] },
      { id: 'TG-KAE-10', name: 'ด่านพระราม 2',       km: 'กม. 6+000',  swIds: ['SW-KAE-090','SW-KAE-091','SW-KAE-092'] },
    ]
  },

  // Status label maps
  STATUS_LABELS: {
    normal:  'ปกติ',
    warning: 'ชำรุด',
    danger:  'เสียหาย',
    pending: 'รอตรวจ'
  },
  STATUS_COLORS: {
    normal:  '#22c55e',
    warning: '#f4a400',
    danger:  '#ef4444',
    pending: '#64748b'
  }
};

// Load persisted settings from localStorage
(function applyStoredSettings() {
  const stored = JSON.parse(localStorage.getItem('exp_settings') || '{}');
  if (stored.gasUrl)    CONFIG.GAS_URL = stored.gasUrl;
  if (stored.sheetId)   CONFIG.SHEET_ID = stored.sheetId;
  if (stored.alertDist) CONFIG.ALERT_DISTANCE_M = parseInt(stored.alertDist, 10);
  if (typeof stored.tts === 'boolean')    CONFIG.TTS_ENABLED = stored.tts;
  if (typeof stored.follow === 'boolean') CONFIG.FOLLOW_MAP  = stored.follow;
})();
