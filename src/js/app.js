/**
 * app.js — Application Orchestrator v2
 */

const App = (() => {
  let _toastTimer = null;

  async function boot() {
    // Service Worker
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/service-worker.js');
        document.getElementById('pwa-status').innerHTML = '<span style="color:#22c55e;">✅ PWA Active</span>';
      } catch(e) {
        document.getElementById('pwa-status').innerHTML = '<span style="color:#64748b;">ℹ️ SW ไม่พร้อม</span>';
      }
    }

    // Init modules
    MapModule.init();
    FormModule.init();
    _initTabs();
    _restoreSettings();

    // Load poles
    _setLoading('กำลังดึงข้อมูลเสาไฟ...');
    await Data.fetchSwFromGAS();
    MapModule.plotSwMarkers();
    FormModule.populateSwDropdown();

    // Stats
    _renderStats();

    // GPS
    MapModule.startGPS();

    // Hide loader
    setTimeout(() => {
      const ov = document.getElementById('loading-overlay');
      ov.style.transition = 'opacity .4s';
      ov.style.opacity = '0';
      setTimeout(() => ov.remove(), 400);
    }, 600);

    // Prime TTS voices
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    console.info('[App] Boot complete —', Data.swList.length, 'poles loaded');
  }

  function _setLoading(msg) {
    const el = document.getElementById('loading-msg');
    if (el) el.textContent = msg;
  }

  // ── Tab system ─────────────────────────────────────────────────────────────
  function _initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(tabId).classList.add('active');
        if (tabId === 'map-tab') setTimeout(() => MapModule.map?.invalidateSize(), 80);
        if (tabId === 'report-tab') _renderReport();
      });
    });
  }

  // ── Settings restore ───────────────────────────────────────────────────────
  function _restoreSettings() {
    const s = JSON.parse(localStorage.getItem('exp_settings') || '{}');
    if (s.gasUrl)    { document.getElementById('gas-url').value       = s.gasUrl;    CONFIG.GAS_URL = s.gasUrl; }
    if (s.alertDist) { document.getElementById('alert-distance').value = s.alertDist; CONFIG.ALERT_DISTANCE_M = parseInt(s.alertDist); }
    if (typeof s.tts === 'boolean')    { document.getElementById('toggle-tts').checked   = s.tts;    CONFIG.TTS_ENABLED = s.tts; }
    if (typeof s.follow === 'boolean') { document.getElementById('toggle-follow').checked = s.follow; CONFIG.FOLLOW_MAP  = s.follow; }
    if (s.inspector) document.getElementById('field-inspector').value = s.inspector;
  }

  function saveSetting(key, value) {
    const s = JSON.parse(localStorage.getItem('exp_settings') || '{}');
    s[key] = value;
    localStorage.setItem('exp_settings', JSON.stringify(s));
    if (key === 'tts')       CONFIG.TTS_ENABLED      = value;
    if (key === 'follow')    CONFIG.FOLLOW_MAP        = value;
    if (key === 'alertDist') CONFIG.ALERT_DISTANCE_M  = parseInt(value);
    if (key === 'gasUrl')    CONFIG.GAS_URL           = value;
    toast(`บันทึก: ${key}`);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  function _renderStats() {
    const poles = Data.swList;
    const counts = { normal:0, warning:0, danger:0, landmark:0, pending:0 };
    poles.forEach(p => { counts[p.category] = (counts[p.category]||0)+1; });
    const el = id => document.getElementById(id);
    if (el('stat-total'))  el('stat-total').textContent  = poles.length;
    if (el('stat-ok'))     el('stat-ok').textContent     = counts.normal;
    if (el('stat-warn'))   el('stat-warn').textContent   = counts.warning;
    if (el('stat-danger')) el('stat-danger').textContent = counts.danger;
  }

  // ── Report render ──────────────────────────────────────────────────────────
  function _renderReport() {
    _renderStats();
    const container = document.getElementById('report-list');
    const poles = Data.swList;
    const CAT_COLOR = { normal:'#22c55e', warning:'#f4a400', danger:'#ef4444', landmark:'#00bcd4', pending:'#64748b' };

    if (!poles.length) {
      container.innerHTML = '<div style="text-align:center;padding:2rem;color:#64748b;font-size:.8rem;">ไม่มีข้อมูล — กด "โหลดข้อมูล"</div>';
      return;
    }

    container.innerHTML = poles.map(p => {
      const color  = CAT_COLOR[p.category] || '#64748b';
      const def    = Data.statusDefs[p.category] || { icon:'❓', label:p.status };
      const display= p.statusNew || p.status || '–';
      const repairStr = p.repairDate ? `🔧 ${p.repairDate}${p.repairBy ? ' · ' + p.repairBy : ''}` : '';
      const photoBtn  = p.photoUrl
        ? `<a href="${p.photoUrl}" target="_blank" style="font-size:.65rem;color:var(--cyan);margin-left:auto;">📷</a>`
        : '';

      return `<div class="rcard">
        <div class="rdot" style="background:${color};${p.category==='landmark'?'border-radius:2px;transform:rotate(45deg);':''}"></div>
        <div style="flex:1;min-width:0;">
          <div class="r-id">${p.id}</div>
          <div class="r-status" style="color:${color};">${def.icon} ${display}</div>
          ${repairStr ? `<div class="r-sub">${repairStr}</div>` : ''}
          ${p.lastEditor ? `<div class="r-sub">แก้ไขโดย: ${p.lastEditor}</div>` : ''}
        </div>
        ${photoBtn}
        <button onclick="App.openFormForSw('${p.id}')"
          style="background:var(--accent);color:#000;border:none;border-radius:5px;
                 padding:4px 9px;font-size:.68rem;font-weight:700;cursor:pointer;flex-shrink:0;">
          📝
        </button>
      </div>`;
    }).join('');
  }

  // ── Global action bridge ───────────────────────────────────────────────────
  function setStatus(el, val) { FormModule.setStatus(el, val); }
  function clearSig()         { FormModule.clearSig(); }
  function fillGPSCoords()    { FormModule.fillGPSCoords(); }
  function submitForm()       { FormModule.submit(); }
  function resetForm()        { FormModule.resetForm(); }

  function openFormForSw(swId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="form-tab"]').classList.add('active');
    document.getElementById('form-tab').classList.add('active');
    FormModule.fillFromSwId(swId);
    // Also set the dropdown value
    setTimeout(() => { document.getElementById('sel-sw-form').value = swId; }, 50);
  }

  async function loadReport() {
    toast('กำลังโหลด...');
    await Data.fetchSwFromGAS();
    _renderReport();
    toast('✅ โหลดเสร็จ');
  }

  async function syncData() {
    toast('กำลังซิงค์...');
    await Data.fetchSwFromGAS();
    MapModule.plotSwMarkers();
    FormModule.populateSwDropdown();
    _renderReport();
    toast('✅ ซิงค์เสร็จ — ' + Data.swList.length + ' เสา');
  }

  async function testGAS() {
    toast('กำลังทดสอบ...');
    const r = await Data.testConnection();
    toast(r.status === 'ok' ? `✅ เชื่อมต่อสำเร็จ` : `❌ ${r.message}`);
  }

  function clearLocalData() {
    if (!confirm('ล้างข้อมูล Cache ทั้งหมด?')) return;
    ['exp_sw_cache_v2','exp_maint_cache','exp_settings'].forEach(k => localStorage.removeItem(k));
    toast('🗑️ ล้าง Cache แล้ว');
  }

  function exportPDF() { ReportModule.exportPDF(); }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function toast(msg, ms = 3000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  return { boot, toast, saveSetting, setStatus, clearSig, fillGPSCoords,
           submitForm, resetForm, openFormForSw, loadReport, exportPDF,
           syncData, testGAS, clearLocalData };
})();

document.addEventListener('DOMContentLoaded', () => App.boot());
