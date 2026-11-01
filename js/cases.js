// =====================================================================
// SBISP | cases.js  (Phase 2)
// Resident: complaints, certificate requests, My Requests, tracking, edit/delete rules.
// Staff:    case list, assignment, status, remarks, close, deletion approval, fees, certificate preview.
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc, php, printHTML, reportHeader } from './admin-features.js';

const $ = id => document.getElementById(id);
const v = id => ($(id) ? $(id).value : '');
const msg = (t, k = '') => `<div class="msg ${k}">${t}</div>`;
const field = (id, l, val = '', type = 'text') => `<label for="${id}">${esc(l)}</label><input id="${id}" type="${type}" value="${esc(val)}">`;
const area = (id, l, val = '') => `<label for="${id}">${esc(l)}</label><textarea id="${id}">${esc(val)}</textarea>`;
const select = (id, l, opts, val = '') => `<label for="${id}">${esc(l)}</label><select id="${id}">${opts.map(o => {
  const [value, text] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(value)}" ${String(value) === String(val) ? 'selected' : ''}>${esc(text)}</option>`; }).join('')}</select>`;
const row = (a, b) => `<div class="row"><span>${esc(a)}</span><b>${b}</b></div>`;
const age = b => (b ? Math.floor((Date.now() - new Date(b)) / 31557600000) : '');
const when = t => new Date(t).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const date = t => (t ? new Date(t).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—');

const STEPS = {
  complaint: ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved'],
  certificate: ['Request Submitted', 'For Verification', 'For Approval', 'Ready for Release', 'Completed'],
  blotter: ['Filed', 'Summons Issued', 'Hearing Set', 'Mediation', 'Settled'],
};
STEPS.summons = STEPS.blotter;
const TYPE_LABEL = { complaint: 'Complaint', certificate: 'Certificate', blotter: 'Blotter', summons: 'Summons' };
const stText = c => c.closed_outcome || STEPS[c.type][c.step];
const stBadge = c => { const t = stText(c), cls = c.closed_outcome ? 'er' : c.step >= 4 ? 'ok' : c.step === 0 ? 'wa' : 'bl'; return `<span class="bd ${cls}">${esc(t)}</span>`; };
const isClosed = c => !!c.closed_outcome || c.step >= 4;
const timeline = c => STEPS[c.type].map((s, i) => { const done = i < c.step || (i === c.step && c.step === 4);
  return `<div style="display:flex;gap:10px;padding:5px 0;color:${done ? '#1E8E4E' : i === c.step ? '#0F6B3A' : '#99a'};font-weight:${i === c.step ? 700 : 400}"><span>${done ? '✓' : i === c.step ? '●' : '○'}</span>${esc(s)}</div>`; }).join('');

/* ---------- certificate types (same as the prototype) ---------- */
const PU = ['Employment', 'School Requirement', 'Travel / Passport', 'Business Permit', 'Financial / Loan', 'Other'];
const MP = ['Medical Assistance', 'Educational Assistance', 'Burial Assistance', 'Legal Assistance', 'Other'];
const CERTS = [
  ['Barangay Clearance', '📝', [['purpose', 'Purpose', 'sel', PU], ['yrs', 'Years of Residency in Barangay', 'number'], ['ctc', 'Community Tax Certificate No. (Optional)', 'text']]],
  ['Certificate of Residency', '🏠', [['yrs', 'Length of Residency (years)', 'number'], ['purpose', 'Purpose', 'sel', PU]]],
  ['Certificate of Indigency', '📄', [['purpose', 'Purpose', 'sel', MP], ['hh', 'Number of Household Members', 'number'], ['inc', 'Estimated Monthly Household Income (₱)', 'number']]],
  ['Certificate of Good Moral Character', '📄', [['purpose', 'Purpose', 'sel', PU], ['inst', 'School / Employer Requesting (Optional)', 'text']]],
  ['Certificate of No Pending Complaint/Case', '📄', [['purpose', 'Purpose', 'sel', PU], ['off', 'Requesting Office / Agency', 'text']]],
  ['Certificate of Low Income', '📄', [['occ', 'Occupation', 'text'], ['inc', 'Estimated Monthly Income (₱)', 'number'], ['purpose', 'Purpose', 'sel', ['Scholarship', 'Financial Assistance', 'Discount / Benefit', 'Other']]]],
  ['First-Time Job Seeker Certification', '💼', [['edu', 'Highest Educational Attainment', 'sel', ['High School', 'Senior High School', 'Vocational / TESDA', 'College Undergraduate', 'College Graduate']], ['crs', 'Course / Field of Study', 'text'], ['pl', 'Preferred Job / Skill (Optional)', 'text']]],
  ['Solo Parent Certification', '👨‍👩‍👧', [['kids', 'Number of Children', 'number'], ['names', 'Names and Ages of Children', 'area'], ['why', 'Reason for Being a Solo Parent', 'sel', ['Death of spouse', 'Abandonment', 'Separation', 'Other']], ['spid', 'Solo Parent ID No. (Optional)', 'text']]],
  ['Other Certifications', '📑', [['req', 'Certification Requested', 'text'], ['purpose', 'Purpose', 'sel', PU]]],
];
const CATS = ['Peace and Order', 'Noise', 'Waste Management', 'Infrastructure', 'Public Safety', 'Other'];
const BODY = {
  'Barangay Clearance': f => `has no pending case or derogatory record on file in this office and is a law-abiding resident of this barangay. This clearance is issued for <b>${esc(f.purpose)}</b> purposes.`,
  'Certificate of Residency': f => `is a bonafide resident of this barangay for <b>${esc(f.yrs)}</b> year(s). This certification is issued for <b>${esc(f.purpose)}</b> purposes.`,
  'Certificate of Indigency': f => `belongs to an indigent family of this barangay, with <b>${esc(f.hh)}</b> household member(s) and an estimated monthly household income of <b>₱${esc(f.inc)}</b>. Issued for <b>${esc(f.purpose)}</b>.`,
  'Certificate of Good Moral Character': f => `is a person of good moral character and a law-abiding member of this community. Issued for <b>${esc(f.purpose)}</b> purposes.`,
  'Certificate of No Pending Complaint/Case': f => `has no pending complaint or case on record in this barangay as of the date of issuance. Issued to <b>${esc(f.off)}</b> for <b>${esc(f.purpose)}</b> purposes.`,
  'Certificate of Low Income': f => `works as <b>${esc(f.occ)}</b> with an estimated monthly income of <b>₱${esc(f.inc)}</b>, which falls within the low-income bracket. Issued for <b>${esc(f.purpose)}</b>.`,
  'First-Time Job Seeker Certification': f => `is a first-time job seeker (<b>${esc(f.edu)}</b>, ${esc(f.crs)}). Pursuant to Republic Act No. 11261, this certification is issued free of charge.`,
  'Solo Parent Certification': f => `is a solo parent of <b>${esc(f.kids)}</b> child(ren): ${esc(f.names)}. Reason: ${esc(f.why)}. Issued in support of an application for solo parent benefits.`,
  'Other Certifications': f => `— <b>${esc(f.req)}</b>. This certification is issued for <b>${esc(f.purpose)}</b> purposes.`,
};

/* =====================================================================
   RESIDENT
   ===================================================================== */
let ctx;                                              // { app, me, back }
const draw = html => { ctx.app.innerHTML = html; };
const topbar = (title, backId) => `<div class="top"><button id="${backId}" title="Back">‹</button><h2>${esc(title)}</h2></div>`;
const bind = (id, fn) => { if ($(id)) $(id).onclick = fn; };

export function openResident(c, screen = 'list', arg) {
  ctx = c;
  ({ list: myRequests, complaint: complaintForm, certs: certMenu, cert: certForm, detail: requestDetail }[screen])(arg);
}

async function myRequests(tab = 'ALL') {
  const { data, error } = await supabase.from('cases')
    .select('id,ref,type,subject,status,step,closed_outcome,filed_at,deletion_requested_at').eq('reporter_id', ctx.me.id).order('filed_at', { ascending: false });
  if (error) return draw(topbar('My Requests', 'bk') + `<div class="wrap">${msg(esc(error.message), 'er')}</div>`), bind('bk', ctx.back);
  const f = (data || []).filter(c => tab === 'ALL' || (tab === 'PENDING' ? c.step === 0 && !isClosed(c) : tab === 'PROCESSING' ? c.step > 0 && !isClosed(c) : isClosed(c)));
  draw(`${topbar('My Requests', 'bk')}<div class="tabs">${['ALL', 'PENDING', 'PROCESSING', 'COMPLETED'].map(t => `<button data-t="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="wrap"><div class="grid"><button id="nc" class="btn">＋ Complaint</button><button id="nr" class="btn">＋ Certificate</button></div>
    ${f.map(c => `<div class="card item" data-id="${c.id}"><div><b>${esc(c.type === 'certificate' ? c.subject : c.subject)}</b><small>${esc(c.ref)} · ${TYPE_LABEL[c.type]} · ${date(c.filed_at)}${c.deletion_requested_at ? ' · deletion requested' : ''}</small></div>${stBadge(c)}</div>`).join('') || '<p class="muted">No requests here yet.</p>'}</div>`);
  bind('bk', ctx.back); bind('nc', () => complaintForm()); bind('nr', () => certMenu());
  document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => myRequests(b.dataset.t); });
  document.querySelectorAll('.item').forEach(i => { i.onclick = () => requestDetail(i.dataset.id); });
}

