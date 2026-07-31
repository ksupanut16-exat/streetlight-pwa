/**
 * Code.gs — Google Apps Script Backend
 * Streetlight Inspection System | การทางพิเศษแห่งประเทศไทย สายทางกาญจนาภิเษก
 *
 * Sheet structure expected:
 *   Sheet "SW_Poles"     — Master pole data (read)
 *   Sheet "Inspections"  — Inspection records (read/write)
 *
 * Deploy as: Extensions → Apps Script → Deploy → Web App
 *   Execute as: Me | Access: Anyone (or Anyone with Google Account for private)
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — Replace with your actual Spreadsheet ID
// ─────────────────────────────────────────────────────────────────────────────
const SPREADSHEET_ID = 'YOUR_GOOGLE_SHEETS_ID_HERE';

const SHEET_SW_POLES    = 'SW_Poles';
const SHEET_INSPECTIONS = 'Inspections';

// ─────────────────────────────────────────────────────────────────────────────
// CORS HEADERS helper — required for Fetch from the PWA
// ─────────────────────────────────────────────────────────────────────────────
function _corsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET HANDLER
// Routing via ?action=<action>
// ─────────────────────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action || 'ping';

    switch (action) {
      case 'ping':
        return _corsResponse({ status: 'ok', message: 'GAS is alive', timestamp: new Date().toISOString() });

      case 'getSW':
        return _corsResponse({ status: 'ok', data: _getSwPoles() });

      case 'getInspections':
        return _corsResponse({ status: 'ok', data: _getInspections() });

      case 'getSwById': {
        const swId = e.parameter.swId;
        if (!swId) return _corsResponse({ status: 'error', message: 'Missing swId param' });
        const found = _getSwPoles().filter(r => r.id === swId);
        return _corsResponse({ status: 'ok', data: found });
      }

      default:
        return _corsResponse({ status: 'error', message: `Unknown action: ${action}` });
    }
  } catch (err) {
    return _corsResponse({ status: 'error', message: err.message, stack: err.stack });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST HANDLER
// Body is JSON string: { action: '...', data: {...} }
// GAS does not support JSON content-type without a workaround, so the PWA
// sends body as text/plain and we parse it here.
// ─────────────────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action || '';
    const data   = body.data   || {};

    switch (action) {
      case 'addInspection':
        return _corsResponse(_addInspection(data));

      case 'updateSwStatus':
        return _corsResponse(_updateSwStatus(data.swId, data.status));

      default:
        return _corsResponse({ status: 'error', message: `Unknown POST action: ${action}` });
    }
  } catch (err) {
    return _corsResponse({ status: 'error', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET READER — SW_Poles
// Expected columns (row 1 = header):
//   id | name | tollgate | lat | lng | km | status | lastChecked
// ─────────────────────────────────────────────────────────────────────────────
function _getSwPoles() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_SW_POLES);
  if (!sheet) throw new Error(`Sheet "${SHEET_SW_POLES}" not found`);

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => String(h).trim().toLowerCase());
  return rows.slice(1)
    .filter(row => row[0]) // skip empty rows
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
      return {
        id:          String(obj.id || ''),
        name:        String(obj.name || ''),
        tollgate:    String(obj.tollgate || ''),
        lat:         parseFloat(obj.lat) || 0,
        lng:         parseFloat(obj.lng) || 0,
        km:          String(obj.km || ''),
        status:      String(obj.status || 'pending'),
        lastChecked: obj.lastchecked ? String(obj.lastchecked) : null
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET READER — Inspections
// Expected columns (row 1 = header):
//   id | swId | tollgateId | status | bulb | pole | notes | inspector |
//   lat | lng | signature | timestamp | syncStatus
// ─────────────────────────────────────────────────────────────────────────────
function _getInspections() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_INSPECTIONS);
  if (!sheet) throw new Error(`Sheet "${SHEET_INSPECTIONS}" not found`);

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1)
    .filter(row => row[0])
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
      return {
        id:          String(obj.id          || ''),
        swId:        String(obj.swid        || ''),
        tollgateId:  String(obj.tollgateid  || ''),
        status:      String(obj.status      || ''),
        bulb:        String(obj.bulb        || ''),
        pole:        String(obj.pole        || ''),
        notes:       String(obj.notes       || ''),
        inspector:   String(obj.inspector   || ''),
        lat:         parseFloat(obj.lat)    || null,
        lng:         parseFloat(obj.lng)    || null,
        timestamp:   obj.timestamp ? String(obj.timestamp) : null,
        syncStatus:  'ok'
        // signature omitted from list response (base64 too large)
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE — Add Inspection record
// ─────────────────────────────────────────────────────────────────────────────
function _addInspection(data) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_INSPECTIONS);
  if (!sheet) throw new Error(`Sheet "${SHEET_INSPECTIONS}" not found`);

  // Ensure header row exists
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.appendRow([
      'id','swId','tollgateId','status','bulb','pole',
      'notes','inspector','lat','lng','signature','timestamp','syncStatus'
    ]);
  }

  sheet.appendRow([
    data.id          || `INSP-${Date.now()}`,
    data.swId        || '',
    data.tollgateId  || '',
    data.status      || '',
    data.bulb        || '',
    data.pole        || '',
    data.notes       || '',
    data.inspector   || '',
    data.lat         || '',
    data.lng         || '',
    data.signature   || '',
    data.timestamp   || new Date().toISOString(),
    'ok'
  ]);

  // Also update the SW_Poles sheet with the new status
  if (data.swId && data.status) {
    _updateSwStatus(data.swId, data.status);
  }

  return { status: 'ok', message: 'Inspection saved', id: data.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE — Update SW pole status in SW_Poles sheet
// ─────────────────────────────────────────────────────────────────────────────
function _updateSwStatus(swId, newStatus) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_SW_POLES);
  if (!sheet) throw new Error(`Sheet "${SHEET_SW_POLES}" not found`);

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const idCol   = headers.indexOf('id');
  const statCol = headers.indexOf('status');
  const dateCol = headers.indexOf('lastchecked');

  if (idCol < 0 || statCol < 0) {
    return { status: 'error', message: 'Column "id" or "status" not found in SW_Poles' };
  }

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(swId)) {
      sheet.getRange(i + 1, statCol + 1).setValue(newStatus);
      if (dateCol >= 0) {
        sheet.getRange(i + 1, dateCol + 1).setValue(
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
        );
      }
      return { status: 'ok', message: `Updated ${swId} → ${newStatus}` };
    }
  }
  return { status: 'error', message: `SW ID "${swId}" not found in SW_Poles` };
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — Initialize sheets with headers (run once manually)
// ─────────────────────────────────────────────────────────────────────────────
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // SW_Poles sheet
  let swSheet = ss.getSheetByName(SHEET_SW_POLES);
  if (!swSheet) swSheet = ss.insertSheet(SHEET_SW_POLES);
  if (swSheet.getLastRow() === 0) {
    swSheet.appendRow(['id','name','tollgate','lat','lng','km','status','lastChecked']);
    swSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1a2d42').setFontColor('#f4a400');
    // Sample data rows
    const sampleSw = [
      ['SW-KAE-001','เสาไฟ SW-KAE-001','TG-KAE-01',13.8621,100.4102,'กม. 0+050','normal','2025-06-01'],
      ['SW-KAE-002','เสาไฟ SW-KAE-002','TG-KAE-01',13.8639,100.4118,'กม. 0+150','warning','2025-06-01'],
      ['SW-KAE-003','เสาไฟ SW-KAE-003','TG-KAE-01',13.8658,100.4135,'กม. 0+250','normal','2025-06-01'],
    ];
    swSheet.getRange(2, 1, sampleSw.length, 8).setValues(sampleSw);
  }

  // Inspections sheet
  let inspSheet = ss.getSheetByName(SHEET_INSPECTIONS);
  if (!inspSheet) inspSheet = ss.insertSheet(SHEET_INSPECTIONS);
  if (inspSheet.getLastRow() === 0) {
    inspSheet.appendRow(['id','swId','tollgateId','status','bulb','pole','notes','inspector','lat','lng','signature','timestamp','syncStatus']);
    inspSheet.getRange(1,1,1,13).setFontWeight('bold').setBackground('#1a2d42').setFontColor('#f4a400');
  }

  SpreadsheetApp.getUi().alert('✅ Sheets initialized successfully!');
}
