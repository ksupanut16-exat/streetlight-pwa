/**
 * form.js — Inspection Form: dropdown chains, signature canvas, validation, submit
 */

const FormModule = (() => {

  let sigCanvas, sigCtx;
  let isSigning = false;
  let currentStatus = null;
  let radioState = {};  // { groupId: { el, val } }

  // ─────────────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────────────
  function init() {
    // Signature canvas
    sigCanvas = document.getElementById('sig-canvas');
    sigCtx = sigCanvas.getContext('2d');
    _initSigCanvas();

    // Populate route selector (already has kanchanaphisek option in HTML)
  }

  // ─────────────────────────────────────────────────────────────────
  // DROPDOWN CHAIN: Route → Tollgate → SW pole
  // ─────────────────────────────────────────────────────────────────
  function onRouteChange() {
    const route = document.getElementById('sel-route').value;
    const selTollgate = document.getElementById('sel-tollgate');
    const selSw = document.getElementById('sel-sw-form');

    selTollgate.innerHTML = '<option value="">-- เลือกด่าน --</option>';
    selSw.innerHTML = '<option value="">-- เลือกเสาไฟ --</option>';

    if (!route || !CONFIG.TOLL_GATES[route]) return;

    CONFIG.TOLL_GATES[route].forEach(tg => {
      const opt = document.createElement('option');
      opt.value = tg.id;
      opt.textContent = `${tg.name} (${tg.km})`;
      selTollgate.appendChild(opt);
    });

    selTollgate.onchange = () => _onTollgateChange(route);
  }

  function _onTollgateChange(route) {
    const tgId = document.getElementById('sel-tollgate').value;
    const selSw = document.getElementById('sel-sw-form');
    selSw.innerHTML = '<option value="">-- เลือกเสาไฟ --</option>';
    if (!tgId) return;

    const tg = CONFIG.TOLL_GATES[route].find(t => t.id === tgId);
    if (!tg) return;

    // Merge from SW data cache for status info
    tg.swIds.forEach(swId => {
      const swPole = Data.swList.find(s => s.id === swId);
      const label  = swPole
        ? `${swId} — ${CONFIG.STATUS_LABELS[swPole.status] || '?'}`
        : swId;
      const opt = document.createElement('option');
      opt.value = swId;
      opt.textContent = label;
      selSw.appendChild(opt);
    });
  }

  // Pre-fill form from a SW ID (called from map popup button)
  function fillFromSwId(swId) {
    const swPole = Data.swList.find(s => s.id === swId);
    if (!swPole) return;

    // Find which route/tollgate owns this SW
    let foundRoute = null, foundTg = null;
    for (const [routeKey, gates] of Object.entries(CONFIG.TOLL_GATES)) {
      for (const tg of gates) {
        if (tg.swIds.includes(swId)) { foundRoute = routeKey; foundTg = tg.id; break; }
      }
      if (foundRoute) break;
    }

    if (foundRoute) {
      document.getElementById('sel-route').value = foundRoute;
      onRouteChange();
      setTimeout(() => {
        document.getElementById('sel-tollgate').value = foundTg;
        _onTollgateChange(foundRoute);
        setTimeout(() => {
          document.getElementById('sel-sw-form').value = swId;
        }, 50);
      }, 50);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // RADIO BUTTON GROUPS
  // ─────────────────────────────────────────────────────────────────
  function setStatus(el, val) {
    currentStatus = val;
    document.querySelectorAll('#status-group .radio-btn').forEach(b => {
      b.className = 'radio-btn';
    });
    el.className = `radio-btn selected-${val}`;
  }

  function setRadio(groupId, el, colorClass) {
    radioState[groupId] = { el, val: el.dataset.val };
    document.querySelectorAll(`#${groupId} .radio-btn`).forEach(b => {
      b.className = 'radio-btn';
    });
    el.className = `radio-btn selected-${colorClass}`;
  }

  // ─────────────────────────────────────────────────────────────────
  // GPS COORD FILL
  // ─────────────────────────────────────────────────────────────────
  function fillGPSCoords() {
    const lat = MapModule.userLat;
    const lng = MapModule.userLng;
    if (lat === null) { App.toast('ยังไม่มีสัญญาณ GPS'); return; }
    App.toast(`นำพิกัด: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    // Optionally auto-set the nearest SW
    const result = Data.findNearestSw(lat, lng);
    if (result && result.distanceM < 100) {
      fillFromSwId(result.sw.id);
      App.toast(`เลือก ${result.sw.id} อัตโนมัติ (${result.distanceM}ม.)`);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // FORM VALIDATION & SUBMIT
  // ─────────────────────────────────────────────────────────────────
  function validate() {
    const swId     = document.getElementById('sel-sw-form').value;
    const inspector= document.getElementById('field-inspector').value.trim();

    if (!swId)      { App.toast('⚠️ กรุณาเลือกเสาไฟ'); return false; }
    if (!currentStatus) { App.toast('⚠️ กรุณาเลือกสถานะเสา'); return false; }
    if (!inspector) { App.toast('⚠️ กรุณากรอกชื่อผู้ตรวจ'); return false; }
    return true;
  }

  async function submit() {
    if (!validate()) return;

    const swId     = document.getElementById('sel-sw-form').value;
    const tgId     = document.getElementById('sel-tollgate').value;
    const inspector= document.getElementById('field-inspector').value.trim();
    const notes    = document.getElementById('field-notes').value.trim();
    const bulbVal  = radioState['bulb-group']?.val || '';
    const poleVal  = radioState['pole-group']?.val || '';
    const sigData  = sigCanvas.toDataURL('image/png');

    const record = {
      id:         `INSP-${Date.now()}`,
      swId,
      tollgateId: tgId,
      status:     currentStatus,
      bulb:       bulbVal,
      pole:       poleVal,
      notes,
      inspector,
      lat:        MapModule.userLat,
      lng:        MapModule.userLng,
      signature:  sigData,
      timestamp:  new Date().toISOString(),
      syncStatus: 'pending'
    };

    App.toast('กำลังบันทึก...');
    const result = await Data.postInspectionToGAS(record);

    if (result.status === 'ok') {
      App.toast('✅ บันทึกสำเร็จ — ซิงค์แล้ว');
    } else {
      App.toast('💾 บันทึกใน Cache — รอซิงค์');
    }

    // Update SW pole status in memory & map marker
    const swPole = Data.swList.find(s => s.id === swId);
    if (swPole) {
      swPole.status = currentStatus;
      swPole.lastChecked = new Date().toISOString().split('T')[0];
      MapModule.updateSwMarkerIcon(swId, currentStatus);
    }

    resetForm();
  }

  function resetForm() {
    document.getElementById('sel-sw-form').value = '';
    document.getElementById('field-notes').value = '';
    currentStatus = null;
    radioState = {};
    document.querySelectorAll('.radio-btn').forEach(b => b.className = 'radio-btn');
    clearSig();
  }

  // ─────────────────────────────────────────────────────────────────
  // SIGNATURE CANVAS
  // ─────────────────────────────────────────────────────────────────
  function _initSigCanvas() {
    // Resize canvas to match its CSS size
    function resize() {
      const rect = sigCanvas.getBoundingClientRect();
      sigCanvas.width  = rect.width;
      sigCanvas.height = rect.height;
      sigCtx.strokeStyle = '#1a2d42';
      sigCtx.lineWidth   = 2.5;
      sigCtx.lineCap     = 'round';
      sigCtx.lineJoin    = 'round';
    }
    resize();
    window.addEventListener('resize', resize);

    const getPos = (e) => {
      const rect = sigCanvas.getBoundingClientRect();
      const src  = e.touches ? e.touches[0] : e;
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    };

    sigCanvas.addEventListener('pointerdown', e => {
      isSigning = true;
      const { x, y } = getPos(e);
      sigCtx.beginPath();
      sigCtx.moveTo(x, y);
    });
    sigCanvas.addEventListener('pointermove', e => {
      if (!isSigning) return;
      e.preventDefault();
      const { x, y } = getPos(e);
      sigCtx.lineTo(x, y);
      sigCtx.stroke();
    });
    sigCanvas.addEventListener('pointerup',   () => { isSigning = false; sigCtx.closePath(); });
    sigCanvas.addEventListener('pointerout',  () => { isSigning = false; sigCtx.closePath(); });
  }

  function clearSig() {
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  }

  // ─────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────
  return {
    init,
    onRouteChange,
    fillFromSwId,
    setStatus,
    setRadio,
    fillGPSCoords,
    submit,
    clearSig,
    resetForm
  };
})();