function complaintForm(c, err = '') {                         // c = existing case (edit) or undefined
  const f = c ? c.form || {} : {};
  draw(`${topbar(c ? 'Edit Complaint' : 'Submit a Complaint', 'bk')}<div class="wrap">${c ? msg('You can edit this complaint until the barangay acknowledges it.', 'wa') : ''}${err ? msg(esc(err), 'er') : ''}
    ${select('c-cat', 'Complaint Category', CATS, c ? c.category : '')}${field('c-sub', 'Subject', c ? c.subject : '')}${area('c-desc', 'Description', c ? c.details : '')}
    ${field('c-loc', 'Location', f.location || '')}${field('c-date', 'Date of Incident', f.incident_date || new Date().toISOString().slice(0, 10), 'date')}
    <button id="c-go" class="btn">${c ? 'SAVE CHANGES' : 'SUBMIT COMPLAINT'}</button></div>`);
  bind('bk', () => (c ? requestDetail(c.id) : myRequests()));
  bind('c-go', async () => {
    const p = { category: v('c-cat'), subject: v('c-sub'), description: v('c-desc'), location: v('c-loc'), incident_date: v('c-date') };
    if (!confirm(c ? 'Save changes to this complaint?' : 'Are you sure you want to submit this complaint?')) return;
    const r = c ? await supabase.rpc('update_my_request', { p_id: c.id, p }) : await supabase.rpc('file_complaint', { p });
    if (r.error) return complaintForm(c, r.error.message);
    c ? requestDetail(c.id) : done('Complaint Submitted Successfully', r.data);
  });
}

