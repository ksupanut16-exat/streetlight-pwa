/**
 * Code.gs — Google Apps Script Backend (v2 — ตรงกับโครงสร้าง Sheet จริง)
 * Streetlight Inspection System | การทางพิเศษแห่งประเทศไทย สายทางกาญจนาภิเษก
 *
 * Sheet "SW_Poles" (ของจริง) — Columns:
 *   A=id  B=lat  C=lng  D=การซ่อมล่าสุด  E=รายการ  F=ผู้ซ่อม
 *   G=รูปถ่ายหน้างาน  H=ใบแจ้งงาน  I=status  J=ผู้แก้ไขล่าสุด
 *   K=วันที่อัปเดตล่าสุด  L=ทิศทาง  M=Status  N=lastUpdate  O=name
 *
 * Sheet "Maintenance" — บันทึกงานซ่อม (append)
 * Sheet "Logs"        — log การเปลี่ยนแปลง (append)
 *
 * Deploy: Extensions → Apps Script → Deploy → New Deployment → Web App
 *   Execute as: Me | Access: Anyone
 */

// ── CONFIG ───────────────────────────────────────────────────────────────────
const SPREADSHEET_ID  = '1NLhb_2HfVdmmHnYn8-gYMb1IHBg5fxTGopSgfedZIt8';
const SHEET_SW_POLES  = 'SW_Poles';
const SHEET_MAINT     = 'Maintenance';
const SHEET_LOGS      = 'Logs';

// ── Column indices (0-based) for SW_Poles ────────────────────────────────────
const COL = {
  id:            0,   // A
  lat:           1,   // B
  lng:           2,   // C
  repairDate:    3,   // D — การซ่อมล่าสุด
  repairItem:    4,   // E — รายการ
  repairBy:      5,   // F — ผู้ซ่อม
  photoUrl:      6,   // G — รูปถ่ายหน้างาน
  workOrderUrl:  7,   // H — ใบแจ้งงาน
  status:        8,   // I — status (ไฟติดAB / ไฟดับA / SP01 / HM1 ฯลฯ)
  lastEditor:    9,   // J — ผู้แก้ไขล่าสุด
  lastUpdated:  10,   // K — วันที่อัปเดตล่าสุด
  direction:    11,   // L — ทิศทาง
  statusNew:    12,   // M — Status (ล่าสุดจาก app)
  lastUpdate:   13,   // N — lastUpdate
  name:         14,   // O — name
};

// ── Status classification ─────────────────────────────────────────────────────
// Map raw "status" / "statusNew" values → traffic-light category
function classifyStatus(rawStatus) {
  if (!rawStatus) return 'pending';
  const s = String(rawStatus).trim();
  if (/^(SP|HM)\d*/i.test(s))  return 'landmark';   // marker post, no light status
  if (s.includes('ไฟติดAB'))   return 'normal';
  if (s.includes('ติดAB'))     return 'normal';
  if (s.includes('ไฟดับAB'))   return 'danger';
  if (s.includes('ดับAB'))     return 'danger';
  if (s.includes('ไฟดับA'))    return 'warning';
  if (s.includes('ไฟดับB'))    return 'warning';
  if (s.includes('ดับA'))      return 'warning';
  if (s.includes('ดับB'))      return 'warning';
  if (s.toLowerCase().includes('off')) return 'warning';
  return 'pending';
}

