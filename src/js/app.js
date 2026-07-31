/**
 * app.js — Application Orchestrator
 * Bootstraps all modules, handles tab switching, exposes global App API.
 */

const App = (() => {
  let _toastTimer = null;

  // ─────────────────────────────────────────────────────────────────
  // BOOTSTRAP
  // ─────────────────────────────────────────────────────────────────
  async function boot() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/service-worker.js');
        console.info('[SW] Registered:', reg.scope);
        document.getElementById('pwa-status').innerHTML =
          '<span style="color:#22c55e;">✅ PWA Service Worker Active</span>';
      } catch (e) {
        console.warn('[SW] Registration failed:', e);
        document.getElementById('pwa-status').innerHTML =
          '<span style="color:#64748b;">ℹ️ Service Worker ไม่พร้อมใช้งาน</span>';
      }
    }

    // Init modules
    MapModule.init();
    FormModule.init();
    _initTabs();
    _restoreSettings();

    // Load SW pole data
    await Data.fetchSwFromGAS();
    MapModule.plotSwMarkers();

    // Start GPS
    MapModule.startGPS();

    // Remove loading overlay
    setTimeout(() => {
      const overlay = document.getElementById('loading-overlay');
      overlay.style.transition = 'opacity 0.4s';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 400);
    }, 800);

    // Load voices for TTS
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices(); // prime the list
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    console.info('[App] Boot complete.');
  }

  // ─────────────────────────────────────────────────────────────────
  // TAB SYSTEM
  // ─────────────────────────────────────────────────────────────────
  function _initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        // Deactivate all
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        // Activate target
        btn.classList.add('active');
        document.getElementById(tabId).classList.add('active');

        // Re-invalidate Leaflet map size when map tab shown
        if (tabId === 'map-tab') {
          setTimeout(() => MapModule.map?.invalidateSize(), 100);
        }
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // SETTINGS PERSISTENCE
  // ─────────────────────────────────────────────────────────────────
  function _restoreSettings() {
    const stored = JSON.parse(localStorage.getItem('exp_settings') || '{}');
    if (stored.gasUrl)    document.getElementById('gas-url').value       = stored.gasUrl;
    if (stored.sheetId)   document.getElementById('sheet-id').value      = stored.sheetId;
    if (stored.alertDist) document.getElementById('alert-distance').value = stored.alertDist;
    if (typeof stored.tts === 'boolean')    document.getElementById('toggle-tts').checked    = stored.tts;
    if (typeof stored.follow === 'boolean') document.getElementById('toggle-follow').checked  = stored.follow;
    if (stored.inspector) document.getElementById('field-inspector').value = stored.inspector;
  }

  function saveSetting(key, value) {
    const stored = JSON.parse(localStorage.getItem('exp_settings') || '{}');
    stored[key] = value;
    localStorage.setItem('exp_settings', JSON.stringify(stored));
    // Apply live
    if (key === 'tts')       CONFIG.TTS_ENABLED       = value;
    if (key === 'follow')    CONFIG.FOLLOW_MAP         = value;
    if (key === 'alertDist') CONFIG.ALERT_DISTANCE_M   = parseInt(value, 10);
    if (key === 'gasUrl')    CONFIG.GAS_URL             = value;
    if (key === 'sheetId')   CONFIG.SHEET_ID            = value;
    toast(`บันทึกการตั้งค่า: ${key}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // GLOBAL ACTION BRIDGE (called from HTML inline handlers)
  // ─────────────────────────────────────────────────────────────────
  function onRouteChange() {
    FormModule.onRouteChange();
  }

  function setStatus(el, val) {
    FormModule.setStatus(el, val);
  }

  function setRadio(groupId, el, colorClass) {
    FormModule.setRadio(groupId, el, colorClass);
  }

  function clearSig() {
    FormModule.clearSig();
  }

  function fillGPSCoords() {
    FormModule.fillGPSCoords();
  }

  function submitForm() {
    FormModule.submit();
  }

  function openFormForSw(swId) {
    // Switch to form tab and prefill
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="form-tab"]').classList.add('active');
    document.getElementById('form-tab').classList.add('active');
    FormModule.fillFromSwId(swId);
  }

  function loadReport() {
    ReportModule.load();
  }

  function exportPDF() {
    ReportModule.exportPDF();
  }

  async function syncData() {
    toast('กำลังซิงค์ข้อมูล...');
    await Data.fetchSwFromGAS();
    MapModule.plotSwMarkers();
    await Data.fetchInspectionsFromGAS();
    ReportModule.render();
    toast('✅ ซิงค์เสร็จสิ้น');
  }

  async function testGAS() {
    toast('กำลังทดสอบ GAS...');
    const result = await Data.testConnection();
    toast(result.status === 'ok' ? '✅ เชื่อมต่อสำเร็จ' : `❌ ${result.message}`);
  }

  function clearLocalData() {
    if (!confirm('ล้างข้อมูลใน Cache ทั้งหมด?')) return;
    localStorage.removeItem('exp_sw_cache');
    localStorage.removeItem('exp_inspections');
    toast('🗑️ ล้าง Cache แล้ว');
  }

  // ─────────────────────────────────────────────────────────────────
  // TOAST
  // ─────────────────────────────────────────────────────────────────
  function toast(message, duration = 3000) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  // ─────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────
  return {
    boot,
    toast,
    saveSetting,
    // HTML inline handlers
    onRouteChange,
    setStatus,
    setRadio,
    clearSig,
    fillGPSCoords,
    submitForm,
    openFormForSw,
    loadReport,
    exportPDF,
    syncData,
    testGAS,
    clearLocalData,
  };
})();

// ── Entry point ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.boot());
