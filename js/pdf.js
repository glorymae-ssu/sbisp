// =====================================================================
// SBISP | pdf.js
// One place that turns any list of records into a PDF report (barangay header, tables, totals,
// "Prepared by" and "Noted by" lines, page numbers). Only the Barangay Treasurer and the Barangay Secretary
// get the Generate PDF buttons (see canPdf).
// If the PDF library cannot be loaded (for example no internet), the report opens in the print window
// so it can still be saved as a PDF from there.
// =====================================================================
import { esc, reportHeader, table, printHTML, previewReport } from './admin-features.js';

export const canPdf = me => !!me && !me.is_pb && ['employee', 'treasurer'].includes(me.role);
export const roleName = me => ({ employee: 'Barangay Secretary', treasurer: 'Barangay Treasurer', admin: 'Administrator' }[me?.role] || 'Staff');
export const pesos = n => 'PHP ' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = v => String(v ?? '').replace(/₱/g, 'PHP ').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');

const loadScript = src => new Promise((ok, no) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load ' + src)); document.head.appendChild(s);
});
async function library() {
  if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  if (!jsPDF.API.autoTable) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  return jsPDF;
}
let logoData = null;
async function logo() {
  if (logoData !== null) return logoData;
  try {
    const img = new Image(); img.src = 'logo.png'; await img.decode();
    const c = document.createElement('canvas'); c.width = 160; c.height = 160; c.getContext('2d').drawImage(img, 0, 0, 160, 160);
    logoData = c.toDataURL('image/png');
  } catch (e) { logoData = ''; }
  return logoData;
}

/**
 * generatePdf({ title, subtitle, summary: [[label, value]], sections: [{ heading, columns, rows, foot, align }],
 *               landscape, filename, me })
 * Returns true when a PDF file was created, false when the print window was used instead.
 */
const cell = (c, a) => `<td style="text-align:${a || 'left'}">${esc(c)}</td>`;
function reportHtml(o) {
  const { title, subtitle = '', summary = [], sections = [], me } = o;
  const stamp = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });
  return reportHeader(title, subtitle) + `<p style="text-align:center;font-style:italic;font-size:12px;margin:0 0 8px">Generated ${esc(stamp)}</p>`
    + (summary.length ? `<table style="margin:8px 0;border:0">${summary.map(([a, b]) => `<tr><td style="border:0;padding:2px 12px 2px 0"><b>${esc(a)}</b></td><td style="border:0">${esc(b)}</td></tr>`).join('')}</table>` : '')
    + sections.map(s => { const al = s.align || [];
      return (s.heading ? `<h3 style="margin:14px 0 4px">${esc(s.heading)}</h3>` : '')
        + `<table><tr>${s.columns.map((h, i) => `<th style="text-align:${al[i] || 'left'}">${esc(h)}</th>`).join('')}</tr>`
        + (s.rows.length ? s.rows : [['None']]).map(r => `<tr>${r.map((c, i) => cell(c, al[i])).join('')}</tr>`).join('')
        + (s.foot ? `<tr style="font-weight:bold;background:#E7F5E4">${s.foot.map((c, i) => cell(c, al[i])).join('')}</tr>` : '') + '</table>'; }).join('')
    + `<div style="margin-top:36px;display:flex;justify-content:space-between"><span>Prepared by:<br><br><b>${esc((me?.full_name || '').toUpperCase())}</b><br>${esc(roleName(me))}</span><span>Noted by:<br><br><b>PUNONG BARANGAY</b></span></div>`;
}

/** Shows the report on screen first. The person can then Print it or Download it as a PDF. */
export async function generatePdf(o) {
  previewReport(reportHtml(o), o.filename || 'SBISP-Report', () => buildPdf(o));
  return true;
}

