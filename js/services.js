// =====================================================================
// SBISP | services.js
//  - mountServices: resident view (Figma "Barangay Services"): choose a document, fill the request, track recent requests
//  - mountServiceRequests: admin / Barangay Secretary (and view-only Punong Barangay) review and process requests
//  - recentActivity: the "Recent complaints and transactions" list on the resident home
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc, getFees } from './admin-features.js';
import { generatePdf, canPdf, pesos } from './pdf.js';

const SVCS = [
  { name: 'Barangay Clearance', desc: 'For employment, transactions, and other lawful purposes', c: '#1565C0', bg: '#E3F0FF' },
  { name: 'Certificate of Residency', desc: 'Confirm your current barangay residency', c: '#1B8A2E', bg: '#E4F4E1' },
  { name: 'Certificate of Indigency', desc: 'Request support documentation respectfully', c: '#1565C0', bg: '#E3F0FF' },
  { name: 'Other Document Request', desc: 'Ask for another available barangay record', c: '#1B8A2E', bg: '#E4F4E1' }];
const PURPOSES = ['Employment requirement', 'School requirement', 'Scholarship application', 'Financial or medical assistance', 'Business or permit application', 'ID or travel application', 'Other'];
const CLAIM = ['Claim at Barangay Hall', 'An authorized representative will claim it'];
const ST = { for_review: ['FOR REVIEW', 'fr'], ready: ['READY FOR CLAIM', 'rc'], released: ['RELEASED', 'rl'], rejected: ['REJECTED', 'rj'] };
const OK = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' };
const day = d => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const longDay = d => new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
const payLine = r => (r.fee > 0 ? '<br>Payment: ' + (r.paid_or ? 'Paid (OR ' + esc(r.paid_or) + ')' : 'Not yet paid') : '');
const chip = s => `<span class="cp-chip ${(ST[s] || ST.for_review)[1]}">${(ST[s] || ST.for_review)[0]}</span>`;
const note = (t, k = '') => `<div class="msg ${k}">${esc(t)}</div>`;
const peso = n => (n == null ? '' : n === 0 ? 'Free' : '₱' + Number(n).toLocaleString('en-PH'));
const DOC = c => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 14l2 2 4-4"/></svg>`;
const opts = (list, val) => list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const tomorrow = () => { const d = new Date(); return d.toISOString().slice(0, 10); };

