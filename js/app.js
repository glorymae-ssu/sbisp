// =====================================================================
// SBISP | app.js  (Phase 1)
// Resident: register, simulated OTP, residency form, home, notifications.
// Staff: residency verification + the admin features from admin-features.js.
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc, mountAnalytics, mountAnnouncementsAdmin, mountFeeSchedule, mountMasterlists,
         mountUpcomingHearings, loadActiveAnnouncements, renderAnnouncements } from './admin-features.js';
import { mountAccounts } from './accounts.js';

const app = document.getElementById('app');
const $ = id => document.getElementById(id);
const v = id => ($(id) ? $(id).value : '');
const show = html => { app.innerHTML = html; };
const msg = (t, k = '') => `<div class="msg ${k}">${t}</div>`;
const mobEmail = m => m + '@sbisp-guinsorongan.app';          // residents log in with a mobile number
const age = b => (b ? Math.floor((Date.now() - new Date(b)) / 31557600000) : null);
const STAT = { unverified: ['Registration not submitted', 'wa'], pending: ['Pending Verification', 'wa'],
  verified: ['Verified Resident', 'ok'], correction: ['Needs Correction', 'er'], declined: ['Declined', 'er'] };
const badge = s => { const [t, c] = STAT[s] || [s, 'bl']; return `<span class="bd ${c}">${esc(t)}</span>`; };
const field = (id, l, val = '', type = 'text', ph = '') =>
  `<label for="${id}">${esc(l)}</label><input id="${id}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}">`;
