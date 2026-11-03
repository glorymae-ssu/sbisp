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
function reg1(err = '') {
  const d = draft;
  show(`<div class="wrap"><a href="#" id="bk">‹ Back to login</a><h2>Create Your Account</h2>${err ? msg(esc(err), 'er') : ''}
    ${field('r-f', 'First Name', d.first)}${field('r-m', 'Middle Name or Initial (optional)', d.middle)}${field('r-l', 'Last Name', d.last)}
    ${field('r-b', 'Date of Birth', d.birth, 'date')}${select('r-s', 'Sex', ['Female', 'Male'], d.sex)}
    ${select('r-c', 'Civil Status', ['Single', 'Married', 'Widow/Widower', 'Single Parent'], d.civil)}
    ${field('r-mo', 'Mobile Number (must be active)', d.mobile, 'tel', '09XXXXXXXXX')}${field('r-p', 'Create Password', d.pw, 'password', 'At least 6 characters')}
    <p class="muted">Your mobile number is used to verify your account and for barangay contact.</p><button id="r-go" class="btn">CONTINUE</button></div>`);
  $('bk').onclick = e => { e.preventDefault(); login(); };
  $('r-go').onclick = () => {
    draft = { first: v('r-f').trim(), middle: v('r-m').trim(), last: v('r-l').trim(), birth: v('r-b'), sex: v('r-s'), civil: v('r-c'), mobile: v('r-mo').trim(), pw: v('r-p') };
    if (!draft.first || !draft.last || !draft.birth) return reg1('First name, last name and date of birth are required.');
    if (!/^09\d{9}$/.test(draft.mobile)) return reg1('Enter a valid 11-digit mobile number (09XXXXXXXXX).');
    if (draft.pw.length < 6) return reg1('Password must be at least 6 characters.');
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
  const d = draft;
  const { data, error } = await supabase.auth.signUp({ email: mobEmail(d.mobile), password: d.pw });
  if (error) return reg1(/registered|exists/i.test(error.message) ? 'This mobile number is already registered. Please log in.' : error.message);
  if (!data.session) return reg1('Email confirmation is still ON in Supabase. Turn it off under Authentication > Providers > Email.');
  const { error: e2 } = await supabase.rpc('register_resident', { p_first: d.first, p_middle: d.middle || null, p_last: d.last,
    p_mobile: d.mobile, p_birthdate: d.birth, p_sex: d.sex, p_civil: d.civil });
  if (e2) return reg1(e2.message);
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

/* ------------------------------------------------------------------ residency registration */
const RTYPES = ['Resident of this Barangay', 'New Resident', 'Transferred from Another Barangay', 'Informal Settler'];
const KEYS = [['rt', 'x-rt'], ['pb', 'x-pb'], ['pm', 'x-pm'], ['pp', 'x-pp'], ['ls', 'x-ls'], ['sr', 'x-sr'], ['yt', 'x-yt'], ['ei', 'x-ei'],
              ['sk', 'x-sk'], ['pn', 'x-pn'], ['sid', 'x-sid'], ['pwd', 'x-pwd'], ['pwi', 'x-pwid']];
const dynHTML = (a, c) => {
  let h = '';
  if (c.rt === 'Transferred from Another Barangay') h += field('x-pb', 'Previous Barangay', c.pb) + field('x-pm', 'Previous Municipality/City', c.pm) + field('x-pp', 'Previous Province', c.pp);
  if (c.rt === 'Informal Settler') h += field('x-ls', 'Length of Stay', c.ls, 'text', 'e.g. 3 years') + field('x-sr', 'Reason for Stay', c.sr);
  if (a >= 15 && a <= 30) {                                   // Youth: 15-30
    h += select('x-yt', 'Youth Status (ages 15-30)', ['In-School Youth', 'Out-of-School Youth'], c.yt);
    if (c.yt === 'Out-of-School Youth') h += select('x-ei', 'Employment Interest', ['Interested to Work', 'Looking for Work'], c.ei);
    if (a <= 17) h += select('x-sk', 'SK Voter Status', ['Registered SK Voter', 'Not yet registered for SK'], c.sk);
  }
  if (a >= 60) {                                              // Senior Citizen: automatic
    h += msg('You are tagged automatically as a Senior Citizen.') + select('x-pn', 'Pension Status', ['Not a pensioner', 'Social Pensioner of the LGU', 'SSS Pensioner', 'Both'], c.pn);
    if (/LGU|Both/.test(c.pn)) h += field('x-sid', 'Senior ID No. (optional)', c.sid);
  }
  h += select('x-pwd', 'Person with Disability (PWD)?', ['No', 'Yes'], c.pwd);
  if (c.pwd === 'Yes') h += field('x-pwid', 'PWD ID No. (optional)', c.pwi);
  return h;
};
async function resid(err = '') {
  const { data: pk } = await supabase.from('puroks').select('name').order('sort');
  const a = age(me.birthdate);
  const cur = { rt: me.residency_type || RTYPES[0], pb: me.previous_barangay || '', pm: me.previous_city || '', pp: me.previous_province || '', ls: me.length_of_stay || '',
    sr: me.stay_reason || '', yt: me.youth_status || 'In-School Youth', ei: me.employment_interest || 'Interested to Work', sk: me.sk_voter_status || 'Not yet registered for SK',
    pn: me.pension_status || 'Not a pensioner', sid: me.senior_id || '', pwd: me.is_pwd ? 'Yes' : 'No', pwi: me.pwd_id || '' };
  show(`<div class="wrap"><h2>Register Your Residency</h2>${me.status === 'correction' ? msg('Barangay note: ' + esc(me.review_note || ''), 'er') : ''}${err ? msg(esc(err), 'er') : ''}
    <p class="muted">Services unlock after the barangay verifies your residency.</p>
    ${select('x-pu', 'Purok', (pk || []).map(p => p.name), me.purok || '')}${field('x-st', 'Street / House No.', me.street || '', 'text', 'e.g. Rizal Street')}
    ${select('x-rt', 'Residency Status', RTYPES, cur.rt)}<div id="dyn">${dynHTML(a, cur)}</div>
    <button id="x-go" class="btn">SUBMIT REGISTRATION</button><button id="x-out" class="btn sec">LOG OUT</button></div>`);
  const sync = () => KEYS.forEach(([k, id]) => { if ($(id)) cur[k] = $(id).value; });
  const redraw = () => { sync(); $('dyn').innerHTML = dynHTML(a, cur); wire(); };
  const wire = () => ['x-rt', 'x-yt', 'x-pn', 'x-pwd'].forEach(id => { if ($(id)) $(id).onchange = redraw; });
  wire();
  $('x-out').onclick = logout;
  $('x-go').onclick = async () => {
    sync();
    const youth = a >= 15 && a <= 30;
    const p = { purok: v('x-pu'), street: v('x-st').trim(), residency_type: cur.rt, previous_barangay: cur.pb, previous_city: cur.pm, previous_province: cur.pp,
      length_of_stay: cur.ls, stay_reason: cur.sr, youth_status: youth ? cur.yt : '', employment_interest: youth && cur.yt === 'Out-of-School Youth' ? cur.ei : '',
      sk_voter_status: a >= 15 && a <= 17 ? cur.sk : '', pension_status: a >= 60 ? cur.pn : '', senior_id: a >= 60 && /LGU|Both/.test(cur.pn) ? cur.sid : '',
      is_pwd: cur.pwd === 'Yes', pwd_id: cur.pwd === 'Yes' ? cur.pwi : '' };
    const { data: ref, error } = await supabase.rpc('submit_residency', { p });
    if (error) return resid(error.message);
    const { data: fresh } = await supabase.from('profiles').select('*').eq('id', me.id).maybeSingle(); me = fresh || me;
    show(`<div class="wrap" style="text-align:center"><div style="font-size:56px">✅</div><h2>Registration Submitted</h2>
      <div class="card">${row('Reference No.', esc(ref))}${row('Status', badge('pending'))}</div>
      <p class="muted">Your residency information was submitted for barangay verification.</p><button id="x-home" class="btn">GO TO HOME</button></div>`);
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
  el.innerHTML = `<a href="#" id="bk">‹ Back to list</a><div class="card"><h3 style="color:var(--p)">${esc(p.full_name)}</h3>${row('Status', badge(p.status))}
    ${row('Reference', esc(p.reference_no || '—'))}${row('Mobile', esc(p.mobile))}${row('Birthdate / Age', esc(p.birthdate || '—') + ' / ' + (age(p.birthdate) ?? '—'))}
    ${row('Sex', esc(p.sex || '—'))}${row('Civil Status', esc(p.civil_status || '—'))}${row('Address', esc((p.street || '—') + ', ' + (p.purok || '—')))}
    ${row('Residency Category', esc(p.residency_type || '—'))}
    ${p.previous_barangay ? row('Previous Barangay', esc(`${p.previous_barangay}, ${p.previous_city || ''}, ${p.previous_province || ''}`)) : ''}
    ${p.length_of_stay ? row('Length of Stay', esc(p.length_of_stay)) : ''}${p.stay_reason ? row('Reason for Stay', esc(p.stay_reason)) : ''}
    ${p.youth_status ? row('Youth Status', esc(p.youth_status)) : ''}${p.employment_interest ? row('Employment Interest', esc(p.employment_interest)) : ''}
    ${p.sk_voter_status ? row('SK Voter Status', esc(p.sk_voter_status)) : ''}${p.pension_status ? row('Pension Status', esc(p.pension_status)) : ''}
    ${p.senior_id ? row('Senior ID', esc(p.senior_id)) : ''}${p.is_pwd ? row('PWD', 'Yes' + (p.pwd_id ? ' · ID ' + esc(p.pwd_id) : '')) : ''}
    ${p.review_note ? row('Last note', esc(p.review_note)) : ''}</div>
    ${canDecide ? `<label for="nt">Note to the resident (required for correction or decline)</label><textarea id="nt"></textarea>
      <button id="ok" class="btn">APPROVE</button><button id="fx" class="btn sec">NEEDS CORRECTION</button><button id="no" class="btn er">DECLINE</button><div id="dm"></div>`
      : (p.status === 'pending' ? msg('Punong Barangay accounts are view-only.') : '')}`;
  $('bk').onclick = e => { e.preventDefault(); residentsTab(el, filter); };
  const decide = async s => {
    const { error: e } = await supabase.rpc('review_residency', { p_user: id, p_status: s, p_note: v('nt') });
    if (e) $('dm').innerHTML = msg(esc(e.message), 'er'); else residentsTab(el, filter);
  };
  if (canDecide) { $('ok').onclick = () => decide('verified'); $('fx').onclick = () => decide('correction'); $('no').onclick = () => decide('declined'); }
}

boot();
