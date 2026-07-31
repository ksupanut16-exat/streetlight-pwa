/**
 * report.js — Inspection Report List Rendering & PDF Export
 */

const ReportModule = (() => {

  // ─────────────────────────────────────────────────────────────────
  // RENDER REPORT LIST
  // ─────────────────────────────────────────────────────────────────
  async function load() {
    App.toast('กำลังโหลดรายงาน...');
    await Data.fetchInspectionsFromGAS();
    render();
  }

  function render() {
    const list = Data.inspectionList;
    const container = document.getElementById('report-list');

    // Stats
    const total  = list.length;
    const ok     = list.filter(r => r.status === 'normal').length;
    const warn   = list.filter(r => r.status === 'warning').length;
    const danger = list.filter(r => r.status === 'danger').length;

    document.getElementById('stat-total').textContent  = total;
    document.getElementById('stat-ok').textContent     = ok;
    document.getElementById('stat-warn').textContent   = warn;
    document.getElementById('stat-danger').textContent = danger;

    if (!list.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:2rem;color:#64748b;font-size:0.8rem;">
          ไม่มีข้อมูลการตรวจสอบ<br>กดปุ่ม "โหลดรายงาน" หรือบันทึกข้อมูลก่อน
        </div>`;
      return;
    }

    container.innerHTML = [...list].reverse().map(rec => {
      const statusColor = CONFIG.STATUS_COLORS[rec.status] || '#64748b';
      const statusLabel = CONFIG.STATUS_LABELS[rec.status] || rec.status;
      const dt = rec.timestamp ? new Date(rec.timestamp).toLocaleString('th-TH', {
        day: '2-digit', month: 'short', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }) : '–';
      const syncIcon = rec.syncStatus === 'ok' ? '☁️' : '⏳';

      return `
        <div class="report-card">
          <div class="status-dot" style="background:${statusColor};"></div>
          <div style="flex:1;min-width:0;">
            <div class="report-sw">${rec.swId || '–'}</div>
            <div class="report-loc">${rec.tollgateId || '–'} · ${dt}</div>
            <div class="report-status-text" style="color:${statusColor};">${statusLabel}</div>
            ${rec.notes ? `<div style="font-size:0.68rem;color:#64748b;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${rec.notes}</div>` : ''}
          </div>
          <div style="font-size:0.7rem;color:#64748b;display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            <span>${syncIcon}</span>
            <span>${rec.inspector || '–'}</span>
          </div>
        </div>`;
    }).join('');
  }

  // ─────────────────────────────────────────────────────────────────
  // PDF EXPORT (jsPDF)
  // ─────────────────────────────────────────────────────────────────
  function exportPDF() {
    if (typeof window.jspdf === 'undefined') {
      App.toast('กำลังโหลด jsPDF...');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const list = Data.inspectionList;

    // ── Header ──────────────────────────────────────────────────
    doc.setFillColor(11, 22, 34);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(244, 164, 0);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Streetlight Inspection Report', 10, 12);
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(8);
    doc.text('การทางพิเศษแห่งประเทศไทย — สายทางกาญจนาภิเษก', 10, 19);
    doc.text(`Generated: ${new Date().toLocaleString('th-TH')}`, 10, 24);

    // ── Summary stats ───────────────────────────────────────────
    let y = 38;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    const total  = list.length;
    const ok     = list.filter(r => r.status === 'normal').length;
    const warn   = list.filter(r => r.status === 'warning').length;
    const danger = list.filter(r => r.status === 'danger').length;

    doc.text(`Total Inspections: ${total}   Normal: ${ok}   Warning: ${warn}   Danger: ${danger}`, 10, y);
    y += 8;

    // ── Table header ─────────────────────────────────────────────
    doc.setFillColor(26, 45, 66);
    doc.rect(8, y, 194, 7, 'F');
    doc.setTextColor(244, 164, 0);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    const cols = [10, 42, 75, 100, 128, 152, 190];
    ['SW ID', 'Tollgate', 'Status', 'Bulb', 'Pole', 'Inspector', 'Date'].forEach((h, i) => {
      doc.text(h, cols[i], y + 5);
    });
    y += 10;

    // ── Table rows ────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);

    list.forEach((rec, idx) => {
      if (y > 270) { doc.addPage(); y = 20; }
      const fill = idx % 2 === 0 ? [245, 247, 250] : [255, 255, 255];
      doc.setFillColor(...fill);
      doc.rect(8, y - 3, 194, 7, 'F');

      const statusCol = { normal: [34, 197, 94], warning: [244, 164, 0], danger: [239, 68, 68] };
      const c = statusCol[rec.status] || [100, 116, 139];
      doc.setTextColor(...c);
      doc.text(rec.swId || '–', cols[0], y + 2);
      doc.setTextColor(30, 30, 30);
      doc.text(rec.tollgateId || '–', cols[1], y + 2);
      doc.setTextColor(...c);
      doc.text(CONFIG.STATUS_LABELS[rec.status] || rec.status, cols[2], y + 2);
      doc.setTextColor(30, 30, 30);
      doc.text(rec.bulb || '–', cols[3], y + 2);
      doc.text(rec.pole || '–', cols[4], y + 2);
      doc.text((rec.inspector || '–').substring(0, 15), cols[5], y + 2);
      const d = rec.timestamp ? new Date(rec.timestamp).toLocaleDateString('th-TH') : '–';
      doc.text(d, cols[6], y + 2);
      y += 8;
    });

    // ── Footer ────────────────────────────────────────────────────
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text(`EXP Streetlight Inspection System v${CONFIG.VERSION}`, 10, 285);

    const filename = `inspection_report_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
    App.toast(`📄 Export: ${filename}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────
  return { load, render, exportPDF };
})();