const select = (id, l, opts, val = '') => `<label for="${id}">${esc(l)}</label><select id="${id}">${opts.map(o => {
  const [value, text] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(value)}" ${value === val ? 'selected' : ''}>${esc(text)}</option>`; }).join('')}</select>`;
const row = (a, b) => `<div class="row"><span>${esc(a)}</span><b>${b}</b></div>`;
const roleLabel = p => p.is_pb ? 'Punong Barangay' : ({ admin: 'Administrator', employee: 'Barangay Employee', kagawad: 'Barangay Kagawad',
  skchair: 'SK Chairperson', treasurer: 'Barangay Treasurer', resident: 'Resident' }[p.role] || p.role);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Maupay nga Aga' : h < 18 ? 'Maupay na Kulop' : 'Maupay na Gab-i'; };

let me = null, draft = {};

/* ------------------------------------------------------------------ start / session */
export async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return login();
  const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (!p) return fatal('Your profile is incomplete. Please log out and register again, or contact the Barangay Hall.');
  if (!p.active) return fatal('This account is deactivated. Please contact the Barangay Hall.');
  me = p; supabase.rpc('touch_login');
  if (me.role !== 'resident') return staff();
  return me.status === 'unverified' ? resid() : home();
}
const fatal = t => { show(`<div class="wrap">${msg(esc(t), 'er')}<button id="lo" class="btn">LOG OUT</button></div>`); $('lo').onclick = logout; };
async function logout() { await supabase.auth.signOut(); me = null; login(); }

/* ------------------------------------------------------------------ login */
function login(err = '', ok = '') {
  show(`<div class="wrap"><h1>SBISP</h1><p class="muted" style="text-align:center">Smart Barangay Information and Service Portal<br>Barangay Guinsorongan, Catbalogan City</p>
    ${err ? msg(esc(err), 'er') : ''}${ok ? msg(esc(ok)) : ''}${field('lg-u', 'Mobile number or email', '', 'text', '09XXXXXXXXX')}${field('lg-p', 'Password', '', 'password')}
    <button id="lg-go" class="btn">LOG IN</button><button id="lg-new" class="btn sec">CREATE ACCOUNT</button>
    <p style="text-align:center;margin-top:14px"><a href="#" id="lg-fp">Forgot password?</a></p></div>`);
  $('lg-go').onclick = async () => {
    const u = v('lg-u').trim(), email = u.includes('@') ? u : mobEmail(u.replace(/\D/g, ''));
    const { error } = await supabase.auth.signInWithPassword({ email, password: v('lg-p') });
    if (error) return login('Incorrect mobile number or password.');
    boot();
  };
  $('lg-new').onclick = () => reg1();
  $('lg-fp').onclick = e => { e.preventDefault(); forgot(); };
}

/* ------------------------------------------------------------------ create account (2 steps) */
const CIVIL = ['Single', 'Married', 'Widow', 'Living-in with Partner', 'Single Parent'];
const PUROKS = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6', 'Purok 7A', 'Purok 7B', 'Purok 8', 'Purok 9'];
const withCur = (list, val) => (val && !list.includes(val) ? [...list, val] : list);
async function purokList() {
  const { data } = await supabase.from('puroks').select('name').order('sort');
  return data && data.length ? data.map(x => x.name) : PUROKS;
}
async function reg1(err = '') {
  const d = draft, pk = await purokList();
  show(`<div class="wrap"><a href="#" id="bk">‹ Back to login</a><h2>Create Your Account</h2><p class="muted">Step 1 of 2: basic information</p>${err ? msg(esc(err), 'er') : ''}
    ${field('r-f', 'First Name', d.first)}${field('r-m', 'Middle Name (optional)', d.middle)}${field('r-l', 'Last Name', d.last)}
    ${select('r-s', 'Sex at Birth', ['Female', 'Male'], d.sex)}${field('r-b', 'Date of Birth', d.birth, 'date')}
    ${field('r-mo', 'Active Mobile Number', d.mobile, 'tel', '09XXXXXXXXX')}
    ${select('r-pu', 'Purok', pk, d.purok)}${field('r-st', 'Street / House No.', d.street, 'text', 'e.g. Rizal Street')}
    ${select('r-v', 'Registered voter in this barangay? (18 and above)', ['No', 'Yes'], d.voter)}
    ${field('r-vp', 'If not, where are you registered?', d.voter_place, 'text', 'Barangay, City/Municipality (optional)')}
    ${select('r-c', 'Civil Status', CIVIL, d.civil)}
    ${field('r-p', 'Create Password', d.pw, 'password', 'At least 6 characters')}${field('r-p2', 'Enter Password Again', d.pw2, 'password')}
    <p class="muted">Your mobile number is used to verify your account and for barangay contact.</p><button id="r-go" class="btn">CONTINUE</button></div>`);
  $('bk').onclick = e => { e.preventDefault(); login(); };
  $('r-go').onclick = () => {
    draft = { first: v('r-f').trim(), middle: v('r-m').trim(), last: v('r-l').trim(), sex: v('r-s'), birth: v('r-b'), mobile: v('r-mo').trim(),
      purok: v('r-pu'), street: v('r-st').trim(), voter: v('r-v'), voter_place: v('r-vp').trim(), civil: v('r-c'), pw: v('r-p'), pw2: v('r-p2') };
    if (!draft.first || !draft.last || !draft.birth) return reg1('First name, last name and date of birth are required.');
    if (new Date(draft.birth) > new Date()) return reg1('Date of birth cannot be in the future.');
    if (!/^09\d{9}$/.test(draft.mobile)) return reg1('Enter a valid 11-digit mobile number (09XXXXXXXXX).');
    if (!draft.street) return reg1('Street / House No. is required.');
    if (draft.pw.length < 6) return reg1('Password must be at least 6 characters.');
    if (draft.pw !== draft.pw2) return reg1('The two passwords do not match.');
    otp();
  };
}
function otp(err = '') {
  show(`<div class="wrap"><a href="#" id="bk">‹ Back</a><h2>Verify Your Mobile Number</h2>
    <p class="muted">We sent a verification code to ${esc(draft.mobile)}.</p>${err ? msg(esc(err), 'er') : ''}
    ${msg('Simulated OTP for this system: <b>123456</b>. No real SMS is sent.', 'wa')}${field('o-c', '6-digit code', '', 'text', '123456')}
    <button id="o-go" class="btn">VERIFY</button></div>`);
  $('bk').onclick = e => { e.preventDefault(); reg1(); };
  $('o-go').onclick = () => (v('o-c').trim() === '123456' ? createAccount() : otp('Incorrect code. Please try again.'));
}
async function createAccount() {
  const d = draft, email = mobEmail(d.mobile);
  let { data, error } = await supabase.auth.signUp({ email, password: d.pw });
  if (error && /registered|exists/i.test(error.message)) {          // retry after an earlier signup that did not finish
    const r = await supabase.auth.signInWithPassword({ email, password: d.pw });
    if (r.error) return reg1('This mobile number is already registered. Please log in.');
    data = r.data; error = null;
  }
  if (error) return reg1(error.message);
  if (!data.session) return reg1('Email confirmation is still ON in Supabase. Turn it off under Authentication > Providers > Email.');
  const { error: e2 } = await supabase.rpc('register_resident_v2', { p: { first: d.first, middle: d.middle, last: d.last, mobile: d.mobile, birthdate: d.birth,
    sex: d.sex, civil: d.civil, purok: d.purok, street: d.street, voter: d.voter, voter_place: d.voter_place } });
  if (e2) { await supabase.auth.signOut(); return reg1(e2.message); }
  draft = {}; boot();
}

/* ------------------------------------------------------------------ forgot password (3 steps) */
let fp = {};
function forgot(err = '') {
  show(`<div class="wrap"><a href="#" id="bk">‹ Back to login</a><h2>Forgot Password</h2>
    <p class="muted">Enter the mobile number you registered with and your date of birth so we can confirm it is you.</p>${err ? msg(esc(err), 'er') : ''}
    ${field('f-mo', 'Mobile Number', fp.mobile, 'tel', '09XXXXXXXXX')}${field('f-b', 'Date of Birth', fp.birth, 'date')}
    <button id="f-go" class="btn">CONTINUE</button></div>`);
  $('bk').onclick = e => { e.preventDefault(); login(); };
  $('f-go').onclick = () => {
    fp = { mobile: v('f-mo').trim(), birth: v('f-b') };
    if (!/^09\d{9}$/.test(fp.mobile) || !fp.birth) return forgot('Enter your 11-digit mobile number and date of birth.');
    forgotOtp();
  };
}
function forgotOtp(err = '') {
  show(`<div class="wrap"><a href="#" id="bk">‹ Back</a><h2>Verify Your Mobile Number</h2>
    <p class="muted">We sent a verification code to ${esc(fp.mobile)}.</p>${err ? msg(esc(err), 'er') : ''}
    ${msg('Simulated OTP for this system: <b>123456</b>. No real SMS is sent.', 'wa')}${field('o-c', '6-digit code', '', 'text', '123456')}
    <button id="o-go" class="btn">VERIFY</button></div>`);
  $('bk').onclick = e => { e.preventDefault(); forgot(); };
  $('o-go').onclick = () => (v('o-c').trim() === '123456' ? forgotNew() : forgotOtp('Incorrect code. Please try again.'));
}
function forgotNew(err = '') {
  show(`<div class="wrap"><h2>Create a New Password</h2>${err ? msg(esc(err), 'er') : ''}
    ${field('n-p', 'New Password', '', 'password', 'At least 6 characters')}${field('n-p2', 'Confirm New Password', '', 'password')}
    <button id="n-go" class="btn">SAVE NEW PASSWORD</button></div>`);
  $('n-go').onclick = async () => {
    const a = v('n-p');
    if (a.length < 6) return forgotNew('Password must be at least 6 characters.');
    if (a !== v('n-p2')) return forgotNew('The two passwords do not match.');
    const { error } = await supabase.rpc('reset_password_self', { p_mobile: fp.mobile, p_birthdate: fp.birth, p_new: a });
    if (error) return forgot(error.message);
    fp = {}; login('', 'Password changed. You can now log in with your new password.');
  };
}

/* ------------------------------------------------------------------ step 2: profile details */
const RTYPES = ['Resident of this Barangay', 'New Resident', 'Transferred from Another Barangay', 'Informal Settler'];
const SCHOOL = ['Elementary', 'Junior High School', 'Senior High School', 'College Level', 'College Graduate'];
const SCHOOL18 = [...SCHOOL, 'Masteral', 'Doctorate', 'ALS Student'];
const DEF = { residency_type: RTYPES[0], school_status: 'In school', school_level: 'Elementary', employment_interest: 'Looking for Work',
  study_interest: 'Interested to continue studying', sk_voter_status: 'Not yet registered for SK', pension_status: 'Not a pensioner', pwd: 'No' };
const DK = [...Object.keys(DEF), 'previous_barangay', 'previous_city', 'previous_province', 'length_of_stay', 'stay_reason', 'senior_id', 'pwd_id'];
const fromProfile = p => ({ ...DEF, residency_type: p.residency_type || DEF.residency_type, previous_barangay: p.previous_barangay || '', previous_city: p.previous_city || '',
  previous_province: p.previous_province || '', length_of_stay: p.length_of_stay || '', stay_reason: p.stay_reason || '',
  school_status: (p.youth_status === 'Out-of-School Youth' || p.employment_interest || p.study_interest) ? 'Out of school' : 'In school',
  school_level: p.school_level || DEF.school_level, employment_interest: p.employment_interest || DEF.employment_interest,
  study_interest: p.study_interest || DEF.study_interest, sk_voter_status: p.sk_voter_status || DEF.sk_voter_status,
  pension_status: p.pension_status || DEF.pension_status, senior_id: p.senior_id || '', pwd: p.is_pwd ? 'Yes' : 'No', pwd_id: p.pwd_id || '' });

function detailHTML(a, c) {
  const f = (k, l, t = 'text', ph = '') => field('d-' + k, l, c[k], t, ph);
  const sel = (k, l, o) => select('d-' + k, l, o, c[k]);
  let h = sel('residency_type', 'Residency Status', RTYPES);
  if (c.residency_type === 'Transferred from Another Barangay') h += f('previous_barangay', 'Previous Barangay') + f('previous_city', 'Previous Municipality/City') + f('previous_province', 'Previous Province');
  if (c.residency_type === 'Informal Settler') h += f('length_of_stay', 'Length of Stay', 'text', 'e.g. 3 years') + f('stay_reason', 'Reason for Stay');
  if (a >= 60) {                                              // Senior Citizen: automatic
    h += msg('You are tagged automatically as a Senior Citizen.') + sel('pension_status', 'Pension Status',
      [['Not a pensioner', 'Not a pensioner'], ['Social Pensioner of the LGU', 'Social Pensioner of the LGU'], ['SSS Pensioner', 'SSS / Other Pensioner'], ['Both', 'Both']]);
    if (/LGU|Both/.test(c.pension_status)) h += f('senior_id', 'Senior ID No. (optional)');
  } else if (a >= 15) {
    h += sel('school_status', 'Are you currently in school?', ['In school', 'Out of school']);
    if (c.school_status === 'In school') h += sel('school_level', 'School Level', a >= 18 ? SCHOOL18 : SCHOOL);
    else h += sel('employment_interest', 'Interested in looking for work?', ['Looking for Work', 'Not looking for work'])
      + sel('study_interest', 'Interested in continuing to study?', ['Interested to continue studying', 'Not interested']);
    if (a <= 17) h += sel('sk_voter_status', 'SK Voter Status', ['Registered SK Voter', 'Not yet registered for SK']);
  }
  h += sel('pwd', 'Person with Disability (PWD)?', ['No', 'Yes']);
  if (c.pwd === 'Yes') h += f('pwd_id', 'PWD ID No. (optional)');
  return h;
}
function detailPayload(a, c) {
  const youth = a >= 15 && a <= 30, adult = a >= 15 && a < 60, inSchool = c.school_status === 'In school', sr = a >= 60 && /LGU|Both/.test(c.pension_status);
  const tr = c.residency_type === 'Transferred from Another Barangay', inf = c.residency_type === 'Informal Settler';
  return { residency_type: c.residency_type, previous_barangay: tr ? c.previous_barangay : '', previous_city: tr ? c.previous_city : '', previous_province: tr ? c.previous_province : '',
    length_of_stay: inf ? c.length_of_stay : '', stay_reason: inf ? c.stay_reason : '',
    youth_status: youth ? (inSchool ? 'In-School Youth' : 'Out-of-School Youth') : '', school_level: adult && inSchool ? c.school_level : '',
    employment_interest: adult && !inSchool ? c.employment_interest : '', study_interest: adult && !inSchool ? c.study_interest : '',
    sk_voter_status: a >= 15 && a <= 17 ? c.sk_voter_status : '', pension_status: a >= 60 ? c.pension_status : '', senior_id: sr ? c.senior_id : '',
    is_pwd: c.pwd === 'Yes', pwd_id: c.pwd === 'Yes' ? c.pwd_id : '' };
}
function bindDetails(cur, getA) {                              // keeps `cur` in sync with the form and redraws the age-based questions
  const sync = () => DK.forEach(k => { const el = $('d-' + k); if (el) cur[k] = el.value; });
  const wire = () => ['residency_type', 'school_status', 'pension_status', 'pwd'].forEach(k => { if ($('d-' + k)) $('d-' + k).onchange = redraw; });
  const redraw = () => { sync(); $('dyn').innerHTML = detailHTML(getA(), cur); wire(); };
  wire();
  return { sync, redraw };
}
async function resid(err = '') {
  const a = age(me.birthdate), cur = fromProfile(me), fix = me.status === 'correction';
  const pk = fix ? await purokList() : [];
  show(`<div class="wrap"><h2>Complete Your Profile</h2><p class="muted">Step 2 of 2</p>${fix ? msg('Barangay note: ' + esc(me.review_note || ''), 'er') : ''}${err ? msg(esc(err), 'er') : ''}
    <p class="muted">Services unlock after the barangay verifies your residency.</p>
    ${fix ? select('x-pu', 'Purok', pk, me.purok || '') + field('x-st', 'Street / House No.', me.street || '') : ''}
    <div id="dyn">${detailHTML(a, cur)}</div>
    <button id="x-go" class="btn">SUBMIT REGISTRATION</button><button id="x-out" class="btn sec">LOG OUT</button></div>`);
  const { sync } = bindDetails(cur, () => a);
  $('x-out').onclick = logout;
  $('x-go').onclick = async () => {
    sync();
    const p = detailPayload(a, cur);
    if (fix) { p.purok = v('x-pu'); p.street = v('x-st').trim(); }
    const { data: ref, error } = await supabase.rpc('submit_profile_v2', { p });
    if (error) return resid(error.message);
    const { data: fresh } = await supabase.from('profiles').select('*').eq('id', me.id).maybeSingle(); me = fresh || me;
    show(`<div class="wrap" style="text-align:center"><div style="font-size:56px">✅</div><h2>Registration Submitted</h2>
      <div class="card">${row('Reference No.', esc(ref))}${row('Status', badge('pending'))}</div>
      <p class="muted">Your information was submitted for barangay verification.</p><button id="x-home" class="btn">GO TO HOME</button></div>`);
    $('x-home').onclick = home;
  };
}

/* ------------------------------------------------------------------ resident home */
async function home() {
  const [ann, nt] = await Promise.all([loadActiveAnnouncements(),
    supabase.from('notifications').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(15)]);
  const first = me.first_name || (me.full_name || '').split(' ')[0];
  const notes = (nt.data || []);
  show(`<div class="top"><h2>${greeting()}, ${esc(first)}!<small>Barangay Guinsorongan</small></h2><button id="lo" title="Log out">⎋</button></div><div class="wrap">
    <div class="card"><small class="muted">Resident Status</small><div style="margin:6px 0">${badge(me.status)}</div>
      ${me.status === 'pending' ? '<p class="muted">Services unlock once the barangay verifies your residency.</p>' : ''}
      ${me.reference_no ? `<p class="muted">Reference: ${esc(me.reference_no)}</p>` : ''}
      ${['correction', 'declined'].includes(me.status) ? msg('Barangay note: ' + esc(me.review_note || ''), 'er') : ''}
      ${me.status === 'correction' ? '<button id="fix" class="btn">UPDATE INFORMATION</button>' : ''}</div>
    ${renderAnnouncements(ann)}
    <h3 style="margin-top:14px;color:var(--p)">Barangay Services</h3>
    <div class="grid">${['Complaints', 'Certificates', 'My Requests', 'Voter Information'].map(s => `<div class="card soon">${s}<br><small class="muted">${me.status === 'verified' ? 'Coming in the next update' : 'Locked until verified'}</small></div>`).join('')}</div>
    <h3 style="margin-top:14px;color:var(--p)">Notifications</h3>
    ${notes.map(n => `<div class="card">${esc(n.text)}<small class="muted" style="display:block">${new Date(n.created_at).toLocaleString('en-PH')}</small></div>`).join('') || '<p class="muted">No notifications yet.</p>'}</div>`);
  $('lo').onclick = logout;
  if ($('fix')) $('fix').onclick = async () => {                       // allow re-submission after correction
    me.status = 'correction'; resid();
  };
  if (notes.some(n => !n.read)) supabase.from('notifications').update({ read: true }).eq('user_id', me.id).eq('read', false);
}

/* ------------------------------------------------------------------ staff shell */
async function staff() {
  const admin = me.role === 'admin';
  const tabs = admin ? ['Residents', 'Accounts', 'Analytics', 'Announcements', 'Fee Schedule', 'Masterlists', 'Hearings']
    : me.role === 'employee' ? ['Residents', 'Hearings'] : ['Hearings'];
  show(`<div class="top"><h2>${greeting()}, ${esc((me.full_name || '').split(' ')[0])}!<small>${esc(roleLabel(me))}${me.is_pb ? ' (view-only)' : ''}</small></h2><button id="lo" title="Log out">⎋</button></div>
    <div class="tabs" id="tabs">${tabs.map(t => `<button data-t="${t}">${t}</button>`).join('')}</div><div class="wrap" id="pane"></div>`);
  $('lo').onclick = logout;
  const views = { Residents: residentsTab, Accounts: mountAccounts, Analytics: mountAnalytics, Announcements: mountAnnouncementsAdmin, 'Fee Schedule': mountFeeSchedule,
    Masterlists: mountMasterlists, Hearings: mountUpcomingHearings };
  const open = t => { document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); views[t]($('pane')); };
  document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => open(b.dataset.t); });
  open(tabs[0]);
}

async function residentsTab(el, filter = 'pending') {
  el.innerHTML = '<p class="muted">Loading…</p>';
  let q = supabase.from('profiles').select('id,full_name,mobile,purok,street,status,reference_no,submitted_at,residency_type')
    .eq('role', 'resident').order('submitted_at', { ascending: false });
  if (filter !== 'all') q = q.eq('status', filter);
  const { data, error } = await q;
  if (error) { el.innerHTML = msg(esc(error.message), 'er'); return; }
  el.innerHTML = select('rf', 'Show', [['pending', 'Pending Verification'], ['correction', 'Needs Correction'], ['verified', 'Verified'], ['declined', 'Declined'], ['unverified', 'Not yet submitted'], ['all', 'All residents']], filter)
    + (data.map(p => `<div class="card item" data-id="${p.id}"><div><b>${esc(p.full_name)}</b><small>${esc(p.reference_no || 'No reference yet')} · ${esc(p.purok || '—')}</small></div>${badge(p.status)}</div>`).join('') || '<p class="muted">No residents in this list.</p>');
  $('rf').onchange = () => residentsTab(el, v('rf'));
  el.querySelectorAll('.item').forEach(i => { i.onclick = () => verifyView(el, i.dataset.id, filter); });
}

async function verifyView(el, id, filter) {
  const { data: p, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error || !p) { el.innerHTML = msg('Could not load this resident.', 'er'); return; }
  const canDecide = (me.role === 'admin' || me.role === 'employee') && !me.is_pb && p.status === 'pending';
  const canEdit = (me.role === 'admin' || me.role === 'employee') && !me.is_pb && ['unverified', 'pending', 'correction'].includes(p.status);
  el.innerHTML = `<a href="#" id="bk">‹ Back to list</a><div class="card"><h3 style="color:var(--p)">${esc(p.full_name)}</h3>${row('Status', badge(p.status))}
    ${row('Reference', esc(p.reference_no || '—'))}${row('Mobile', esc(p.mobile))}${row('Birthdate / Age', esc(p.birthdate || '—') + ' / ' + (age(p.birthdate) ?? '—'))}
    ${row('Sex', esc(p.sex || '—'))}${row('Civil Status', esc(p.civil_status || '—'))}${row('Address', esc((p.street || '—') + ', ' + (p.purok || '—')))}
    ${row('Residency Category', esc(p.residency_type || '—'))}${row('Registered Voter', esc(p.voter_status || '—') + (p.voter_place ? ' · ' + esc(p.voter_place) : ''))}
    ${p.school_level ? row('School Level', esc(p.school_level)) : ''}${p.study_interest ? row('Study Interest', esc(p.study_interest)) : ''}
    ${p.previous_barangay ? row('Previous Barangay', esc(`${p.previous_barangay}, ${p.previous_city || ''}, ${p.previous_province || ''}`)) : ''}
    ${p.length_of_stay ? row('Length of Stay', esc(p.length_of_stay)) : ''}${p.stay_reason ? row('Reason for Stay', esc(p.stay_reason)) : ''}
    ${p.youth_status ? row('Youth Status', esc(p.youth_status)) : ''}${p.employment_interest ? row('Employment Interest', esc(p.employment_interest)) : ''}
    ${p.sk_voter_status ? row('SK Voter Status', esc(p.sk_voter_status)) : ''}${p.pension_status ? row('Pension Status', esc(p.pension_status)) : ''}
    ${p.senior_id ? row('Senior ID', esc(p.senior_id)) : ''}${p.is_pwd ? row('PWD', 'Yes' + (p.pwd_id ? ' · ID ' + esc(p.pwd_id) : '')) : ''}
    ${p.review_note ? row('Last note', esc(p.review_note)) : ''}</div>
    ${canEdit ? '<button id="ed" class="btn sec">EDIT DETAILS</button>' : ''}
    ${canDecide ? `<label for="nt">Note to the resident (required for correction or decline)</label><textarea id="nt"></textarea>
      <button id="ok" class="btn">APPROVE</button><button id="fx" class="btn sec">NEEDS CORRECTION</button><button id="no" class="btn er">DECLINE</button><div id="dm"></div>`
      : (p.status === 'pending' ? msg('Punong Barangay accounts are view-only.') : '')}`;
  $('bk').onclick = e => { e.preventDefault(); residentsTab(el, filter); };
  const decide = async s => {
    const { error: e } = await supabase.rpc('review_residency_v2', { p_user: id, p_status: s, p_note: v('nt') });
    if (e) $('dm').innerHTML = msg(esc(e.message), 'er'); else residentsTab(el, filter);
  };
  if (canEdit) $('ed').onclick = () => editView(el, p, filter);
  if (canDecide) { $('ok').onclick = () => decide('verified'); $('fx').onclick = () => decide('correction'); $('no').onclick = () => decide('declined'); }
}

async function editView(el, p, filter) {                       // admin / secretary may correct a registration before verifying it
  const pk = await purokList(), cur = fromProfile(p), a0 = age(p.birthdate) ?? 0;
  el.innerHTML = `<a href="#" id="bk">‹ Cancel</a><h3 style="color:var(--p);margin-top:8px">Edit details: ${esc(p.full_name)}</h3><div id="em"></div>
    ${field('e-f', 'First Name', p.first_name || '')}${field('e-m', 'Middle Name', p.middle_name || '')}${field('e-l', 'Last Name', p.last_name || '')}
    ${field('e-b', 'Date of Birth', p.birthdate || '', 'date')}${select('e-s', 'Sex at Birth', ['Female', 'Male'], p.sex || '')}
    ${select('e-c', 'Civil Status', withCur(CIVIL, p.civil_status), p.civil_status || '')}${select('e-pu', 'Purok', withCur(pk, p.purok), p.purok || '')}
    ${field('e-st', 'Street / House No.', p.street || '')}${select('e-v', 'Registered voter in this barangay?', ['No', 'Yes'], p.voter_status === 'Registered Voter' ? 'Yes' : 'No')}
    ${field('e-vp', 'Registered place (if not here)', p.voter_place || '')}<div id="dyn">${detailHTML(a0, cur)}</div>
    <button id="e-go" class="btn">SAVE CHANGES</button>`;
  const getA = () => age(v('e-b')) ?? 0;
  const { sync, redraw } = bindDetails(cur, getA);
  $('e-b').onchange = redraw;
  $('bk').onclick = e => { e.preventDefault(); verifyView(el, p.id, filter); };
  $('e-go').onclick = async () => {
    sync();
    const body = { first_name: v('e-f'), middle_name: v('e-m'), last_name: v('e-l'), birthdate: v('e-b'), sex: v('e-s'), civil_status: v('e-c'),
      purok: v('e-pu'), street: v('e-st'), voter: v('e-v'), voter_place: v('e-vp'), ...detailPayload(getA(), cur) };
    const { error } = await supabase.rpc('admin_update_resident', { p_user: p.id, p: body });
    if (error) $('em').innerHTML = msg(esc(error.message), 'er'); else verifyView(el, p.id, filter);
  };
}

boot();
