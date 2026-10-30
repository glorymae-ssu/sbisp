// =====================================================================
// SBISP | admin-features.js
// Plain ES module (no build step). Works on GitHub Pages with supabase-js.
// Needs: ./supabaseClient.js exporting `supabase` (see supabaseClient.example.js)
// Each mountXxx(el) draws one feature into a container element.
// =====================================================================
import { supabase } from './supabaseClient.js';

/* ---------- settings you can change ---------- */
const BARANGAY = { name: 'Guinsorongan', city: 'Catbalogan City', province: 'Samar', logo: 'assets/logo.png' };
const PALETTE = ['#0F6B3A', '#2F8FD8', '#E8890C', '#8E5BD0', '#D32F2F', '#14A6A6', '#8A9A5B', '#C2185B', '#5D4037', '#607D8B'];

/* ---------- small helpers ---------- */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const php = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthShort = ym => new Date(ym + '-01T00:00:00').toLocaleString('en', { month: 'short' });
const box = (kind, text) => `<div class="msg ${kind}" style="padding:10px;border-radius:10px;margin:8px 0;background:${kind === 'er' ? '#FDE6E6' : kind === 'wa' ? '#FFF0DC' : '#E4F5EA'}">${text}</div>`;
const card = inner => `<div class="card" style="background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;box-shadow:0 1px 3px #0001">${inner}</div>`;
const input = (id, label, val = '', type = 'text') =>
  `<label style="display:block;font-size:13px;font-weight:600;margin:10px 0 4px" for="${id}">${esc(label)}</label>
   <input id="${id}" type="${type}" value="${esc(val)}" style="width:100%;padding:11px;border:1px solid #C9D2DC;border-radius:10px;font-size:15px">`;
const button = (label, id, extra = '') =>
  `<button id="${id}" style="width:100%;padding:12px;border:0;border-radius:10px;margin-top:8px;font-weight:600;font-size:15px;cursor:pointer;${extra || 'background:#0F6B3A;color:#fff'}">${label}</button>`;

/* ---------- bar graph + column chart (no library) ---------- */
export function bars(rows) {                       // rows = [[label, number], ...]
  const total = rows.reduce((a, r) => a + r[1], 0), max = Math.max(1, ...rows.map(r => r[1]));
  if (!total) return '<p style="color:#66707D">No data yet.</p>';
  return rows.map((r, i) => `
    <div style="margin:9px 0">
      <div style="display:flex;justify-content:space-between;font-size:13px;padding-bottom:3px">
        <span>${esc(r[0])}</span><b>${r[1]} · ${Math.round(r[1] * 100 / total)}%</b></div>
      <div style="background:#E1ECE5;border-radius:6px;height:14px">
        <div style="width:${Math.round(r[1] * 100 / max)}%;min-width:${r[1] ? 4 : 0}px;height:14px;border-radius:6px;background:${PALETTE[i % PALETTE.length]}"></div></div></div>`).join('');
}
export function cols(rows) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return `<div style="display:flex;gap:8px;margin-top:10px">${rows.map(r => `
    <div style="flex:1;text-align:center;display:flex;flex-direction:column;justify-content:flex-end;height:130px">
      <small>${r[1]}</small>
      <div style="height:${Math.round(r[1] * 85 / max)}px;min-height:${r[1] ? 3 : 0}px;background:#0F6B3A;border-radius:5px 5px 0 0"></div>
      <small>${esc(r[0])}</small></div>`).join('')}</div>`;
}

/* ---------- print / save as PDF (preview first, then call this) ---------- */
export function printHTML(html, title = 'SBISP-Report') {
  if (!document.getElementById('sbisp-print-css')) {
    const st = document.createElement('style'); st.id = 'sbisp-print-css';
    st.textContent = `#print-area{display:none}
      @media print{@page{size:A4;margin:14mm}body>*:not(#print-area){display:none!important}#print-area{display:block;font-family:'Times New Roman',serif;font-size:11pt}
      #print-area table{width:100%;border-collapse:collapse;margin:4px 0 10px}#print-area td,#print-area th{border:1px solid #999;padding:3px 6px;text-align:left}#print-area th{background:#E4F5EA}}`;
    document.head.appendChild(st);
  }
  let a = document.getElementById('print-area');
  if (!a) { a = document.createElement('div'); a.id = 'print-area'; document.body.appendChild(a); }
  a.innerHTML = html;
  const old = document.title; document.title = title; window.print(); document.title = old;
}
export const reportHeader = (title, sub = '') => `
  <div style="display:flex;align-items:center;border-bottom:2px solid #0B5D33;padding-bottom:8px;text-align:center">
    <img src="${esc(BARANGAY.logo)}" alt="" style="width:60px;height:60px;border-radius:50%">
    <div style="flex:1;margin-right:60px">Republic of the Philippines<br>Province of ${esc(BARANGAY.province)}<br>City of ${esc(BARANGAY.city.replace(/ City$/, ''))}<br>
      <b>BARANGAY ${esc(BARANGAY.name.toUpperCase())}</b><br><b>OFFICE OF THE PUNONG BARANGAY</b></div></div>
  <h3 style="text-align:center;margin:12px 0 2px">${esc(title)}</h3><p style="text-align:center">${esc(sub)}</p>`;