// ── CORS helper ───────────────────────────────────────────────────────────────
function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═════════════════════════════════════════════════════════════════════════════
// GET HANDLER
// ═════════════════════════════════════════════════════════════════════════════
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) ? e.parameter.action : 'ping';

    switch (action) {

      // ── Health check ──────────────────────────────────────────────────────
      case 'ping':
        return jsonOut({
          status: 'ok',
          message: 'GAS Backend พร้อมใช้งาน',
          sheetId: SPREADSHEET_ID,
          timestamp: new Date().toISOString()
        });

      // ── Get all SW poles (parsed from real columns) ───────────────────────
      case 'getSW':
        return jsonOut({ status: 'ok', data: _getAllSwPoles() });

      // ── Get single pole by ID ─────────────────────────────────────────────
      case 'getSwById': {
        const swId = e.parameter.swId || '';
        const all  = _getAllSwPoles();
        const found = all.find(p => String(p.id) === String(swId));
        if (!found) return jsonOut({ status: 'error', message: `ไม่พบ ${swId}` });
        return jsonOut({ status: 'ok', data: found });
      }

      // ── Get all maintenance records ───────────────────────────────────────
      case 'getMaintenance':
        return jsonOut({ status: 'ok', data: _getMaintenance() });

      // ── Get logs ──────────────────────────────────────────────────────────
      case 'getLogs':
        return jsonOut({ status: 'ok', data: _getLogs() });

      // ── Summary stats ─────────────────────────────────────────────────────
      case 'getStats': {
        const poles  = _getAllSwPoles();
        const stats  = { total: poles.length, normal: 0, warning: 0, danger: 0, pending: 0, landmark: 0 };
        poles.forEach(p => { stats[p.category] = (stats[p.category] || 0) + 1; });
        return jsonOut({ status: 'ok', data: stats });
      }

      default:
        return jsonOut({ status: 'error', message: `ไม่รู้จัก action: ${action}` });
    }
  } catch (err) {
    return jsonOut({ status: 'error', message: err.message, line: err.lineNumber });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// POST HANDLER
// Body (text/plain): JSON { action, data }
// ═════════════════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action || '';
    const data   = body.data   || {};

    switch (action) {

      // ── Update pole status (from inspection form) ─────────────────────────
      case 'updateStatus':
        return jsonOut(_updateSwStatus(data.swId, data.status, data.editor));

      // ── Add maintenance record ────────────────────────────────────────────
      case 'addMaintenance':
        return jsonOut(_addMaintenance(data));

      // ── Batch update (multiple poles at once) ─────────────────────────────
      case 'batchUpdate':
        if (!Array.isArray(data.records)) return jsonOut({ status: 'error', message: 'records must be array' });
        const results = data.records.map(r => _updateSwStatus(r.swId, r.status, r.editor));
        return jsonOut({ status: 'ok', data: results });

      default:
        return jsonOut({ status: 'error', message: `ไม่รู้จัก POST action: ${action}` });
    }
  } catch (err) {
    return jsonOut({ status: 'error', message: err.message });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

// ── Read all SW poles from SW_Poles sheet ─────────────────────────────────────
function _getAllSwPoles() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_SW_POLES);
  if (!sheet) throw new Error('ไม่พบ sheet: ' + SHEET_SW_POLES);

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  // Skip row 0 (header), parse data rows
  return rows.slice(1)
    .filter(r => r[COL.id] !== '' && r[COL.id] !== null)
    .map((r, idx) => {
      const rawId      = String(r[COL.id]).trim();
      const rawStatus  = String(r[COL.status] || '').trim();
      const rawStatusM = String(r[COL.statusNew] || '').trim(); // col M override
      const effectiveStatus = rawStatusM || rawStatus;
      const category   = classifyStatus(effectiveStatus);

      return {
        // Core location fields
        id:           rawId,
        name:         String(r[COL.name] || rawId).trim() || rawId,
        lat:          parseFloat(r[COL.lat])  || 0,
        lng:          parseFloat(r[COL.lng])  || 0,
        // Status fields
        status:       effectiveStatus,    // raw Thai text e.g. "ไฟติดAB"
        category:     category,           // normalized: normal/warning/danger/pending/landmark
        statusRaw:    rawStatus,          // col I original
        statusNew:    rawStatusM,         // col M override
        // Maintenance fields
        repairDate:   _fmtDate(r[COL.repairDate]),
        repairItem:   String(r[COL.repairItem]  || '').trim(),
        repairBy:     String(r[COL.repairBy]    || '').trim(),
        photoUrl:     String(r[COL.photoUrl]    || '').trim(),
        workOrderUrl: String(r[COL.workOrderUrl]|| '').trim(),
        // Audit fields
        lastEditor:   String(r[COL.lastEditor]  || '').trim(),
        lastUpdated:  _fmtDate(r[COL.lastUpdated]),
        lastUpdate:   _fmtDate(r[COL.lastUpdate]),
        direction:    String(r[COL.direction]   || '').trim(),
        // Row reference (1-based, accounting for header)
        _sheetRow:    idx + 2
      };
    });
}

// ── Update status for a single pole ──────────────────────────────────────────
function _updateSwStatus(swId, newStatus, editor) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_SW_POLES);
  if (!sheet) throw new Error('ไม่พบ sheet: ' + SHEET_SW_POLES);

  const data = sheet.getDataRange().getValues();
  const tz   = Session.getScriptTimeZone();
  const now  = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL.id]).trim() === String(swId).trim()) {
      const rowNum = i + 1; // 1-based
      // Write to col M (statusNew) to preserve original col I
      sheet.getRange(rowNum, COL.statusNew + 1).setValue(newStatus);
      // Update col J (lastEditor) and K (lastUpdated)
      if (editor) sheet.getRange(rowNum, COL.lastEditor  + 1).setValue(editor);
      sheet.getRange(rowNum, COL.lastUpdated + 1).setValue(now);
      sheet.getRange(rowNum, COL.lastUpdate  + 1).setValue(now);

      // Write log
      _appendLog({ swId, oldStatus: data[i][COL.statusNew] || data[i][COL.status], newStatus, editor, timestamp: now });

      return { status: 'ok', message: `อัปเดต ${swId} → ${newStatus}`, timestamp: now };
    }
  }
  return { status: 'error', message: `ไม่พบ swId: ${swId}` };
}