/* ---------------------------------------------------------------- resident */
export async function mountServices(el, me) {
  let rows = [], fees = {}, flash = '', file = null;
  const load = async () => { const r = await supabase.rpc('service_requests_list'); if (r.error) { flash = note(r.error.message, 'er'); rows = []; } else rows = r.data || []; };
  el.innerHTML = '<p class="muted">Loading…</p>';
  try { fees = (await getFees()) || {}; } catch (e) { fees = {}; }
  await load();

  const list = () => {
    file = null;
    el.innerHTML = `<p class="muted" style="margin:6px 2px 12px">Request essential barangay documents. Access to basic services is available regardless of voter status.</p>${flash}
      ${SVCS.map(s => `<div class="sv-card" data-s="${esc(s.name)}"><span class="sv-i" style="background:${s.bg}">${DOC(s.c)}</span><b>${esc(s.name)}</b>
        <small>${esc(s.desc)}</small>${fees[s.name] != null ? `<small class="sv-fee">Fee: ${esc(peso(fees[s.name]))}</small>` : ''}<span class="sv-go" style="color:${s.c}">›</span></div>`).join('')}
      <div class="qa-h"><span>RECENT REQUESTS</span></div>
      ${rows.map(r => `<div class="cp-card" data-id="${r.id}" data-open="0"><div class="cp-top"><b style="color:#111">${esc(r.service)}</b>${chip(r.status)}</div>
        <small class="muted">${esc(r.ref)} • ${day(r.created_at)}</small><div class="sv-more" style="display:none"><p class="muted">Purpose: ${esc(r.purpose)}<br>Claim: ${esc(r.claim_method)} on ${esc(longDay(r.claim_date))}${r.fee != null ? '<br>Fee: ' + esc(peso(r.fee)) : ''}${payLine(r)}</p>
        ${r.staff_note ? `<p><b>Barangay note:</b> ${esc(r.staff_note)}</p>` : ''}</div></div>`).join('') || '<div class="card"><p class="muted">You have not requested a document yet.</p></div>'}`;
    el.querySelectorAll('.sv-card').forEach(c => { c.onclick = () => { flash = ''; form(c.dataset.s); }; });
    el.querySelectorAll('.cp-card').forEach(c => { c.onclick = () => { const m = c.querySelector('.sv-more'); m.style.display = m.style.display === 'none' ? 'block' : 'none'; }; });
  };

  const form = (type, d = {}, err = '') => {
    d = { purpose: PURPOSES[0], claim: CLAIM[0], date: '', details: '', ...d };
    el.innerHTML = `<a href="#" id="sf-bk">‹ Back to services</a>
      <div class="sv-note">Residents may request this service regardless of voter status. Requirements are reviewed consistently and fairly.</div>${err ? note(err, 'er') : ''}
      <div class="cp-form"><label>SERVICE TYPE</label><select id="sf-t">${opts(SVCS.map(s => s.name), type)}</select>
        <label>PURPOSE</label><select id="sf-p">${opts(PURPOSES, d.purpose)}</select>
        <label id="sf-dl">ADDITIONAL DETAILS${type === 'Other Document Request' ? ' (which document do you need?)' : ' (optional)'}</label><textarea id="sf-d" rows="3">${esc(d.details)}</textarea>
        <label>DELIVERY / CLAIM METHOD</label><select id="sf-m">${opts(CLAIM, d.claim)}</select>
        <label>PREFERRED CLAIM DATE</label><input id="sf-c" type="date" min="${tomorrow()}" value="${esc(d.date)}">
        <label>SUPPORTING DOCUMENT (optional)</label><div class="rg-drop" id="sf-drop"><div style="font-size:24px">📄</div><div id="sf-fn">${file ? esc(file.name) : 'Upload supporting document (JPEG, PNG or PDF, up to 5 MB)'}</div></div>
        <input id="sf-f" type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" hidden>
        ${fees[type] != null ? `<p class="muted">Standard fee: <b>${esc(peso(fees[type]))}</b></p>` : ''}
        <div class="sv-info">Please review your details before submitting. Staff may contact you if clarification is needed.</div></div>
      <button class="cp-g" id="sf-go">Submit Request</button>`;
    const g = s => el.querySelector(s), read = () => ({ purpose: g('#sf-p').value, claim: g('#sf-m').value, date: g('#sf-c').value, details: g('#sf-d').value });
    g('#sf-bk').onclick = e => { e.preventDefault(); list(); };
    g('#sf-t').onchange = () => form(g('#sf-t').value, read());
    g('#sf-drop').onclick = () => g('#sf-f').click();
    g('#sf-f').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 5 * 1024 * 1024) return form(type, read(), 'The file is too large. Please choose a file under 5 MB.');
      if (!OK[f.type] && !/\.(png|jpe?g|pdf)$/i.test(f.name)) return form(type, read(), 'Please choose a PNG, JPEG or PDF file.');
      file = f; form(type, read());
    };
    g('#sf-go').onclick = async () => {
      const v = read();
      if (!v.date) return form(type, v, 'Choose your preferred claim date.');
      if (type === 'Other Document Request' && v.details.trim().length < 5) return form(type, v, 'Tell us which document you need.');
      const btn = g('#sf-go'); btn.disabled = true; btn.textContent = 'Submitting…';
      let path = '';
      if (file) {
        const ext = OK[file.type] || (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
        path = `${me.id}/req-${Date.now()}.${ext}`;
        const up = await supabase.storage.from('service-docs').upload(path, file, { contentType: file.type || (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg') });
        if (up.error) return form(type, v, 'Could not upload the document: ' + up.error.message);
      }
      const { data: ref, error } = await supabase.rpc('service_request_submit', { p: { service: type, purpose: v.purpose, details: v.details, claim_method: v.claim, claim_date: v.date, doc_path: path } });
      if (error) return form(type, v, error.message);
      flash = note(`Request submitted. Reference ${ref}. You will be notified when it is ready.`); await load(); list();
    };
  };
  list();
}

/* ---------------------------------------------------------------- staff */
export async function mountServiceRequests(el, me) {
  const manage = !me.is_pb;
  let shown = [], rows = [], q = '', f = 'all', open = null, flash = '';
  el.innerHTML = '<p class="muted">Loading…</p>';
  const load = async () => { const r = await supabase.rpc('service_requests_list'); if (r.error) { flash = note(r.error.message, 'er'); rows = []; } else rows = r.data || []; };
  await load();
  el.innerHTML = `<div class="cp-bar"><div class="cp-s"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
    <input id="sr-q" placeholder="Search requests or ID…" autocomplete="off"></div></div><div class="cp-chips" id="sr-chips"></div><div id="sr-flash"></div><div id="sr-list"></div>${manage && canPdf(me) ? '<button class="cp-g" id="sr-pdf">Generate PDF Report</button>' : ''}`;
  const $ = s => el.querySelector(s);
  const card = r => {
    const o = open === r.id;
    const final = ['released', 'rejected'].includes(r.status);   // released or rejected requests are final
    const panelOpen = `<div class="cp-pn"><p class="muted">Reference ${esc(r.ref)}<br>Purpose: ${esc(r.purpose)}<br>Claim: ${esc(r.claim_method)} on ${esc(longDay(r.claim_date))}${r.fee != null ? '<br>Fee: ' + esc(peso(r.fee)) : ''}${payLine(r)}</p>
      ${r.details ? `<p>${esc(r.details)}</p>` : ''}${r.doc_path ? '<p><a href="#" class="docl" data-p="' + esc(r.doc_path) + '">View supporting document</a></p>' : ''}
      <div class="cp-r"><span>UPDATE STATUS</span><select class="st" ${manage ? '' : 'disabled'}>${opts(Object.entries(ST).map(([k, v]) => [k, v[0]]), r.status)}</select></div>
      <textarea class="rm" placeholder="Note to the resident (required when rejecting)" ${manage ? '' : 'disabled'}>${esc(r.staff_note || '')}</textarea>
      ${manage ? '<button class="cp-g" data-a="save">Save Status</button>' : '<p class="muted">View only.</p>'}</div>`;
    const panel = final ? `<div class="cp-pn"><p class="muted">Reference ${esc(r.ref)}<br>Purpose: ${esc(r.purpose)}<br>Claim: ${esc(r.claim_method)} on ${esc(longDay(r.claim_date))}${r.fee != null ? '<br>Fee: ' + esc(peso(r.fee)) : ''}${payLine(r)}</p>
      ${r.details ? `<p>${esc(r.details)}</p>` : ''}${r.doc_path ? '<p><a href="#" class="docl" data-p="' + esc(r.doc_path) + '">View supporting document</a></p>' : ''}
      <p><b>Status:</b> ${r.status === 'released' ? 'Released' : 'Rejected'}</p>${r.staff_note ? `<p><b>Note to the resident:</b> ${esc(r.staff_note)}</p>` : ''}
      <p class="muted">This request is closed and can no longer be changed. The resident can submit a new request when needed.</p></div>` : panelOpen;
    return `<div class="cp-card ${o ? 'open' : ''}" data-id="${r.id}"><div class="cp-top" data-t="1"><b>${esc(r.service)}</b>${chip(r.status)}</div>
      <p data-t="1" class="muted">${esc(r.purpose)}</p>${o ? panel : ''}<div class="cp-foot" data-t="1"><span>${esc(r.resident_name || '—')} • ${day(r.created_at)}</span><span class="cp-chev">${o ? '⌃' : '⌄'}</span></div></div>`;
  };
  const list0 = () => rows.filter(r => (f === 'all' || r.status === f) && (!q || [r.service, r.ref, r.resident_name, r.purpose].join(' ').toLowerCase().includes(q)));
  const draw = () => {
    const count = s => rows.filter(r => s === 'all' || r.status === s).length;
    $('#sr-chips').innerHTML = [['all', 'All'], ...Object.entries(ST).map(([k, v]) => [k, v[0].charAt(0) + v[0].slice(1).toLowerCase()])]
      .map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l} (${count(k)})</button>`).join('');
    shown = list0(); $('#sr-flash').innerHTML = flash;
    const list = list0();
    $('#sr-list').innerHTML = list.map(card).join('') || '<p class="muted">No requests in this list.</p>';
  };
  $('#sr-q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
  $('#sr-chips').onclick = e => { const b = e.target.closest('button[data-f]'); if (b) { f = b.dataset.f; draw(); } };
  $('#sr-list').onclick = async e => {
    const l = e.target.closest('a.docl');
    if (l) { e.preventDefault(); const { data } = await supabase.storage.from('service-docs').createSignedUrl(l.dataset.p, 300); if (data?.signedUrl) window.open(data.signedUrl, '_blank'); return; }
    const c = e.target.closest('.cp-card'); if (!c) return;
    const b = e.target.closest('button[data-a]');
    if (b) {
      const { error } = await supabase.rpc('service_request_update', { p_id: c.dataset.id, p_status: c.querySelector('.st').value, p_note: c.querySelector('.rm').value });
      if (error) flash = note(error.message, 'er'); else { flash = note('Request updated.'); await load(); }
      return draw();
    }
    if (e.target.closest('[data-t]')) { open = open === c.dataset.id ? null : c.dataset.id; draw(); }
  };
  if ($('#sr-pdf')) $('#sr-pdf').onclick = () => { const n = k => shown.filter(x => x.status === k).length, paid = shown.filter(x => x.paid_or).reduce((t, x) => t + Number(x.fee || 0), 0);
    generatePdf({ me, title: 'BARANGAY SERVICE REQUESTS REPORT', subtitle: f === 'all' ? 'All statuses' : ST[f][0], filename: 'SBISP-Service-Requests-Report', landscape: true,
      summary: [['Requests listed', shown.length], ['For review', n('for_review')], ['Ready for claim', n('ready')], ['Released', n('released')], ['Rejected', n('rejected')], ['Fees paid (recorded)', pesos(paid)]],
      sections: [{ columns: ['Reference', 'Requested', 'Service', 'Resident', 'Purpose', 'Fee', 'Payment', 'Status'], rows: shown.map(x => [x.ref, day(x.created_at), x.service, x.resident_name || '', x.purpose, x.fee != null ? pesos(x.fee) : '', x.paid_or ? 'Paid ' + x.paid_or : (x.fee > 0 ? 'Not yet paid' : ''), ST[x.status][0]]), align: ['left', 'left', 'left', 'left', 'left', 'right', 'left', 'left'] }] }); };
  draw();
}

/* ---------------------------------------------------------------- resident home: recent complaints and requests */
export async function recentActivity(me) {
  const [c, s] = await Promise.all([supabase.rpc('complaints_list'), supabase.rpc('service_requests_list')]);
  const CM = { pending: ['PENDING', 'pd'], ongoing: ['ONGOING', 'og'], resolved: ['RESOLVED', 'rs'] };
  const items = [
    ...(c.data || []).map(r => ({ t: r.title, ref: r.ref, d: r.created_at, chip: `<span class="cp-chip ${(CM[r.status] || CM.pending)[1]}">${(CM[r.status] || CM.pending)[0]}</span>` })),
    ...(s.data || []).map(r => ({ t: r.service, ref: r.ref, d: r.created_at, chip: chip(r.status) }))]
    .sort((a, b) => new Date(b.d) - new Date(a.d)).slice(0, 4);
  return items.map(i => `<div class="cp-card" style="cursor:default"><div class="cp-top"><b style="color:#111">${esc(i.t)}</b>${i.chip}</div><small class="muted">${esc(i.ref)} • ${day(i.d)}</small></div>`).join('')
    || '<div class="card"><p class="muted">No complaints or requests yet.</p></div>';
}
