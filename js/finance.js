// =====================================================================
// SBISP | finance.js
// Financial records (collections), by account:
//   Treasurer               -> records payments, voids a wrong entry, sees everything, generates PDF reports
//   Secretary               -> sees everything, generates PDF reports
//   Administrator           -> sees everything
//   Punong Barangay, Kagawad -> figures only (today, daily, monthly, yearly totals)
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc, getFees } from './admin-features.js';
import { generatePdf, canPdf, pesos } from './pdf.js';

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const METHODS = ['Cash', 'GCash', 'Bank transfer', 'Other'];
const money = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = d => d.toISOString().slice(0, 10);
const nice = d => new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const opts = (list, val) => list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const note = (t, k = '') => `<div class="msg ${k}">${esc(t)}</div>`;

export async function mountFinance(el, me) {
  const mode = me.is_pb || me.role === 'kagawad' ? 'figures' : me.role === 'treasurer' ? 'record' : 'detail';
  const pdf = canPdf(me);
  const today = new Date(), thisYear = today.getFullYear();
  let tab = 'summary', year = thisYear, month = today.getMonth() + 1, sum = null, tx = [], from = ymd(new Date(thisYear, today.getMonth(), 1)), to = ymd(today), q = '', flash = '', fees = {}, unpaid = [], reqs = [], rf = 'all';
  el.innerHTML = '<p class="muted">Loading…</p>';
  try { fees = (await getFees()) || {}; } catch (e) { fees = {}; }

  const loadSummary = async () => { const r = await supabase.rpc('fin_summary', { p_year: year, p_month: month }); if (r.error) { flash = note(r.error.message + ' (Run sbisp-finance.sql in Supabase if you have not yet.)', 'er'); sum = null; } else sum = r.data; };
  const loadTx = async () => { const r = await supabase.rpc('fin_list', { p_from: from, p_to: to }); if (r.error) { flash = note(r.error.message, 'er'); tx = []; } else tx = r.data || []; };
  const loadUnpaid = async () => { if (mode !== 'record') return; const r = await supabase.rpc('fin_unpaid_requests'); unpaid = r.error ? [] : (r.data || []); };

  const loadReq = async () => { if (mode !== 'record') return; const r = await supabase.rpc('fin_requests_overview'); if (r.error) { flash = note(r.error.message + ' (Run the fin_requests_overview SQL in Supabase if you have not yet.)', 'er'); reqs = []; } else reqs = r.data || []; };

  const nav = () => `<div class="cp-chips">${[['summary', 'Collection'], ...(mode !== 'figures' ? [['tx', 'Transactions']] : []), ...(mode === 'record' ? [['req', 'Requests']] : []), ...(pdf ? [['reports', 'Reports (PDF)']] : [])]
    .map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const paint = body => { el.innerHTML = `${mode === 'figures' ? '<p class="muted">Collection figures for transparency. Individual records are not shown to this account.</p>' : ''}${nav()}${flash}${body}`; flash = '';
    el.querySelectorAll('.cp-chips button').forEach(b => { b.onclick = () => go(b.dataset.t); }); };
  const go = async t => { tab = t; el.innerHTML = '<p class="muted">Loading…</p>'; if (t === 'summary') await loadSummary(); if (t === 'tx') await loadTx(); if (t === 'req') await loadReq(); if (t === 'reports') await loadSummary(); draw(); };

  /* ---------------- collection figures */
  const kpi = (l, o) => `<div class="fn-k"><small>${l}</small><b>${money(o?.total)}</b><span>${o?.n || 0} receipt${(o?.n || 0) === 1 ? '' : 's'}</span></div>`;
  const tbl = (head, rows, total) => `<div class="ml-wrap"><table class="ml-t"><tr>${head.map((h, i) => `<th ${i ? 'style="text-align:right"' : ''}>${h}</th>`).join('')}</tr>
    ${rows.map(r => `<tr>${r.map((c, i) => `<td ${i ? 'style="text-align:right"' : ''}>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}">No collection yet.</td></tr>`}
    ${total ? `<tr class="fn-tot">${total.map((c, i) => `<td ${i ? 'style="text-align:right"' : ''}>${c}</td>`).join('')}</tr>` : ''}</table></div>`;
  const yearsList = () => Array.from({ length: 6 }, (_, i) => thisYear - i);
  const summaryView = () => {
    if (!sum) return '';
    const dsum = (sum.daily || []).reduce((a, x) => ({ n: a.n + x.n, total: a.total + Number(x.total) }), { n: 0, total: 0 });
    const msum = (sum.monthly || []).reduce((a, x) => ({ n: a.n + x.n, total: a.total + Number(x.total) }), { n: 0, total: 0 });
    return `<div class="fn-sel"><select id="fn-y">${opts(yearsList(), year)}</select><select id="fn-m">${opts(MON.map((n, i) => [i + 1, n]), month)}</select></div>
      <div class="fn-kpis">${kpi('TODAY', sum.today)}${kpi(MON[month - 1].toUpperCase() + ' ' + year, sum.month)}${kpi('YEAR ' + year, sum.year)}</div>
      <div class="an-card"><b>Daily collection · ${MON[month - 1]} ${year}</b>${tbl(['Date', 'Receipts', 'Collection'], (sum.daily || []).map(x => [nice(x.d), x.n, money(x.total)]), ['Total', dsum.n, money(dsum.total)])}</div>
      <div class="an-card"><b>Monthly collection · ${year}</b>${tbl(['Month', 'Receipts', 'Collection'], (sum.monthly || []).map(x => [MON[x.m - 1], x.n, money(x.total)]), ['Total', msum.n, money(msum.total)])}</div>
      <div class="an-card"><b>Yearly collection</b>${tbl(['Year', 'Receipts', 'Collection'], (sum.yearly || []).map(x => [x.y, x.n, money(x.total)]))}</div>
      <div class="an-card"><b>By service · ${year}</b>${tbl(['Service', 'Receipts', 'Collection'], (sum.service_year || []).map(x => [esc(x.service), x.n, money(x.total)]))}</div>`;
  };

  /* ---------------- transactions + record payment */
  const txView = () => {
    const l = tx.filter(r => !q || [r.or_no, r.payer_name, r.service, r.request_ref, r.recorded_by_name].join(' ').toLowerCase().includes(q));
    const tot = l.filter(r => r.status === 'recorded').reduce((s, r) => s + Number(r.amount), 0);
    return `${mode === 'record' ? '<button class="cp-g" id="fn-new">+ Record Payment</button>' : ''}
      <div class="cp-form"><div class="cp-r"><span>FROM</span><input type="date" id="fn-f" value="${from}" style="max-width:48%"></div><div class="cp-r"><span>TO</span><input type="date" id="fn-t" value="${to}" style="max-width:48%"></div>
        <input id="fn-q" placeholder="Search OR number, payer or service…" value="${esc(q)}" autocomplete="off" style="margin-top:6px"></div>
      <p class="muted"><b>${l.filter(r => r.status === 'recorded').length}</b> receipts · total <b>${money(tot)}</b> (voided entries are not counted)</p>
      ${l.map(r => `<div class="cp-card ${r.status === 'voided' ? 'voided' : ''}" style="cursor:default"><div class="cp-top"><b style="color:#111">${money(r.amount)} · ${esc(r.service)}</b>
          ${r.status === 'voided' ? '<span class="cp-chip rj">VOID</span>' : '<span class="cp-chip rc">RECORDED</span>'}</div>
        <small class="muted">${esc(r.or_no)} · ${nice(r.paid_on)} · ${esc(r.method)}</small><p style="margin:6px 0 0">${esc(r.payer_name)}${r.request_ref ? ' <small class="muted">(request ' + esc(r.request_ref) + ')</small>' : ''}</p>
        ${r.remarks ? `<small class="muted">${esc(r.remarks)}</small>` : ''}${r.void_reason ? `<p class="muted" style="margin:6px 0 0">Voided: ${esc(r.void_reason)}</p>` : ''}
        <div class="cp-foot"><span>Recorded by ${esc(r.recorded_by_name || '—')}</span>${mode === 'record' && r.status === 'recorded' ? `<a href="#" class="fn-void" data-id="${r.id}" style="color:#C62828;font-weight:700">Void</a>` : ''}</div></div>`).join('') || '<p class="muted">No records in this period.</p>'}`;
  };
  const formView = (d = {}, err = '') => {
    const svc = Object.keys(fees);
    d = { req: '', date: ymd(today), payer: '', service: svc[0] || 'Barangay Clearance', other: '', amount: fees[svc[0]] ?? '', method: 'Cash', or: '', remarks: '', ...d };
    return `<a href="#" id="fn-bk">‹ Back to transactions</a>${err ? note(err, 'er') : ''}
      <div class="cp-form"><label>LINK TO A SERVICE REQUEST (OPTIONAL)</label><select id="fm-r"><option value="">No request (walk-in or other payment)</option>
          ${unpaid.map(u => `<option value="${u.id}" ${u.id === d.req ? 'selected' : ''}>${esc(u.ref)} · ${esc(u.service)} · ${esc(u.resident_name || '')} (${money(u.fee)})</option>`).join('')}</select>
        <label>DATE OF PAYMENT</label><input type="date" id="fm-d" value="${esc(d.date)}" max="${ymd(today)}">
        <label>PAYER NAME</label><input id="fm-p" value="${esc(d.payer)}" placeholder="Full name of the person who paid">
        <label>PAYMENT FOR</label><select id="fm-s">${opts([...svc, 'Other'], d.service)}</select>
        <div id="fm-o" style="${d.service === 'Other' ? '' : 'display:none'}"><label>SPECIFY</label><input id="fm-ot" value="${esc(d.other)}" placeholder="e.g. Barangay ID, event permit"></div>
        <label>AMOUNT (PHP)</label><input id="fm-a" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(d.amount)}">
        <label>PAYMENT METHOD</label><select id="fm-m">${opts(METHODS, d.method)}</select>
        <label>OFFICIAL RECEIPT NO. (OPTIONAL, AUTO-NUMBERED IF EMPTY)</label><input id="fm-or" value="${esc(d.or)}" placeholder="e.g. 0012345">
        <label>REMARKS (OPTIONAL)</label><input id="fm-rm" value="${esc(d.remarks)}"></div>
      <button class="cp-g" id="fm-go">Save Payment Record</button>`;
  };

  /* ---------------- requested documents (read-only, for transparency) */
  const STL = { for_review: 'FOR REVIEW', ready: 'READY FOR CLAIM', released: 'RELEASED', rejected: 'REJECTED' };
  const reqView = () => {
    const owed = r => Number(r.fee) > 0 && !r.paid && r.status !== 'rejected';
    const by = {};
    reqs.forEach(r => { const k = r.service || 'Other'; const v = by[k] = by[k] || { n: 0, paid: 0, unpaid: 0 }; v.n++; if (r.paid) v.paid++; else if (owed(r)) v.unpaid++; });
    const tot = Object.values(by).reduce((a, v) => ({ n: a.n + v.n, paid: a.paid + v.paid, unpaid: a.unpaid + v.unpaid }), { n: 0, paid: 0, unpaid: 0 });
    const list = reqs.filter(r => rf === 'all' || (rf === 'paid' && r.paid) || (rf === 'unpaid' && owed(r)));
    return `${note('Read-only list of the documents requested by residents, shown for transparency. Record payments under Transactions.')}
      <div class="an-card"><b>Documents requested</b>${tbl(['Document', 'Requested', 'Paid', 'Unpaid'], Object.entries(by).map(([k, v]) => [esc(k), v.n, v.paid, v.unpaid]), ['Total', tot.n, tot.paid, tot.unpaid])}</div>
      <div class="fn-sel"><select id="rq-f">${opts([['all', 'All requests'], ['paid', 'Paid only'], ['unpaid', 'Waiting for payment']], rf)}</select></div>
      ${list.map(r => `<div class="cp-card" style="cursor:default"><div class="cp-top"><b style="color:#111">${esc(r.service)}</b><span class="cp-chip ${r.paid ? 'rc' : owed(r) ? 'fr' : 'rl'}">${r.paid ? 'PAID' : owed(r) ? 'UNPAID' : (Number(r.fee) > 0 ? esc(STL[r.status] || '') : 'NO FEE')}</span></div>
        <small class="muted">${esc(r.ref)} · ${nice(r.created_at)}</small><p style="margin:6px 0 0">${esc(r.resident_name || '-')}</p>
        <div class="cp-foot"><span>${Number(r.fee) > 0 ? money(r.fee) : 'No fee'} · ${esc(STL[r.status] || r.status)}</span><span>${r.paid ? 'OR ' + esc(r.or_no || '') : ''}</span></div></div>`).join('') || '<p class="muted">No requests found.</p>'}`;
  };

  /* ---------------- reports (PDF) */
  const reportsView = () => `<p class="muted">View the report on screen first, then print it or download it as a PDF.</p>
    <div class="an-card"><b>Daily Collection Report</b><div class="cp-r"><span>DATE</span><input type="date" id="rp-d" value="${ymd(today)}" max="${ymd(today)}" style="max-width:55%"></div><button class="cp-g" data-r="daily">View &amp; Print</button></div>
    <div class="an-card"><b>Monthly Collection Report</b><div class="cp-r"><span>MONTH</span><span style="display:flex;gap:6px;max-width:70%"><select id="rp-m">${opts(MON.map((n, i) => [i + 1, n]), month)}</select><select id="rp-my">${opts(yearsList(), year)}</select></span></div><button class="cp-g" data-r="monthly">View &amp; Print</button></div>
    <div class="an-card"><b>Yearly Collection Report</b><div class="cp-r"><span>YEAR</span><select id="rp-y" style="max-width:40%">${opts(yearsList(), year)}</select></div><button class="cp-g" data-r="yearly">View &amp; Print</button></div>
    <div class="an-card"><b>Collection Register (all receipts)</b><div class="cp-r"><span>FROM</span><input type="date" id="rp-f" value="${from}" style="max-width:48%"></div><div class="cp-r"><span>TO</span><input type="date" id="rp-t" value="${to}" style="max-width:48%"></div>
      <button class="cp-g" data-r="register">View &amp; Print</button></div>`;

  const run = async kind => {
    const g = s => el.querySelector(s); let ok;
    const base = { me, filename: 'SBISP-Collection' };
    const svcRows = a => (a || []).map(x => [x.service, x.n, pesos(x.total)]);
    if (kind === 'daily') {
      const d = g('#rp-d').value, r = await supabase.rpc('fin_list', { p_from: d, p_to: d }); if (r.error) return paint(note(r.error.message, 'er') + reportsView());
      const rec = (r.data || []).filter(x => x.status === 'recorded'), total = rec.reduce((s, x) => s + Number(x.amount), 0), voided = (r.data || []).length - rec.length;
      ok = await generatePdf({ ...base, title: 'DAILY COLLECTION REPORT', subtitle: nice(d), filename: 'SBISP-Daily-Collection', summary: [['Date', nice(d)], ['Number of receipts', rec.length], ['Total collection', pesos(total)], ...(voided ? [['Voided entries (not counted)', voided]] : [])],
        sections: [{ heading: 'Official receipts', columns: ['OR No.', 'Payer', 'Payment for', 'Method', 'Amount'], rows: rec.map(x => [x.or_no, x.payer_name, x.service, x.method, pesos(x.amount)]), foot: ['', '', '', 'TOTAL', pesos(total)], align: ['left', 'left', 'left', 'left', 'right'] }] });
    } else if (kind === 'monthly' || kind === 'yearly') {
      const y = +g(kind === 'monthly' ? '#rp-my' : '#rp-y').value, m = kind === 'monthly' ? +g('#rp-m').value : 1;
      const r = await supabase.rpc('fin_summary', { p_year: y, p_month: m }); if (r.error) return paint(note(r.error.message, 'er') + reportsView());
      const s = r.data, rows = kind === 'monthly' ? (s.daily || []).map(x => [nice(x.d), x.n, pesos(x.total)]) : (s.monthly || []).map(x => [MON[x.m - 1], x.n, pesos(x.total)]);
      const tot = kind === 'monthly' ? s.month : s.year;
      ok = await generatePdf({ ...base, title: (kind === 'monthly' ? 'MONTHLY' : 'YEARLY') + ' COLLECTION REPORT', subtitle: kind === 'monthly' ? `${MON[m - 1]} ${y}` : `Year ${y}`, filename: 'SBISP-' + (kind === 'monthly' ? 'Monthly' : 'Yearly') + '-Collection',
        summary: [[kind === 'monthly' ? 'Month' : 'Year', kind === 'monthly' ? `${MON[m - 1]} ${y}` : y], ['Number of receipts', tot.n], ['Total collection', pesos(tot.total)]],
        sections: [{ heading: kind === 'monthly' ? 'Daily collection' : 'Monthly collection', columns: [kind === 'monthly' ? 'Date' : 'Month', 'Receipts', 'Collection'], rows, foot: ['TOTAL', tot.n, pesos(tot.total)], align: ['left', 'right', 'right'] },
          { heading: 'Collection by service', columns: ['Service', 'Receipts', 'Collection'], rows: svcRows(kind === 'monthly' ? s.service_month : s.service_year), align: ['left', 'right', 'right'] },
          ...(kind === 'yearly' ? [{ heading: 'Yearly collection (all years)', columns: ['Year', 'Receipts', 'Collection'], rows: (s.yearly || []).map(x => [x.y, x.n, pesos(x.total)]), align: ['left', 'right', 'right'] }] : [])] });
    } else {
      const f = g('#rp-f').value, t = g('#rp-t').value, r = await supabase.rpc('fin_list', { p_from: f, p_to: t }); if (r.error) return paint(note(r.error.message, 'er') + reportsView());
      const all = r.data || [], rec = all.filter(x => x.status === 'recorded'), total = rec.reduce((s, x) => s + Number(x.amount), 0);
      ok = await generatePdf({ ...base, title: 'COLLECTION REGISTER', subtitle: `${nice(f)} to ${nice(t)}`, filename: 'SBISP-Collection-Register', landscape: true,
        summary: [['Period', `${nice(f)} to ${nice(t)}`], ['Receipts counted', rec.length], ['Total collection', pesos(total)]],
        sections: [{ columns: ['Date', 'OR No.', 'Payer', 'Payment for', 'Method', 'Amount', 'Status', 'Recorded by'], rows: all.map(x => [nice(x.paid_on), x.or_no, x.payer_name, x.service, x.method, pesos(x.amount), x.status === 'voided' ? 'VOID' : 'Recorded', x.recorded_by_name || '']),
          foot: ['', '', '', '', 'TOTAL', pesos(total), '', ''], align: ['left', 'left', 'left', 'left', 'left', 'right', 'left', 'left'] }] });
    }
    flash = '';
    paint(reportsView());
    bindReports();
  };
  const bindReports = () => el.querySelectorAll('button[data-r]').forEach(b => { b.onclick = () => run(b.dataset.r); });

  /* ---------------- wiring */
  const draw = () => {
    if (tab === 'summary') { paint(summaryView()); if (!el.querySelector('#fn-y')) return; el.querySelector('#fn-y').onchange = async e => { year = +e.target.value; await loadSummary(); draw(); }; el.querySelector('#fn-m').onchange = async e => { month = +e.target.value; await loadSummary(); draw(); }; }
    if (tab === 'tx') {
      paint(txView());
      const refresh = async () => { from = el.querySelector('#fn-f').value; to = el.querySelector('#fn-t').value; await loadTx(); draw(); };
      el.querySelector('#fn-f').onchange = refresh; el.querySelector('#fn-t').onchange = refresh;
      el.querySelector('#fn-q').oninput = e => { q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; draw(); const i = el.querySelector('#fn-q'); i.focus(); i.setSelectionRange(pos, pos); };
      if (el.querySelector('#fn-new')) el.querySelector('#fn-new').onclick = async () => { await loadUnpaid(); form(); };
      el.querySelectorAll('.fn-void').forEach(a => { a.onclick = async e => {
        e.preventDefault(); const reason = prompt('Why is this payment record being voided? (at least 5 characters)'); if (!reason) return;
        const { error } = await supabase.rpc('fin_void', { p_id: a.dataset.id, p_reason: reason }); flash = error ? note(error.message, 'er') : note('Payment record voided.'); await loadTx(); draw(); }; });
    }
    if (tab === 'req') { paint(reqView()); const f = el.querySelector('#rq-f'); if (f) f.onchange = e => { rf = e.target.value; draw(); }; }
    if (tab === 'reports') { paint(reportsView()); bindReports(); }
  };
  const form = (d = {}, err = '') => {
    el.innerHTML = formView(d, err);
    const g = s => el.querySelector(s);
    const read = () => ({ req: g('#fm-r').value, date: g('#fm-d').value, payer: g('#fm-p').value, service: g('#fm-s').value, other: g('#fm-ot').value, amount: g('#fm-a').value, method: g('#fm-m').value, or: g('#fm-or').value, remarks: g('#fm-rm').value });
    g('#fn-bk').onclick = e => { e.preventDefault(); go('tx'); };
    g('#fm-s').onchange = () => { const v = read(); if (fees[v.service] != null && !v.amount) v.amount = fees[v.service]; form({ ...v, amount: fees[v.service] ?? v.amount }); };
    g('#fm-r').onchange = () => { const v = read(), u = unpaid.find(x => x.id === v.req); if (u) form({ ...v, payer: u.resident_name || v.payer, service: fees[u.service] != null ? u.service : 'Other', other: fees[u.service] != null ? '' : u.service, amount: u.fee }); };
    g('#fm-go').onclick = async () => {
      const v = read(), service = v.service === 'Other' ? v.other.trim() : v.service;
      g('#fm-go').disabled = true;
      const { data, error } = await supabase.rpc('fin_record', { p: { request_id: v.req, paid_on: v.date, payer_name: v.payer, service, amount: v.amount, method: v.method, or_no: v.or, remarks: v.remarks } });
      if (error) return form(v, error.message);
      flash = note(`Payment recorded. Official receipt no. ${data}.`); await loadTx(); tab = 'tx'; draw();
    };
  };

  await loadSummary(); draw();
}