// ── Add maintenance record to Maintenance sheet ───────────────────────────────
function _addMaintenance(data) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet   = ss.getSheetByName(SHEET_MAINT);
  const tz    = Session.getScriptTimeZone();
  const now   = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');

  // Create sheet + header if missing
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_MAINT);
    sheet.appendRow(['timestamp','swId','รายการ','ผู้ซ่อม','สถานะก่อน','สถานะหลัง','หมายเหตุ','photoUrl','lat','lng','inspector','signature']);
    sheet.getRange(1,1,1,12).setFontWeight('bold').setBackground('#1a2d42').setFontColor('#f4a400');
  }

  sheet.appendRow([
    now,
    data.swId        || '',
    data.repairItem  || data.notes || '',
    data.repairBy    || data.inspector || '',
    data.oldStatus   || '',
    data.status      || data.newStatus || '',
    data.notes       || '',
    data.photoUrl    || '',
    data.lat         || '',
    data.lng         || '',
    data.inspector   || '',
    data.signature   || ''
  ]);

  // Also update status in SW_Poles
  if (data.swId && (data.status || data.newStatus)) {
    _updateSwStatus(data.swId, data.status || data.newStatus, data.inspector || data.repairBy);
  }

  // Update repair columns in SW_Poles (D, E, F)
  if (data.swId && data.repairItem) {
    const swSheet = ss.getSheetByName(SHEET_SW_POLES);
    if (swSheet) {
      const rows = swSheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][COL.id]).trim() === String(data.swId).trim()) {
          const r = i + 1;
          swSheet.getRange(r, COL.repairDate + 1).setValue(now);
          swSheet.getRange(r, COL.repairItem + 1).setValue(data.repairItem || '');
          swSheet.getRange(r, COL.repairBy   + 1).setValue(data.repairBy || data.inspector || '');
          break;
        }
      }
    }
  }

  return { status: 'ok', message: 'บันทึกงานซ่อมสำเร็จ', timestamp: now };
}

// ── Get maintenance records ────────────────────────────────────────────────────
function _getMaintenance() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_MAINT);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => String(h).trim());
  return rows.slice(1).filter(r => r[0]).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] !== '' ? String(r[i]) : null; });
    return obj;
  });
}

// ── Write a log entry to Logs sheet ──────────────────────────────────────────
function _appendLog(entry) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet   = ss.getSheetByName(SHEET_LOGS);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_LOGS);
      sheet.appendRow(['timestamp','swId','oldStatus','newStatus','editor']);
      sheet.getRange(1,1,1,5).setFontWeight('bold').setBackground('#0b1622').setFontColor('#f4a400');
    }
    sheet.appendRow([entry.timestamp, entry.swId, entry.oldStatus, entry.newStatus, entry.editor || '']);
  } catch(e) {
    // non-fatal: log write failure shouldn't break the main response
    console.warn('Log write failed:', e.message);
  }
}

// ── Get log entries ────────────────────────────────────────────────────────────
function _getLogs() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_LOGS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0].map(h => String(h).trim());
  return rows.slice(1).filter(r => r[0]).map(r => {
    const obj = {};
    headers.forEach((h,i) => { obj[h] = r[i] !== '' ? String(r[i]) : null; });
    return obj;
  });
}

// ── Format date cells (handles Date objects, strings, numbers) ────────────────
function _fmtDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  }
  return String(val).trim() || null;
}

// ═════════════════════════════════════════════════════════════════════════════
// MANUAL UTILITY — รันด้วยมือจาก Apps Script Editor เพื่อทดสอบ
// ═════════════════════════════════════════════════════════════════════════════
function testGetAll() {
  const poles = _getAllSwPoles();
  Logger.log('Total poles: ' + poles.length);
  Logger.log('Sample: ' + JSON.stringify(poles.slice(0,3), null, 2));
}

function testUpdateStatus() {
  const result = _updateSwStatus('HM1', 'ไฟติดAB', 'test@example.com');
  Logger.log(JSON.stringify(result));
}

function testStats() {
  const poles = _getAllSwPoles();
  const stats = { total: poles.length, normal:0, warning:0, danger:0, pending:0, landmark:0 };
  poles.forEach(p => { stats[p.category] = (stats[p.category]||0)+1; });
  Logger.log(JSON.stringify(stats, null, 2));
}