function certMenu() {
  draw(`${topbar('Request a Certificate', 'bk')}<div class="wrap"><p class="muted">Certificates are claimed personally at the Barangay Hall once they are ready.</p>
    ${CERTS.map((c, i) => `<div class="card item" data-i="${i}"><div><b>${c[1]} ${esc(c[0])}</b></div>›</div>`).join('')}</div>`);
  bind('bk', () => myRequests());
  document.querySelectorAll('.item').forEach(i => { i.onclick = () => certForm({ i: +i.dataset.i }); });
}

function certForm({ i, c, err = '' }) {                       // i = certificate index, c = existing case (edit)
  const cert = CERTS[i], me = ctx.me, f = c ? c.form || {} : {};
  const d = (k, x) => (f[k] !== undefined ? f[k] : x);
  const fld = ([id, l, t, o]) => t === 'sel' ? select('x_' + id, l, o, f[id] || '') : t === 'area' ? area('x_' + id, l, f[id] || '') : field('x_' + id, l, f[id] ?? '', t);
  draw(`${topbar(c ? 'Edit Request' : cert[0], 'bk')}<div class="wrap">${err ? msg(esc(err), 'er') : ''}
    ${msg('Check your details and complete the fields below. Fees (if any) are paid at the Barangay Hall when you claim the certificate.')}
    ${field('f-fn', 'First Name', d('fn', me.first_name || ''))}${field('f-mi', 'Middle Initial', d('mi', (me.middle_name || '')[0] || ''))}${field('f-ln', 'Last Name', d('ln', me.last_name || ''))}
    <div class="grid"><div>${field('f-ag', 'Age', d('age', age(me.birthdate)), 'number')}</div><div>${field('f-bd', 'Birthdate', d('bd', me.birthdate || ''), 'date')}</div></div>
    ${field('f-ad', 'Current Complete Address (Purok, Street)', d('addr', [me.street, me.purok].filter(Boolean).join(', ')))}
    <h3 style="color:var(--p);margin-top:14px">${esc(cert[0])} Details</h3>${cert[2].map(fld).join('')}
    <button id="f-go" class="btn">${c ? 'SAVE CHANGES' : 'SUBMIT REQUEST'}</button></div>`);
  bind('bk', () => (c ? requestDetail(c.id) : certMenu()));
  bind('f-go', async () => {
    const form = { fn: v('f-fn').trim(), mi: v('f-mi').trim(), ln: v('f-ln').trim(), age: v('f-ag'), bd: v('f-bd'), addr: v('f-ad').trim() };
    cert[2].forEach(([id]) => { form[id] = v('x_' + id).trim(); });
    const missing = !form.fn || !form.ln || !form.age || !form.bd || !form.addr || cert[2].some(([id, l]) => !/Optional/.test(l) && !form[id]);
    if (missing) return certForm({ i, c, err: 'Please fill in all required fields.' });
    const purpose = form.purpose || (i === 6 ? 'Employment (RA 11261)' : i === 7 ? 'Solo parent benefits' : '');
    if (!confirm('Are you sure you want to submit this request?')) return;
    const r = c ? await supabase.rpc('update_my_request', { p_id: c.id, p: { purpose, form } })
                : await supabase.rpc('request_certificate', { p: { service: cert[0], purpose, form } });
    if (r.error) return certForm({ i, c, err: r.error.message });
    c ? requestDetail(c.id) : done('Request Submitted Successfully', r.data);
  });
}