export const table = (head, rows) =>
  `<table><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}">None</td></tr>`}</table>`;

/* =====================================================================
   1. ANALYTICS (bar graphs)   -> admin / Punong Barangay only
   ===================================================================== */
export async function mountAnalytics(el) {
  el.innerHTML = '<p>Loading analytics…</p>';
  const { data: d, error } = await supabase.rpc('analytics_summary');
  if (error) { el.innerHTML = box('er', esc(error.message)); return; }
  const rows = a => (a || []).map(x => [x.label ?? 'Unspecified', Number(x.n)]);
  const months = a => (a || []).map(x => [monthShort(x.label), Number(x.n)]);
  const big = (l, n, color = '#0F6B3A', top = '') =>
    `<div style="background:#fff;border-radius:12px;padding:14px;text-align:center;box-shadow:0 1px 3px #0001;${top}"><b style="font-size:26px;color:${color}">${n}</b><small style="display:block">${esc(l)}</small></div>`;
  const grid = items => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">${items.join('')}</div>`;
  const G = '#0F6B3A', R = '#D32F2F';

  el.innerHTML = box('in', '🔒 Confidential: visible only to the Administrator and the Punong Barangay.')
    + (d.stale_cases ? box('wa', `⏰ ${d.stale_cases} case${d.stale_cases > 1 ? 's have' : ' has'} been pending for more than 7 days.`) : '')
    + grid([big('Total Population', d.population), big('Registered Voters', d.registered_voters), big('Senior Citizens', d.seniors), big('New Residents', d.new_residents)])
    + grid([big('VAWC Cases', d.vawc, R, `border-top:4px solid ${R}`), big('Juvenile Cases', d.juvenile, R, `border-top:4px solid ${R}`),
            big('Peace and Order', d.peace_order, R, `border-top:4px solid ${R}`), big('Total Cases', d.total_cases, R, `border-top:4px solid ${R}`)])
    + grid([big('Youth (15–30)', d.youth, G, `border-top:4px solid ${G}`), big('PWD', d.pwd, G, `border-top:4px solid ${G}`),
            big('Social Pensioners (LGU)', d.social_pensioners_lgu, G, `border-top:4px solid ${G}`), big('SSS Pensioners', d.sss_pensioners, G, `border-top:4px solid ${G}`)])
    + card('<b>Sex</b>' + bars(rows(d.sex)))
    + card('<b>Voters</b>' + bars(rows(d.voters)))
    + card('<b>Youth</b>' + bars(rows(d.youth_status)))
    + card('<b>SK Voter Status (ages 15–17)</b>' + bars(rows(d.sk_voters)))
    + card('<b>Out-of-School Youth: Employment Interest</b>' + bars(rows(d.osy_employment)))
    + card('<b>Age Groups</b>' + bars(rows(d.age_groups)))
    + card('<b>Senior Citizens: Pension Status</b>' + bars(rows(d.senior_pension)))
    + card('<b>Cases &amp; Concerns by Category</b>' + bars(rows(d.cases_by_category)))
    + card('<b>Community Reports (complaints filed through the app)</b>' + bars(rows(d.complaints_by_category)))
    + card('<b>Community Reports by Status</b>' + bars(rows(d.complaints_by_status)))
    + card('<b>Complaints Filed per Month</b>' + cols(months(d.complaints_per_month)))
    + card('<b>Certificates Processed by Service</b>' + bars(rows(d.certificates_by_service)))
    + card('<b>Collections per Month (₱)</b>' + cols(months(d.collections_per_month)))
    + button('📄 Print / Save Summary as PDF', 'ana-print');

  el.querySelector('#ana-print').onclick = () => {
    const t = (h, a) => `<h4>${esc(h)}</h4>` + table(['Category', 'Count'], rows(a));
    printHTML(reportHeader('BARANGAY ANALYTICS SUMMARY', new Date().toLocaleDateString('en-PH', { dateStyle: 'long' }))
      + `<h4>Overview</h4>` + table(['Item', 'Count'], [['Total living population', d.population], ['Registered voters', d.registered_voters], ['Senior citizens', d.seniors],
          ['New residents', d.new_residents], ['Youth (15–30)', d.youth], ['PWD', d.pwd], ['Social Pensioners (LGU)', d.social_pensioners_lgu], ['SSS Pensioners', d.sss_pensioners],
          ['VAWC cases', d.vawc], ['Juvenile cases', d.juvenile], ['Peace and Order cases', d.peace_order], ['Total cases', d.total_cases]])
      + t('Sex', d.sex) + t('Age groups', d.age_groups) + t('Youth', d.youth_status) + t('Cases by category', d.cases_by_category)
      + t('Community reports by status', d.complaints_by_status), 'SBISP-Analytics-Summary');
  };
}

