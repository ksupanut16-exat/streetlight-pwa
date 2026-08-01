/**
 * report.js — PDF Export (v2 — ตรงกับข้อมูลจริง)
 */

const ReportModule = (() => {

  function exportPDF() {
    if (typeof window.jspdf === 'undefined') { App.toast('โหลด jsPDF...'); return; }
    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const poles = Data.swList;
    const now   = new Date().toLocaleString('th-TH');

    const CAT_COL = { normal:[34,197,94], warning:[244,164,0], danger:[239,68,68],
                      landmark:[0,188,212], pending:[100,116,139] };

    // ── Header ──
    doc.setFillColor(11, 22, 34);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(244, 164, 0); doc.setFontSize(13); doc.setFont('helvetica','bold');
    doc.text('Streetlight Inspection Report', 10, 11);
    doc.setTextColor(180,180,180); doc.setFontSize(8); doc.setFont('helvetica','normal');
    doc.text('การทางพิเศษแห่งประเทศไทย — สายทางกาญจนาภิเษก', 10, 18);
    doc.text(`ออกรายงาน: ${now}  |  เสาทั้งหมด: ${poles.length} เสา`, 10, 23);

    // ── Stats bar ──
    let y = 36;
    const counts = {normal:0,warning:0,danger:0,pending:0,landmark:0};
    poles.forEach(p => { counts[p.category]=(counts[p.category]||0)+1; });
    doc.setFontSize(8); doc.setFont('helvetica','bold');
    const stats = [
      {label:'ไฟติดปกติ',  val:counts.normal,   col:[34,197,94]},
      {label:'ดับบางส่วน', val:counts.warning,  col:[244,164,0]},
      {label:'ดับทั้งหมด', val:counts.danger,   col:[239,68,68]},
      {label:'เสาหลัก',    val:counts.landmark, col:[0,188,212]},
      {label:'ยังไม่ตรวจ', val:counts.pending,  col:[100,116,139]},
    ];
    stats.forEach((s, i) => {
      const x = 10 + i * 38;
      doc.setFillColor(...s.col); doc.roundedRect(x, y, 35, 9, 2, 2, 'F');
      doc.setTextColor(255,255,255);
      doc.text(`${s.val} ${s.label}`, x+2, y+6);
    });
    y += 16;

    // ── Table header ──
    doc.setFillColor(26,45,66);
    doc.rect(8, y, 194, 6.5, 'F');
    doc.setTextColor(244,164,0); doc.setFontSize(7); doc.setFont('helvetica','bold');
    const cols = [10, 28, 65, 105, 130, 165, 192];
    ['ID','สถานะ','รายการซ่อม','ผู้ซ่อม','แก้ไขโดย','วันที่อัปเดต','ทิศ'].forEach((h,i) => {
      doc.text(h, cols[i], y+4.5);
    });
    y += 9;

    // ── Rows ──
    doc.setFont('helvetica','normal');
    poles.forEach((p, idx) => {
      if (y > 272) { doc.addPage(); y = 15; }
      const bg = idx%2===0 ? [245,248,252] : [255,255,255];
      doc.setFillColor(...bg); doc.rect(8, y-2.5, 194, 7, 'F');

      const cc = CAT_COL[p.category] || [100,116,139];
      doc.setTextColor(...cc); doc.setFont('helvetica','bold');
      doc.text(String(p.id), cols[0], y+2);
      const statusTxt = (p.statusNew || p.status || '–').substring(0,16);
      doc.text(statusTxt, cols[1], y+2);

      doc.setTextColor(40,40,40); doc.setFont('helvetica','normal');
      doc.text((p.repairItem||'–').substring(0,22), cols[2], y+2);
      doc.text((p.repairBy||'–').substring(0,14), cols[3], y+2);
      doc.text((p.lastEditor||'–').substring(0,16), cols[4], y+2);
      doc.text((p.lastUpdated||p.lastUpdate||'–').substring(0,14), cols[5], y+2);
      doc.text((p.direction||'–').substring(0,4), cols[6], y+2);
      y += 7;
    });

    // ── Footer ──
    doc.setFontSize(6); doc.setTextColor(150,150,150);
    doc.text(`EXP Streetlight Inspection System v2.0 | Sheet: 1NLhb_2HfVdm...`, 10, 288);

    const fname = `EXP_report_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fname);
    App.toast(`📄 ${fname}`);
  }

  return { exportPDF };
})();