function done(title, ref) {
  draw(`<div class="wrap" style="text-align:center"><div style="font-size:56px">✅</div><h2>${esc(title)}</h2><div class="card">${row('Reference No.', esc(ref))}</div>
    <button id="d1" class="btn">TRACK MY REQUESTS</button><button id="d2" class="btn sec">BACK TO HOME</button></div>`);
  bind('d1', () => myRequests()); bind('d2', ctx.back);
}

async function requestDetail(id) {
  const [{ data: c }, { data: rem }] = await Promise.all([
    supabase.from('cases').select('*, officials(full_name, committees)').eq('id', id).maybeSingle(),
    supabase.from('case_remarks').select('*').eq('case_id', id).eq('auto', false).order('created_at', { ascending: false })]);
  if (!c) return myRequests();
  const editable = c.step === 0 && !isClosed(c) && !c.deletion_requested_at;
  const certIdx = CERTS.findIndex(x => x[0] === c.subject);
  draw(`${topbar(c.type === 'complaint' ? 'Complaint Tracking' : 'Request Status', 'bk')}<div class="wrap"><div class="card">${row('Reference No.', esc(c.ref))}
    ${row(c.type === 'complaint' ? 'Category' : 'Certificate', esc(c.type === 'complaint' ? c.category : c.subject))}${c.type === 'complaint' ? row('Subject', esc(c.subject)) : ''}
    ${row('Date Submitted', date(c.filed_at))}${row('Current Status', stBadge(c))}
    ${c.officials ? row('Assigned To', esc(c.officials.full_name + (c.officials.committees?.[0] ? ' (Committee on ' + c.officials.committees[0] + ')' : ''))) : ''}
    ${c.fee_status ? row('Fee', c.fee_status === 'Paid' ? 'Paid ' + php(c.fee_amount) + ' · OR ' + esc(c.fee_or || '—') : 'Free of charge') : ''}</div>
    <div class="card"><b>Progress</b>${timeline(c)}</div>
    ${rem?.length ? `<div class="card"><b>Updates from the Barangay</b>${rem.map(r => `<div class="row" style="display:block"><small class="muted">${when(r.created_at)} · ${esc(r.author_name || '')}</small><div>${esc(r.body)}</div></div>`).join('')}</div>` : ''}
    ${c.type === 'certificate' && c.step >= 3 && !c.closed_outcome ? msg(c.step === 3 ? 'Your certificate is ready. Please claim it personally at the Barangay Hall with a valid ID.' : 'This certificate was released.', 'ok') : ''}
    ${c.deletion_requested_at ? msg('Deletion requested. Waiting for administrator approval.', 'wa') : ''}
    ${editable ? `<button id="ed" class="btn">✏️ EDIT</button><button id="dl" class="btn er">${c.type === 'certificate' ? '🗑️ DELETE REQUEST' : 'REQUEST DELETION'}</button>`
      : (!c.deletion_requested_at ? msg('This request has been acknowledged or processed and can no longer be edited or deleted.') : '')}</div>`);
  bind('bk', () => myRequests());
  bind('ed', () => (c.type === 'complaint' ? complaintForm(c) : certForm({ i: certIdx < 0 ? 0 : certIdx, c })));
  bind('dl', async () => {
    const complaint = c.type === 'complaint';
    if (!confirm(complaint ? 'Send a deletion request? An administrator must approve it.' : 'Delete this certificate request? This cannot be undone.')) return;
    const { data, error } = await supabase.rpc('delete_my_request', { p_id: c.id, p_reason: null });
    if (error) return alert(error.message);
    data === 'deleted' ? myRequests() : requestDetail(c.id);
  });
}