async function buildPdf(o) {
  const { title, subtitle = '', summary = [], sections = [], landscape = false, filename = 'SBISP-Report', me } = o;
  const stamp = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });
  try {
    const jsPDF = await library();
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
    const img = await logo();
    if (img) { try { doc.addImage(img, 'PNG', M, 28, 56, 56); } catch (e) { /* no logo */ } }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    ['Republic of the Philippines', 'Province of Samar', 'City of Catbalogan'].forEach((t, i) => doc.text(t, W / 2, 36 + i * 11, { align: 'center' }));
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('BARANGAY GUINSORONGAN', W / 2, 72, { align: 'center' });
    doc.setFontSize(9); doc.text('OFFICE OF THE PUNONG BARANGAY', W / 2, 84, { align: 'center' });
    doc.setDrawColor(27, 138, 46); doc.setLineWidth(1.2); doc.line(M, 94, W - M, 94);
    doc.setFontSize(13); doc.text(safe(title), W / 2, 116, { align: 'center' });
    let y = 128;
    if (subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(safe(subtitle), W / 2, y + 4, { align: 'center' }); y += 16; }
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.text('Generated ' + safe(stamp), W / 2, y + 6, { align: 'center' }); y += 20;

    const head = { fillColor: [27, 138, 46], textColor: 255, fontSize: 8.5 };
    if (summary.length) {
      doc.autoTable({ startY: y, body: summary.map(([a, b]) => [safe(a), safe(b)]), theme: 'plain', styles: { fontSize: 9.5, cellPadding: 3 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 170 } }, margin: { left: M, right: M } });
      y = doc.lastAutoTable.finalY + 12;
    }
    for (const s of sections) {
      if (s.heading) {
        if (y > H - 110) { doc.addPage(); y = M; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(27, 90, 40); doc.text(safe(s.heading), M, y + 2); doc.setTextColor(0); y += 8;
      }
      const align = s.align || [];
      doc.autoTable({ startY: y, head: [s.columns.map(safe)], body: (s.rows.length ? s.rows : [['None']]).map(r => r.map(safe)),
        foot: s.foot ? [s.foot.map(safe)] : undefined, showFoot: 'lastPage', headStyles: head, footStyles: { fillColor: [231, 245, 228], textColor: 20, fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 3.5, overflow: 'linebreak' }, alternateRowStyles: { fillColor: [247, 250, 247] },
        columnStyles: Object.fromEntries(align.map((a, i) => [i, { halign: a }])), margin: { left: M, right: M, bottom: 50 } });
      y = doc.lastAutoTable.finalY + 16;
    }
    // signature lines
    if (y > H - 130) { doc.addPage(); y = M + 10; } else y += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const x1 = M, x2 = W / 2 + 20, lw = 200;
    doc.text('Prepared by:', x1, y); doc.text('Noted by:', x2, y); y += 38;
    doc.setLineWidth(0.6); doc.setDrawColor(60); doc.line(x1, y, x1 + lw, y); doc.line(x2, y, x2 + lw, y);
    doc.setFont('helvetica', 'bold'); doc.text(safe((me?.full_name || '').toUpperCase()), x1, y + 12); doc.text('PUNONG BARANGAY', x2, y + 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(safe(roleName(me)), x1, y + 23);
    // page numbers
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(110); doc.text(`SBISP - Barangay Guinsorongan   |   Page ${i} of ${pages}`, W / 2, H - 24, { align: 'center' }); }
    doc.save(`${filename}-${new Date().toISOString().slice(0, 10)}.pdf`);
    return true;
  } catch (e) {
    // fallback: print window ("Save as PDF" from the print dialog)
    const html = reportHeader(title, subtitle)
      + (summary.length ? `<table style="margin:8px 0">${summary.map(([a, b]) => `<tr><td style="padding:2px 12px 2px 0"><b>${esc(a)}</b></td><td>${esc(b)}</td></tr>`).join('')}</table>` : '')
      + sections.map(s => (s.heading ? `<h3 style="margin:14px 0 4px">${esc(s.heading)}</h3>` : '') + table(s.columns, s.foot ? [...s.rows, s.foot] : s.rows)).join('')
      + `<p style="margin-top:36px;display:flex;justify-content:space-between"><span>Prepared by:<br><br><b>${esc((me?.full_name || '').toUpperCase())}</b><br>${esc(roleName(me))}</span><span>Noted by:<br><br><b>PUNONG BARANGAY</b></span></p>`;
    printHTML(html, filename);
    return false;
  }
}