/* =====================================================================
   2. ANNOUNCEMENTS
   ===================================================================== */
// Residents: call this on the home / notifications screen
export async function loadActiveAnnouncements() {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from('announcements').select('*')
    .lte('show_from', today).gte('show_until', today).order('created_at', { ascending: false });
  return data || [];
}
export const renderAnnouncements = list => list.map(a =>
  card(`<b>📢 ${esc(a.title)}</b><small style="display:block;margin:4px 0">${esc(a.purok || 'All residents')} · until ${esc(a.show_until)}</small><div>${esc(a.body)}</div>`)).join('');

// Administrator: list + post / edit / delete (Punong Barangay is blocked by RLS)
export async function mountAnnouncementsAdmin(el) {
  const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
  if (error) { el.innerHTML = box('er', esc(error.message)); return; }
  const today = new Date().toISOString().slice(0, 10), plus14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  el.innerHTML = card('<b>New announcement</b>'
      + input('an-t', 'Title') + `<label style="display:block;font-size:13px;font-weight:600;margin:10px 0 4px" for="an-b">Message</label><textarea id="an-b" style="width:100%;min-height:80px;padding:11px;border:1px solid #C9D2DC;border-radius:10px"></textarea>`
      + input('an-p', 'Audience (leave empty for all residents, or type a Purok, e.g. Purok 3)')
      + input('an-f', 'Show from', today, 'date') + input('an-u', 'Show until', plus14, 'date')
      + button('Post Announcement', 'an-save') + '<div id="an-msg"></div>')
    + (data.map(a => card(`<b>${esc(a.title)}</b><small style="display:block">${esc(a.purok || 'All residents')} · ${esc(a.show_from)} to ${esc(a.show_until)}</small>
        <div style="margin:6px 0">${esc(a.body)}</div>${button('🗑️ Delete', 'del-' + a.id, 'background:#D32F2F;color:#fff')}`)).join('') || '<p>No announcements yet.</p>');

  el.querySelector('#an-save').onclick = async () => {
    const row = { title: el.querySelector('#an-t').value.trim(), body: el.querySelector('#an-b').value.trim(),
      purok: el.querySelector('#an-p').value.trim() || null, show_from: el.querySelector('#an-f').value, show_until: el.querySelector('#an-u').value };
    if (!row.title || !row.body) { el.querySelector('#an-msg').innerHTML = box('er', 'Title and message are required.'); return; }
    const { error: e } = await supabase.from('announcements').insert(row);
    if (e) el.querySelector('#an-msg').innerHTML = box('er', esc(e.message)); else mountAnnouncementsAdmin(el);
  };
  data.forEach(a => { el.querySelector('#del-' + a.id).onclick = async () => {
    if (!confirm('Delete this announcement?')) return;
    const { error: e } = await supabase.from('announcements').delete().eq('id', a.id);
    if (e) alert(e.message); else mountAnnouncementsAdmin(el); }; });
}

/* =====================================================================
   3. FEE SCHEDULE
   ===================================================================== */
export async function getFees() {                    // { 'Barangay Clearance': 50, ... }
  const { data } = await supabase.from('fee_schedule').select('service, amount');
  return Object.fromEntries((data || []).map(r => [r.service, Number(r.amount)]));
}
export async function mountFeeSchedule(el) {
  const { data, error } = await supabase.from('fee_schedule').select('*').order('service');
  if (error) { el.innerHTML = box('er', esc(error.message)); return; }
  el.innerHTML = box('in', 'Standard fee for each certificate. Enter 0 for free.')
    + data.map((r, i) => input('fee-' + i, r.service + ' (₱)', r.amount, 'number')).join('')
    + button('Save Fee Schedule', 'fee-save') + '<div id="fee-msg"></div>';
  el.querySelector('#fee-save').onclick = async () => {
    const rows = data.map((r, i) => ({ service: r.service, amount: Math.max(0, Number(el.querySelector('#fee-' + i).value) || 0) }));
    const { error: e } = await supabase.from('fee_schedule').upsert(rows);
    el.querySelector('#fee-msg').innerHTML = e ? box('er', esc(e.message)) : box('ok', 'Fee schedule saved.');
  };
}