/* =====================================================================
   STAFF
   ===================================================================== */
export async function staffCases(el, me, filter = { type: 'all', st: 'open' }) {
  el.innerHTML = '<p class="muted">Loading…</p>';
  const { data, error } = await supabase.from('cases').select('*, officials(full_name, committees)').order('filed_at', { ascending: false }).limit(300);
  if (error) { el.innerHTML = msg(esc(error.message), 'er'); return; }
  const f = data.filter(c => (filter.type === 'all' || (filter.type === 'bs' ? ['blotter', 'summons'].includes(c.type) : c.type === filter.type)) &&
    (filter.st === 'all' || (filter.st === 'deletion' ? !!c.deletion_requested_at : filter.st === 'closed' ? isClosed(c) : !isClosed(c))));
  const isAdmin = me.role === 'admin' && !me.is_pb;
  const dels = data.filter(c => c.deletion_requested_at).length;
  el.innerHTML = `${isAdmin ? '<button id="nb" class="btn">＋ Add Blotter / Summons Record</button>' : ''}
    ${dels && isAdmin ? msg(`⚠ ${dels} deletion request${dels > 1 ? 's' : ''} waiting for your decision.`, 'wa') : ''}
    ${select('ft', 'Type', [['all', 'All records'], ['complaint', 'Complaints'], ['certificate', 'Certificate requests'], ['bs', 'Blotter / Summons']], filter.type)}
    ${select('fs', 'Status', [['open', 'Open'], ['closed', 'Closed'], ['deletion', 'Deletion requests'], ['all', 'All']], filter.st)}
    ${f.map(c => `<div class="card item" data-id="${c.id}"><div><b>${esc(c.subject)}</b><small>${esc(c.ref || '—')} · ${TYPE_LABEL[c.type] || c.type} · ${esc(c.officials ? c.officials.full_name : 'Unassigned')}${c.deletion_requested_at ? ' · ⚠ deletion requested' : ''}</small></div>${stBadge(c)}</div>`).join('') || '<p class="muted">No records in this list.</p>'}`;
  const reload = () => staffCases(el, me, { type: v('ft'), st: v('fs') });
  $('ft').onchange = reload; $('fs').onchange = reload;
  bind('nb', () => blotterForm(el, me));
  el.querySelectorAll('.item').forEach(i => { i.onclick = () => staffDetail(el, me, i.dataset.id, filter); });
}

