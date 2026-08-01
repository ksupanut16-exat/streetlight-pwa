/**
 * form.js — Inspection Form (v2 — ตรงกับโครงสร้าง SW_Poles จริง)
 *
 * สถานะที่ใช้:
 *   ไฟติดAB / ไฟดับA / ไฟดับB / ไฟดับAB / Off-B (ตามข้อมูลจริง)
 */

const FormModule = (() => {

  let sigCanvas, sigCtx, isSigning = false;
  let selectedStatus = null;

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    sigCanvas = document.getElementById('sig-canvas');
    sigCtx    = sigCanvas.getContext('2d');
    _initSigCanvas();
  }

  // ── Fill form from a SW ID (called from map popup) ─────────────────────────
  function fillFromSwId(swId) {
    const swPole = Data.swList.find(p => String(p.id) === String(swId));
    if (!swPole) return;

    document.getElementById('sel-sw-form').value   = swId;
    document.getElementById('field-sw-id-display').textContent = swId;
    document.getElementById('field-sw-status-display').textContent = swPole.status || '–';
    document.getElementById('field-sw-coords').textContent =
      swPole.lat && swPole.lng ? `${swPole.lat.toFixed(5)}, ${swPole.lng.toFixed(5)}` : '–';

    // Prefill last repair info
    if (swPole.repairItem) document.getElementById('field-repair-item').value = swPole.repairItem;
    if (swPole.repairBy)   document.getElementById('field-repair-by').value   = swPole.repairBy;

    // Highlight current status button
    _preselectStatus(swPole.category);
  }

  function _preselectStatus(cat) {
    document.querySelectorAll('.sw-status-btn').forEach(b => {
      b.classList.remove('sel-normal','sel-warning','sel-danger');
    });
    if (cat === 'normal')  _clickStatusBtn('ไฟติดAB');
    if (cat === 'warning') _clickStatusBtn('ไฟดับA');
    if (cat === 'danger')  _clickStatusBtn('ไฟดับAB');
  }

  function _clickStatusBtn(val) {
    const btn = document.querySelector(`.sw-status-btn[data-val="${val}"]`);
    if (btn) setStatus(btn, val);
  }

  // ── Status radio ───────────────────────────────────────────────────────────
  function setStatus(el, val) {
    selectedStatus = val;
    document.querySelectorAll('.sw-status-btn').forEach(b => {
      b.classList.remove('sel-normal','sel-warning','sel-danger');
    });
    if (val === 'ไฟติดAB')  el.classList.add('sel-normal');
    else if (val === 'ไฟดับAB') el.classList.add('sel-danger');
    else el.classList.add('sel-warning');
  }

  // ── Fill GPS coords ────────────────────────────────────────────────────────
  function fillGPSCoords() {
    const lat = MapModule.userLat;
    const lng = MapModule.userLng;
    if (lat === null) { App.toast('ยังไม่มีสัญญาณ GPS'); return; }

    // Auto-select nearest pole
    const result = Data.findNearestSw(lat, lng);
    if (result && result.distanceM < 100) {
      fillFromSwId(result.sw.id);
      // Also update the dropdown
      const sel = document.getElementById('sel-sw-form');
      if (sel) sel.value = result.sw.id;
      App.toast(`📡 เลือก ${result.sw.id} อัตโนมัติ (${result.distanceM}ม.)`);
    } else {
      App.toast(`📡 พิกัด: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }
  }

  // ── Populate SW dropdown ───────────────────────────────────────────────────
  function populateSwDropdown() {
    const sel = document.getElementById('sel-sw-form');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- เลือกเสา --</option>';
    Data.swList.forEach(sw => {
      const opt = document.createElement('option');
      opt.value = sw.id;
      const catLabel = Data.statusDefs[sw.category]?.icon || '❓';
      opt.textContent = `${catLabel} ${sw.id}${sw.status && sw.status !== sw.id ? ' — ' + (sw.statusNew || sw.status) : ''}`;
      sel.appendChild(opt);
    });
    sel.onchange = () => fillFromSwId(sel.value);
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  function validate() {
    const swId     = document.getElementById('sel-sw-form').value;
    const inspector= document.getElementById('field-inspector').value.trim();
    if (!swId)         { App.toast('⚠️ กรุณาเลือกเสา'); return false; }
    if (!selectedStatus){ App.toast('⚠️ กรุณาเลือกสถานะ'); return false; }
    if (!inspector)    { App.toast('⚠️ กรุณากรอกชื่อผู้ตรวจ'); return false; }
    return true;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function submit() {
    if (!validate()) return;

    const swId      = document.getElementById('sel-sw-form').value;
    const inspector = document.getElementById('field-inspector').value.trim();
    const repairItem= document.getElementById('field-repair-item').value.trim();
    const repairBy  = document.getElementById('field-repair-by').value.trim() || inspector;
    const notes     = document.getElementById('field-notes').value.trim();
    const sigData   = sigCanvas.toDataURL('image/png');

    // Find old status for log
    const swPole   = Data.swList.find(p => p.id === swId);
    const oldStatus= swPole ? (swPole.statusNew || swPole.status) : '';

    const record = {
      swId,
      status:      selectedStatus,
      oldStatus,
      newStatus:   selectedStatus,
      repairItem,
      repairBy,
      notes,
      inspector,
      lat:         MapModule.userLat,
      lng:         MapModule.userLng,
      signature:   sigData,
      timestamp:   new Date().toISOString(),
      photoUrl:    swPole?.photoUrl || '',
    };

    App.toast('กำลังบันทึก...');

    // Update status in Data cache + GAS
    const statusRes = await Data.updateSwStatus(swId, selectedStatus, inspector);
    // Add maintenance record if there's a repair item
    if (repairItem) {
      await Data.addMaintenance(record);
    }

    // Update map marker color immediately
    const newCat = Data.classifyStatus(null, selectedStatus);
    MapModule.updateSwMarkerIcon(swId, newCat);

    if (statusRes.status === 'ok') {
      App.toast('✅ บันทึกสำเร็จ — ซิงค์แล้ว');
    } else {
      App.toast('💾 บันทึกใน Cache — รอซิงค์');
    }

    resetForm();
  }

  function resetForm() {
    document.getElementById('sel-sw-form').value          = '';
    document.getElementById('field-sw-id-display').textContent = '–';
    document.getElementById('field-sw-status-display').textContent = '–';
    document.getElementById('field-sw-coords').textContent = '–';
    document.getElementById('field-repair-item').value    = '';
    document.getElementById('field-repair-by').value      = '';
    document.getElementById('field-notes').value          = '';
    selectedStatus = null;
    document.querySelectorAll('.sw-status-btn').forEach(b =>
      b.classList.remove('sel-normal','sel-warning','sel-danger'));
    clearSig();
  }

  // ── Signature canvas ───────────────────────────────────────────────────────
  function _initSigCanvas() {
    function resize() {
      const rect = sigCanvas.getBoundingClientRect();
      sigCanvas.width  = rect.width  || 300;
      sigCanvas.height = rect.height || 120;
      sigCtx.strokeStyle = '#0f2027';
      sigCtx.lineWidth   = 2.5;
      sigCtx.lineCap     = 'round';
      sigCtx.lineJoin    = 'round';
    }
    resize();
    window.addEventListener('resize', resize);

    const pos = e => {
      const r = sigCanvas.getBoundingClientRect();
      const s = e.touches ? e.touches[0] : e;
      return { x: s.clientX - r.left, y: s.clientY - r.top };
    };

    sigCanvas.addEventListener('pointerdown', e => {
      isSigning = true;
      const {x,y} = pos(e);
      sigCtx.beginPath(); sigCtx.moveTo(x,y);
    });
    sigCanvas.addEventListener('pointermove', e => {
      if (!isSigning) return;
      e.preventDefault();
      const {x,y} = pos(e);
      sigCtx.lineTo(x,y); sigCtx.stroke();
    });
    sigCanvas.addEventListener('pointerup',  () => { isSigning=false; sigCtx.closePath(); });
    sigCanvas.addEventListener('pointerout', () => { isSigning=false; sigCtx.closePath(); });
  }

  function clearSig() {
    sigCtx?.clearRect(0, 0, sigCanvas?.width, sigCanvas?.height);
  }

  return { init, fillFromSwId, setStatus, fillGPSCoords, populateSwDropdown, submit, clearSig, resetForm };
})();