/* =====================================================================
   4. MASTERLISTS (view first, then print / save as PDF)
   ===================================================================== */
const LISTS = ['All living residents', 'Registered Voters', 'Non-registered Voters', 'Senior Citizens (60+)', 'Persons with Disability (PWD)',
  'Youth (15-30)', 'In-School Youth', 'Out-of-School Youth', 'Children (below 15)', 'Registered SK Voters',
  'Social Pensioners (LGU)', 'SSS Pensioners', 'New Residents', 'Deceased'];
export async function mountMasterlists(el) {
  const { data: pk } = await supabase.from('population_registry').select('purok');
  const puroks = [...new Set((pk || []).map(x => x.purok).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const sel = (id, label, opts) => `<label style="display:block;font-size:13px;font-weight:600;margin:10px 0 4px" for="${id}">${label}</label>
    <select id="${id}" style="width:100%;padding:11px;border:1px solid #C9D2DC;border-radius:10px;font-size:15px">${opts.map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
  el.innerHTML = sel('ml-t', 'List', LISTS) + sel('ml-p', 'Purok', ['All Puroks', ...puroks]) + '<div id="ml-out" style="margin-top:12px;overflow-x:auto"></div>';
  const draw = async () => {
    const type = el.querySelector('#ml-t').value, purok = el.querySelector('#ml-p').value;
    const { data, error } = await supabase.rpc('masterlist', { p_type: type, p_purok: purok === 'All Puroks' ? null : purok });
    const out = el.querySelector('#ml-out');
    if (error) { out.innerHTML = box('er', esc(error.message)); return; }
    const body = table(['#', 'Name', 'Age', 'Sex', 'Address', 'Mobile', 'Notes'],
      data.map((p, i) => [i + 1, p.full_name, p.age, p.sex, `${p.purok ?? ''}, ${p.street ?? ''}`, p.mobile ?? '—', p.notes ?? '']))
      + `<p>Total: <b>${data.length}</b></p>`;
    out.innerHTML = card(body) + button('🖨️ Print / Save as PDF', 'ml-print');
    out.querySelector('#ml-print').onclick = () => printHTML(
      reportHeader('MASTERLIST', type + (purok === 'All Puroks' ? ' · All Puroks' : ' · ' + purok)) + body, 'SBISP-Masterlist-' + type.replace(/\W+/g, '_'));
  };
  el.querySelector('#ml-t').onchange = draw; el.querySelector('#ml-p').onchange = draw; draw();
}

/* =====================================================================
   5. HEARINGS (blotter / summons)
   ===================================================================== */
// Drop into a case-details screen for blotter / summons records
export function hearingForm(c) {
  return `<h4>Hearing / Summons Schedule</h4>` + input('hr-d', 'Hearing date', c.hearing_date || '', 'date')
    + input('hr-t', 'Time', (c.hearing_time || '').slice(0, 5), 'time') + input('hr-v', 'Venue', c.hearing_venue || 'Barangay Hall')
    + button('Save Hearing Schedule', 'hr-save') + '<div id="hr-msg"></div>';
}
export function bindHearingForm(root, caseId) {
  root.querySelector('#hr-save').onclick = async () => {
    const { error } = await supabase.rpc('set_hearing', { p_case: caseId, p_date: root.querySelector('#hr-d').value || null,
      p_time: root.querySelector('#hr-t').value || null, p_venue: root.querySelector('#hr-v').value });
    root.querySelector('#hr-msg').innerHTML = error ? box('er', esc(error.message)) : box('ok', 'Hearing saved.');
  };
}
export async function mountUpcomingHearings(el) {
  const { data, error } = await supabase.rpc('upcoming_hearings');
  if (error) { el.innerHTML = box('er', esc(error.message)); return; }
  el.innerHTML = data.length ? card('<b>📅 Upcoming Hearings</b>' + data.map(h =>
    `<div style="padding:7px 0;border-bottom:1px solid #EEF1F4"><b>${esc(h.hearing_date)} ${esc((h.hearing_time || '').slice(0, 5))}</b>
     <small style="display:block">${esc(h.subject)} · ${esc(h.type)} · ${esc(h.venue)}</small></div>`).join('')) : '';
}