function blotterForm(el, me) {
  el.innerHTML = `<a href="#" id="bk">‹ Back to list</a><h3 style="color:var(--p)">Add Blotter / Summons Record</h3>
    ${select('b-t', 'Record Type', [['blotter', 'Blotter'], ['summons', 'Summons']])}
    ${select('b-c', 'Case Category', ['VAWC', 'Peace and Order', 'Juvenile', 'Theft', 'Illegal Drugs', 'Neighbor Dispute', 'Other'])}
    ${field('b-s', 'Subject / Summary')}${field('b-p', 'Parties Involved (or "Confidential")')}${area('b-d', 'Details (keep sensitive details minimal)')}
    <div id="bm"></div><button id="b-go" class="btn">SAVE RECORD</button>`;
  $('bk').onclick = e => { e.preventDefault(); staffCases(el, me); };
  $('b-go').onclick = async () => {
    const { error } = await supabase.rpc('create_blotter', { p: { type: v('b-t'), category: v('b-c'), subject: v('b-s'), parties: v('b-p'), details: v('b-d') } });
    if (error) $('bm').innerHTML = msg(esc(error.message), 'er'); else staffCases(el, me);
  };
}

async function staffDetail(el, me, id, filter) {
  const [{ data: c }, { data: rem }, { data: offs }] = await Promise.all([
    supabase.from('cases').select('*, officials(full_name, committees, profile_id)').eq('id', id).maybeSingle(),
    supabase.from('case_remarks').select('*').eq('case_id', id).order('created_at', { ascending: false }),
    supabase.from('officials').select('id,full_name,position,committees').in('position', ['Punong Barangay', 'Barangay Kagawad', 'SK Chairperson'])]);
  if (!c) return staffCases(el, me, filter);
  const isAdmin = me.role === 'admin' && !me.is_pb;
  const canWork = me.role === 'admin' || c.officials?.profile_id === me.id;          // Administrator, Punong Barangay, or the assigned official
  const canFee = isAdmin || me.role === 'treasurer';
  const closed = isClosed(c), f = c.form || {};
  const detailRows = c.type === 'certificate' ? Object.entries(f).filter(([k, x]) => x && !['fn', 'mi', 'ln', 'age', 'bd', 'addr'].includes(k)).map(([k, x]) => row(k, esc(x))).join('')
    : `${f.location ? row('Location', esc(f.location)) : ''}${f.incident_date ? row('Date of Incident', esc(f.incident_date)) : ''}${f.parties ? row('Parties', esc(f.parties)) : ''}${c.details ? row('Details', esc(c.details)) : ''}`;
  el.innerHTML = `<a href="#" id="bk">‹ Back to list</a>
    <div class="card"><h3 style="color:var(--p)">${esc(c.subject)}</h3>${row('Reference', esc(c.ref || '—'))}${row('Type', TYPE_LABEL[c.type] || c.type)}${row('Category', esc(c.category || '—'))}
      ${row('Filed by', esc(c.reporter_name || 'Barangay record'))}${row('Date', date(c.filed_at))}${row('Status', stBadge(c))}
      ${row('Assigned to', esc(c.officials ? c.officials.full_name + (c.officials.committees?.[0] ? ' (Committee on ' + c.officials.committees[0] + ')' : '') : 'Unassigned'))}
      ${c.assisted_by ? row('Assisted by', esc(c.assisted_by)) : ''}${c.released_by ? row('Released by', esc(c.released_by) + ' · ' + date(c.released_at)) : ''}
      ${c.fee_status ? row('Fee', c.fee_status === 'Paid' ? 'Paid ' + php(c.fee_amount) + ' · OR ' + esc(c.fee_or || '—') : 'Free') : ''}${detailRows}</div>
    ${canWork && !closed && c.officials ? msg('🛡️ You are working on this record.', 'ok') : ''}
    ${c.deletion_requested_at ? msg('The resident requested deletion of this record.' + (c.deletion_reason ? ' Reason: ' + esc(c.deletion_reason) : ''), 'wa') +
      (isAdmin ? '<button id="da" class="btn">APPROVE DELETION</button><button id="dd" class="btn sec">DECLINE DELETION</button>' : '') : ''}
    ${isAdmin ? `<label for="as">Assign to (elected official or SK Chairperson)</label><select id="as"><option value="">— Select —</option>${(offs || []).map(o => `<option value="${o.id}" ${o.id === c.assigned_official_id ? 'selected' : ''}>${esc(o.full_name)} — ${esc(o.committees?.[0] ? 'Committee on ' + o.committees[0] : o.position)}</option>`).join('')}</select><button id="ab" class="btn sec">ASSIGN</button>` : ''}
    ${canWork && !closed ? `<button id="adv" class="btn">UPDATE STATUS → ${esc(STEPS[c.type][c.step + 1])}</button>` : ''}
    <div class="card"><b>Remarks &amp; Updates</b>${rem?.map(r => `<div class="row" style="display:block"><small class="muted">${when(r.created_at)} · ${esc(r.author_name || '')}${r.auto ? ' · auto' : ''}</small><div>${esc(r.body)}</div></div>`).join('') || '<p class="muted">No remarks yet.</p>'}
      ${canWork ? `${area('rm', 'New remark / note')}<button id="ar" class="btn">＋ ADD REMARK</button>` : ''}</div>
    ${canWork && !closed && c.type !== 'certificate' ? '<button id="cx" class="btn sec">MARK CANCELLED</button><button id="ds" class="btn sec">MARK DISSOLVED</button><p class="muted">Type the reason in the remark box first.</p>' : ''}
    ${canFee && c.type === 'certificate' ? `<div class="card"><b>Fee / Payment</b>${select('fs2', 'Is the certificate free or paid?', ['Paid', 'Free (exempt)'], c.fee_status === 'Free' ? 'Free (exempt)' : 'Paid')}
      ${field('fa', 'Amount Paid (₱)', c.fee_amount ?? '', 'number')}${field('fo', 'O.R. No. (required if paid)', c.fee_or || '')}${field('fn2', 'Remarks / reason if free (e.g. Indigent, RA 11261)')}<button id="sf" class="btn">SAVE FEE RECORD</button></div>` : ''}
    ${c.type === 'certificate' && me.role === 'admin' ? '<button id="pv" class="btn sec">👁️ VIEW CERTIFICATE (PRINT PREVIEW)</button><div id="pvbox"></div>' : ''}
    ${['blotter', 'summons'].includes(c.type) && canWork && !closed ? '<div class="card" id="hrbox"></div>' : ''}<div id="sm"></div>`;
  $('bk').onclick = e => { e.preventDefault(); staffCases(el, me, filter); };
  const run = async (fn, args) => { const { error } = await supabase.rpc(fn, args); if (error) $('sm').innerHTML = msg(esc(error.message), 'er'); else staffDetail(el, me, id, filter); };
  bind('da', () => confirm('Approve this deletion? The record will be removed.') && run('decide_deletion', { p_id: id, p_approve: true }).then(() => staffCases(el, me, filter)));
  bind('dd', () => run('decide_deletion', { p_id: id, p_approve: false }));
  bind('ab', () => (v('as') ? run('assign_case', { p_id: id, p_official: v('as') }) : alert('Select an official first.')));
  bind('adv', () => run('advance_case', { p_id: id }));
  bind('ar', () => run('add_remark', { p_id: id, p_body: v('rm') }));
  bind('cx', () => run('close_case', { p_id: id, p_outcome: 'Cancelled', p_reason: v('rm') }));
  bind('ds', () => run('close_case', { p_id: id, p_outcome: 'Dissolved', p_reason: v('rm') }));
  bind('sf', () => run('record_fee', { p_id: id, p_status: v('fs2') === 'Paid' ? 'Paid' : 'Free', p_amount: Number(v('fa')) || 0, p_or: v('fo'), p_note: v('fn2') }));
  bind('pv', async () => {
    const { data: pb } = await supabase.from('officials').select('full_name').eq('position', 'Punong Barangay').maybeSingle();
    const html = certificateHTML(c, pb ? pb.full_name : '');
    $('pvbox').innerHTML = `<div class="card" style="font-family:'Times New Roman',serif;font-size:13px">${html}</div><button id="pp" class="btn">🖨️ PRINT / SAVE AS PDF</button>`;
    $('pp').onclick = () => printHTML(html, 'SBISP-' + c.ref);
  });
  if ($('hrbox')) { import('./admin-features.js').then(m => { $('hrbox').innerHTML = m.hearingForm(c); m.bindHearingForm($('hrbox'), id); }); }
}

function certificateHTML(c, pbName) {
  const f = c.form || {}, name = [f.fn, f.mi ? f.mi + '.' : '', f.ln].filter(Boolean).join(' ').toUpperCase(), d = new Date();
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const body = (BODY[c.subject] || (() => ''))(f);
  const fee = c.fee_status ? (c.fee_status === 'Paid' ? `O.R. No.: ${esc(c.fee_or || '—')} &nbsp; Amount Paid: ${php(c.fee_amount)}` : 'Issued free of charge') : 'O.R. No.: __________ &nbsp; Amount Paid: ₱_______';
  return reportHeader(c.subject.toUpperCase(), '') + `<p><b>TO WHOM IT MAY CONCERN:</b></p>
    <p style="text-align:justify;text-indent:2em">This is to certify that <b>${esc(name)}</b>, ${esc(f.age)} years old, residing at <b>${esc(f.addr)}</b>, Barangay Guinsorongan, Catbalogan City, Samar, ${body}</p>
    <p style="text-indent:2em">Issued this ${ord(d.getDate())} day of ${d.toLocaleString('en', { month: 'long' })}, ${d.getFullYear()} at Barangay Guinsorongan, Catbalogan City, Samar.</p>
    <div style="display:flex;gap:24px;margin-top:44px;text-align:center"><div style="flex:1;border-top:1px solid #000;padding-top:3px"><b>${esc(name)}</b><br><small>Signature over Printed Name of Requestor</small></div>
      <div style="flex:1;border-top:1px solid #000;padding-top:3px"><b>HON. ${esc((pbName || 'PUNONG BARANGAY').toUpperCase())}</b><br><small>Punong Barangay</small></div></div>
    <p style="margin-top:14px">Assisted by: ${c.assisted_by ? '<b>' + esc(c.assisted_by) + '</b>' : '______________________'}<br>Released by: ${c.released_by ? '<b>' + esc(c.released_by) + '</b> on ' + date(c.released_at) : '______________________ Date: __________'}</p>
    <div style="border-top:2px solid #0B5D33;margin-top:18px;padding-top:6px;font-size:.85em;text-align:center">Control No.: <b>${esc(c.ref)}</b> · Date Issued: ${date(d)}<br>${fee}<br>Valid for six (6) months from the date of issuance · Not valid without the official dry seal</div>`;
}
