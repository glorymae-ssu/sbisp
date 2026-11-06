// =====================================================================
// SBISP | app.js  (Phase 1)
// Resident: register, simulated OTP, residency form, home, notifications.
// Staff: residency verification + the admin features from admin-features.js.
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc, mountAnalytics, mountAnnouncementsAdmin, mountFeeSchedule, mountMasterlists,
         mountUpcomingHearings, loadActiveAnnouncements, renderAnnouncements } from './admin-features.js';
import { mountAccounts } from './accounts.js';
import { mountOfficials, loadOfficials, renderOrg } from './officials.js';
import { mountComplaints, mountMyComplaints } from './complaints.js';
import { mountServices, mountServiceRequests, recentActivity } from './services.js';
import { mountDashboard, staffPanels } from './dashboard.js';
import { mountClassification } from './classify.js';

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

let me = null, acct = null;

/* ------------------------------------------------------------------ start / session */
export async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return login();
  acct = session.user;
  const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (!p) { me = null; return home(); }                     // account created, resident registry not done yet
  if (!p.active) return fatal('This account is deactivated. Please contact the Barangay Hall.');
  me = p; supabase.rpc('touch_login');
  if (me.role !== 'resident') return staff();
  return home();
}
const fatal = t => { show(`<div class="wrap">${msg(esc(t), 'er')}<button id="lo" class="btn">LOG OUT</button></div>`); $('lo').onclick = logout; };
async function logout() { await supabase.auth.signOut(); me = null; login(); }

/* ------------------------------------------------------------------ login */
function login(err = '', ok = '') {
  const eye = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  show(`<div class="lg"><div class="lg-hero"><h1>Welcome</h1><p>Sign in to request clearances and report complaints</p></div>
    <div class="lg-card"><img src="logo.png" alt="SBISP" class="lg-logo">${err ? msg(esc(err), 'er') : ''}${ok ? msg(esc(ok)) : ''}
      <label for="lg-u">USERNAME, EMAIL OR MOBILE NUMBER</label><input id="lg-u" type="text" placeholder="Username, email or 09XXXXXXXXX" autocomplete="username" autocapitalize="none">
      <label for="lg-p">PASSWORD</label><div class="pw"><input id="lg-p" type="password" placeholder="Password" autocomplete="current-password"><button type="button" id="lg-eye" aria-label="Show or hide password">${eye}</button></div>
      <a href="#" id="lg-fp" class="lg-fp">Forgot Password?</a>
      <button id="lg-go" class="btn">Login</button></div>
    <div class="lg-or"><span>New to Barangay Portal?</span></div>
    <div class="lg-reg"><button id="lg-new" class="btn out">Register Account</button></div>
    <p class="lg-org"><a href="#" id="lg-org">View Barangay Organizational Structure</a></p></div>`);
  $('lg-eye').onclick = () => { $('lg-p').type = $('lg-p').type === 'password' ? 'text' : 'password'; };
  $('lg-p').onkeydown = e => { if (e.key === 'Enter') $('lg-go').click(); };
  $('lg-go').onclick = async () => {
    const u = v('lg-u').trim(); let email = null;
    if (u.includes('@')) email = u;
    else if (/^[+\d\s-]+$/.test(u)) { let d = u.replace(/\D/g, ''); if (d.startsWith('63')) d = '0' + d.slice(2); else if (d.length === 10) d = '0' + d; email = mobEmail(d); }
    else { const { data } = await supabase.rpc('login_email', { p_identifier: u }); email = data; }
    const bad = 'Incorrect username, mobile number or password.';
    if (!email) return login(bad);
    const { error } = await supabase.auth.signInWithPassword({ email, password: v('lg-p') });
    if (error) return login(bad);
    boot();
  };
  $('lg-new').onclick = () => ca1();
  $('lg-fp').onclick = e => { e.preventDefault(); forgot(); };
  $('lg-org').onclick = e => { e.preventDefault(); orgPage(login); };
}

/* ------------------------------------------------------------------ create account (Canva pages 3 to 6) */
const CIVIL = ['Single', 'Married', 'Widow', 'Living-in with Partner', 'Single Parent'];
const PUROKS = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6', 'Purok 7A', 'Purok 7B', 'Purok 8', 'Purok 9'];
const withCur = (list, val) => (val && !list.includes(val) ? [...list, val] : list);
async function purokList() {
  const { data } = await supabase.from('puroks').select('name').order('sort');
  return data && data.length ? data.map(x => x.name) : PUROKS;
}
const cleanMobile = s => { let d = String(s).replace(/\D/g, ''); if (d.startsWith('63')) d = d.slice(2); if (d.startsWith('0')) d = d.slice(1); return d; };   // 9XXXXXXXXX
let ca = {}, otpTimer = null;
const GREEN = html => show(`<div class="ca">${html}</div>`);
const caErr = e => (e ? `<div class="ca-err">${esc(e)}</div>` : '');
const caHead = '<h1>Create<br>Account</h1><p class="ca-sub">Already Registered? <a href="#" id="ca-in">Log in here.</a></p>';

function ca1(err = '') {
  clearInterval(otpTimer);
  GREEN(`${caHead}${caErr(err)}
    <label for="ca-u">USERNAME</label><input id="ca-u" placeholder="juandelacruz_2026" autocomplete="username" autocapitalize="none" value="${esc(ca.username || '')}">
    <label for="ca-e">EMAIL</label><input id="ca-e" type="email" placeholder="juandelacruz@gmail.com" autocomplete="email" autocapitalize="none" value="${esc(ca.email || '')}">
    <label for="ca-p">PASSWORD</label><input id="ca-p" type="password" placeholder="At least 6 characters" autocomplete="new-password">
    <button id="ca-go" class="ca-btn">Sign up</button><button id="ca-mo" class="ca-btn">Sign up using Mobile Number</button>`);
  $('ca-in').onclick = e => { e.preventDefault(); login(); };
  $('ca-mo').onclick = () => caMobile();
  $('ca-go').onclick = async () => {
    ca = { username: v('ca-u').trim(), email: v('ca-e').trim().toLowerCase() };
    const pw = v('ca-p');
    if (!/^[A-Za-z0-9_.]{4,20}$/.test(ca.username)) return ca1('Username must be 4 to 20 characters: letters, numbers, underscore or dot.');
    if (!/^\S+@\S+\.\S+$/.test(ca.email)) return ca1('Enter a valid email address.');
    if (pw.length < 6) return ca1('Password must be at least 6 characters.');
    const { data: free } = await supabase.rpc('username_available', { p_username: ca.username });
    if (free === false) return ca1('That username is already taken. Please choose another.');
    const { data, error } = await supabase.auth.signUp({ email: ca.email, password: pw, options: { data: { username: ca.username } } });
    if (error) return ca1(/registered|exists/i.test(error.message) ? 'This email is already registered. Please log in.' : error.message);
    if (!data.session) return ca1('Email confirmation is still ON in Supabase. Turn it off under Authentication > Providers > Email.');
    ca = {}; boot();
  };
}
function caMobile(err = '') {                                    // Canva page 4, and page 6 (wrong number) as the error message
  clearInterval(otpTimer);
  GREEN(`${caHead}${caErr(err)}
    <label for="ca-m">MOBILE NUMBER</label><div class="ca-ph"><span>+63</span><input id="ca-m" type="tel" inputmode="numeric" maxlength="11" placeholder="9601234567" value="${esc(ca.m10 || '')}"></div>
    <button id="ca-go" class="ca-btn">Send OTP</button><button id="ca-bk" class="ca-btn ghost">Use username and email instead</button>`);
  $('ca-in').onclick = e => { e.preventDefault(); login(); };
  $('ca-bk').onclick = () => ca1();
  $('ca-go').onclick = async () => {
    const m10 = cleanMobile(v('ca-m')); ca = { m10 };
    if (!/^9\d{9}$/.test(m10)) return caMobile('Wrong number. Enter your 10-digit mobile number, for example 9601234567.');
    const { data: taken } = await supabase.rpc('mobile_taken', { p_mobile: '0' + m10 });
    if (taken) return caMobile('This mobile number is already registered. Please log in or use a different number.');
    caOtp();
  };
}
function caOtp(err = '', left = 120) {                           // Canva page 5: simulated code, 2-minute expiry
  clearInterval(otpTimer);
  GREEN(`${caHead}<div class="ca-h">VERIFY YOUR MOBILE NUMBER</div><p class="ca-i">We sent a 6-digit verification code to:</p>
    <div class="ca-ph"><span>+63</span><input value="${esc(ca.m10)}" readonly></div>${caErr(err)}
    <input id="ca-c" class="ca-code" inputmode="numeric" maxlength="6" placeholder="------" autocomplete="one-time-code" style="margin-top:14px">
    <p class="ca-i">Didn't receive the code?</p><button id="ca-rs" class="ca-btn">Resend OTP</button>
    <p class="ca-i" id="ca-t"></p><p class="ca-i" style="opacity:.8">Demo code: 123456 (no real SMS is sent)</p>`);
  $('ca-in').onclick = e => { e.preventDefault(); login(); };
  const tick = () => {
    if (!$('ca-t')) return clearInterval(otpTimer);
    $('ca-t').textContent = left > 0 ? `Code expires in ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : 'Code expired. Tap Resend OTP.';
    left -= 1; if (left < 0) clearInterval(otpTimer);
  };
  tick(); otpTimer = setInterval(tick, 1000);
  $('ca-rs').onclick = () => caOtp('', 120);
  $('ca-c').oninput = e => {
    const c = e.target.value.replace(/\D/g, ''); e.target.value = c;
    if (c.length < 6) return;
    if (left < 0) return caOtp('That code has expired. Tap Resend OTP.', -1);
    if (c === '123456') { clearInterval(otpTimer); caPw(); } else caOtp('Wrong code. Please try again.', left);
  };
}
function caPw(err = '') {
  GREEN(`${caHead}<div class="ca-h">CREATE YOUR PASSWORD</div>${caErr(err)}
    <label for="ca-p">PASSWORD</label><input id="ca-p" type="password" placeholder="At least 6 characters" autocomplete="new-password">
    <label for="ca-p2">CONFIRM PASSWORD</label><input id="ca-p2" type="password" autocomplete="new-password">
    <button id="ca-go" class="ca-btn">Sign up</button>`);
  $('ca-in').onclick = e => { e.preventDefault(); login(); };
  $('ca-go').onclick = async () => {
    const a = v('ca-p');
    if (a.length < 6) return caPw('Password must be at least 6 characters.');
    if (a !== v('ca-p2')) return caPw('The two passwords do not match.');
    const mob = '0' + ca.m10;
    let { data, error } = await supabase.auth.signUp({ email: mobEmail(mob), password: a, options: { data: { mobile: mob } } });
    if (error) return caPw(/registered|exists/i.test(error.message) ? 'This mobile number is already registered. Please log in.' : error.message);
    if (!data.session) return caPw('Email confirmation is still ON in Supabase. Turn it off under Authentication > Providers > Email.');
    ca = {}; boot();
  };
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

/* ------------------------------------------------------------------ account without registry */
function pre() {
  const name = (me && me.first_name) || (acct && acct.user_metadata && acct.user_metadata.username) || 'Resident';
  show(`<div class="top"><h2>${greeting()}, ${esc(name)}!<small>Barangay Guinsorongan</small></h2><button id="lo" title="Log out">⎋</button></div><div class="wrap">
    <div class="card">${msg('Complete your resident registration to unlock barangay services such as filing complaints and requesting certificates.', 'wa')}
      <button id="rg-start" class="btn">START RESIDENT REGISTRATION</button></div>
    <h3 style="margin-top:14px;color:var(--p)">Barangay Services</h3>
    <div class="grid">${['Complaints', 'Certificates', 'My Requests', 'Voter Information'].map(x => `<div class="card soon">${x}<br><small class="muted">Locked until registered and verified</small></div>`).join('')}</div>
    <p class="lg-org"><a href="#" id="org">View Barangay Organizational Structure</a></p></div>`);
  $('lo').onclick = logout; $('rg-start').onclick = regStart;
  $('org').onclick = e => { e.preventDefault(); orgPage(boot); };
}
async function orgPage(back) {
  show(`<div class="rg"><div class="rg-top"><a href="#" id="og-b" aria-label="Back">←</a><span>Organizational Structure</span></div><div class="rg-body" id="og"><p class="muted">Loading…</p></div></div>`);
  $('og-b').onclick = e => { e.preventDefault(); back(); };
  $('og').innerHTML = renderOrg(await loadOfficials());
}

/* ------------------------------------------------------------------ resident registration (Canva pages 7 to 9) */
const VOTER = [['this', 'Registered Voter - This Barangay'], ['other', 'Registered Voter - Other Barangay'], ['not', 'Not a registered voter'], ['unspecified', 'Not specified']];
const IDS = ['Philippine National ID (PhilSys)', 'Digital National ID (PhilSys e-ID)', 'Paper-type National ID (PhilID / ePhilID printout)', 'Unified Multipurpose Identification (UMID)',
  "Driver's License", 'Passport', 'Senior Citizen ID', 'PWD ID', 'SSS ID', 'GSIS eCard', 'PhilHealth ID', 'PRC ID', 'Postal ID', "Voter's ID / Voter's Certification (COMELEC)",
  'TIN ID', 'NBI Clearance', 'Police Clearance', 'Barangay ID / Barangay Certificate', 'OWWA / OFW ID (iDOLE)', 'Solo Parent ID', 'Student ID (current school)',
  'PSA Birth Certificate (supporting document)', 'Other valid government-issued ID'];
const SCHOOL = ['Elementary', 'Junior High School', 'Senior High School', 'College Level', 'College Graduate'];
const SCHOOL18 = [...SCHOOL, 'Masteral', 'Doctorate', 'ALS Student'];
const DEF = { school_status: 'In school', school_level: 'Elementary', employment_interest: 'Looking for Work', study_interest: 'Interested to continue studying',
  sk_voter_status: 'Not yet registered for SK', pension_status: 'Not a pensioner', pwd: 'No' };
const DK = [...Object.keys(DEF), 'senior_id', 'pwd_id'];
const voterChoice = p => (p.voter_status === 'Registered Voter' ? 'this' : p.voter_place === 'Registered voter in another barangay' ? 'other'
  : p.voter_place === 'Not specified' ? 'unspecified' : (p.id ? 'not' : 'unspecified'));
const fromProfile = p => ({ ...DEF,
  school_status: (p.youth_status === 'Out-of-School Youth' || p.employment_interest || p.study_interest) ? 'Out of school' : 'In school',
  school_level: p.school_level || DEF.school_level, employment_interest: p.employment_interest || DEF.employment_interest,
  study_interest: p.study_interest || DEF.study_interest, sk_voter_status: p.sk_voter_status || DEF.sk_voter_status,
  pension_status: p.pension_status || DEF.pension_status, senior_id: p.senior_id || '', pwd: p.is_pwd ? 'Yes' : 'No', pwd_id: p.pwd_id || '' });

function detailHTML(a, c) {                                       // questions that depend on age
  const f = (k, l) => field('d-' + k, l, c[k]);
  const sel = (k, l, o) => select('d-' + k, l, o, c[k]);
  let h = '';
  if (a >= 60) {
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
  return { youth_status: youth ? (inSchool ? 'In-School Youth' : 'Out-of-School Youth') : '', school_level: adult && inSchool ? c.school_level : '',
    employment_interest: adult && !inSchool ? c.employment_interest : '', study_interest: adult && !inSchool ? c.study_interest : '',
    sk_voter_status: a >= 15 && a <= 17 ? c.sk_voter_status : '', pension_status: a >= 60 ? c.pension_status : '', senior_id: sr ? c.senior_id : '',
    is_pwd: c.pwd === 'Yes', pwd_id: c.pwd === 'Yes' ? c.pwd_id : '' };
}
function bindDetails(cur, getA) {                                 // keeps `cur` in sync with the form and redraws the age-based questions
  const sync = () => DK.forEach(k => { const el = $('d-' + k); if (el) cur[k] = el.value; });
  const wire = () => ['school_status', 'pension_status', 'pwd'].forEach(k => { if ($('d-' + k)) $('d-' + k).onchange = redraw; });
  const redraw = () => { sync(); $('dyn').innerHTML = detailHTML(getA(), cur); wire(); };
  wire();
  return { sync, redraw };
}

let rg = {}, idFile = null;
function rgInit() {
  const p = me || {}, u = (acct && acct.user_metadata) || {}, em = (acct && acct.email) || '';
  const real = em && !em.endsWith('@sbisp-guinsorongan.app') ? em : '';
  rg = { first: p.first_name || '', middle: p.middle_name || '', last: p.last_name || '', birth: p.birthdate || '', sex: p.sex || 'Female', civil: p.civil_status || 'Single',
    mobile: (p.mobile || u.mobile || '').replace(/^0/, ''), mobileLocked: !!u.mobile, email: p.contact_email || real, emailLocked: !!real,
    street: p.street || '', purok: p.purok || '', prev_street: p.previous_street || '', prev_barangay: p.previous_barangay || '', prev_city: p.previous_city || '',
    since: p.residing_since || '', voter: voterChoice(p), cur: fromProfile(p), id_type: p.valid_id_type || IDS[0], id_number: p.id_number || '', id_path: p.id_file_path || '', consent: false };
  idFile = null;
}
const regStart = () => { rgInit(); rg1(); };
const lab = (id, t, hint) => `<label for="${id}">${t}${hint ? ` <em>(${hint})</em>` : ''}</label>`;
const sel2 = (id, l, opts, val) => `<label for="${id}">${l}</label><select id="${id}">${opts.map(o => { const [x, t] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(x)}" ${x === val ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select>`;
const rgHead = (step, sub) => `<div class="rg"><div class="rg-top"><a href="#" id="rg-bk" aria-label="Back">←</a><span>Resident Registration</span></div>
  <div class="rg-step"><b>STEP ${step} OF 3</b><div>${sub}</div><div class="rg-bar"><i style="width:${Math.round(step / 3 * 100)}%"></i></div></div><div class="rg-body">`;
const rgFoot = '</div></div>';

async function rg1(err = '') {
  const pk = await purokList(), a = rg;
  show(`${rgHead(1, 'Personal Details')}${err ? msg(esc(err), 'er') : ''}<div class="rg-card">
    ${lab('g-f', 'FIRSTNAME', 'NGARAN')}<input id="g-f" value="${esc(a.first)}" autocomplete="given-name">
    ${lab('g-m', 'MIDDLENAME', 'BUG-OS NGA BUTNGA')}<input id="g-m" value="${esc(a.middle)}">
    ${lab('g-l', 'LASTNAME', 'APELYIDO')}<input id="g-l" value="${esc(a.last)}" autocomplete="family-name">
    ${lab('g-b', 'DATE OF BIRTH')}<input id="g-b" type="date" value="${esc(a.birth)}">
    ${sel2('g-s', 'BIRTH GENDER', ['Female', 'Male'], a.sex)}${sel2('g-c', 'CIVIL STATUS', CIVIL, a.civil)}
    ${lab('g-mo', 'CONTACT NUMBER', 'ACTIVE CELLPHONE NUMBER')}<div class="rg-ph"><span>+63</span><input id="g-mo" type="tel" inputmode="numeric" maxlength="11" placeholder="9601234567" value="${esc(a.mobile)}" ${a.mobileLocked ? 'readonly' : ''}></div>
    ${lab('g-em', 'EMAIL ADDRESS')}<input id="g-em" type="email" placeholder="juandelacruz@gmail.com" value="${esc(a.email)}" ${a.emailLocked ? 'readonly' : ''}>
    ${lab('g-st', 'CURRENT ADDRESS', 'STREET / HOUSE NUMBER')}<input id="g-st" placeholder="e.g. Sta. Ana Street" value="${esc(a.street)}">
    ${sel2('g-pu', 'PUROK/SITIO', pk, a.purok)}</div>
    <button id="g-go" class="btn">Continue</button>${rgFoot}`);
  const save = () => Object.assign(rg, { first: v('g-f').trim(), middle: v('g-m').trim(), last: v('g-l').trim(), birth: v('g-b'), sex: v('g-s'), civil: v('g-c'),
    mobile: cleanMobile(v('g-mo')), email: v('g-em').trim(), street: v('g-st').trim(), purok: v('g-pu') });
  $('rg-bk').onclick = e => { e.preventDefault(); home(); };
  $('g-go').onclick = () => {
    save();
    if (!rg.first || !rg.last || !rg.birth) return rg1('First name, last name and date of birth are required.');
    if (new Date(rg.birth) > new Date()) return rg1('Date of birth cannot be in the future.');
    if (!/^9\d{9}$/.test(rg.mobile)) return rg1('Enter your 10-digit mobile number, for example 9601234567.');
    if (rg.email && !/^\S+@\S+\.\S+$/.test(rg.email)) return rg1('Enter a valid email address or leave it blank.');
    if (!rg.street) return rg1('Enter your street or house number.');
    rg2();
  };
}
function rg2(err = '') {
  const a = age(rg.birth) ?? 0, adult = a >= 18;
  show(`${rgHead(2, 'Residency details')}${err ? msg(esc(err), 'er') : ''}<div class="rg-card">
    ${lab('g-ps', 'PREVIOUS ADDRESS', 'OPTIONAL')}<input id="g-ps" placeholder="Street" value="${esc(rg.prev_street)}">
    ${lab('g-pb', 'PREVIOUS BARANGAY')}<input id="g-pb" value="${esc(rg.prev_barangay)}">
    ${lab('g-pc', 'MUNICIPALITY/CITY')}<input id="g-pc" value="${esc(rg.prev_city)}">
    ${lab('g-sd', 'DATE STARTED RESIDING IN CURRENT BARANGAY')}<input id="g-sd" type="date" value="${esc(rg.since)}">
    ${adult ? `<label>REGISTERED VOTER STATUS</label>${VOTER.map(([k, t]) => `<label class="rg-radio"><input type="radio" name="g-v" value="${k}" ${rg.voter === k ? 'checked' : ''}> ${esc(t)}</label>`).join('')}
      <div class="rg-note">Voter status does not affect registration or access to basic barangay services.</div>` : ''}
    <div class="rg-h">ADDITIONAL DETAILS</div><div id="dyn">${detailHTML(a, rg.cur)}</div></div>
    <button id="g-go" class="btn">Continue</button>${rgFoot}`);
  const { sync } = bindDetails(rg.cur, () => a);
  const save = () => {
    sync(); Object.assign(rg, { prev_street: v('g-ps').trim(), prev_barangay: v('g-pb').trim(), prev_city: v('g-pc').trim(), since: v('g-sd') });
    const r = document.querySelector('input[name="g-v"]:checked'); rg.voter = adult ? (r ? r.value : 'unspecified') : 'not';
  };
  $('rg-bk').onclick = e => { e.preventDefault(); save(); rg1(); };
  $('g-go').onclick = () => {
    save();
    if (!rg.since) return rg2('Enter the date you started residing in this barangay.');
    if (new Date(rg.since) > new Date()) return rg2('The date you started residing cannot be in the future.');
    rg3();
  };
}
const ID_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' };
function rg3(err = '') {
  show(`${rgHead(3, 'Identity Verification')}${err ? msg(esc(err), 'er') : ''}<div class="rg-card">
    ${sel2('g-it', 'VALID ID', IDS, rg.id_type)}${lab('g-in', 'ID NUMBER')}<input id="g-in" value="${esc(rg.id_number)}">
    ${lab('g-fl', 'UPLOAD ID/SUPPORTING DOCUMENT')}<div class="rg-drop" id="g-drop"><div style="font-size:26px">📄</div><div id="g-fn">${idFile ? esc(idFile.name) : rg.id_path ? 'ID already uploaded. Tap to replace it.' : 'Choose a clear photo (JPEG or PNG) or PDF, up to 5 MB'}</div></div>
    <input id="g-file" type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" hidden>
    <label class="rg-consent"><input type="checkbox" id="g-cs" ${rg.consent ? 'checked' : ''}> I confirm that the information provided is accurate and I consent to its use for barangay registration and service records.</label></div>
    <button id="g-back" class="btn out2">Back</button><button id="g-go" class="btn">Submit Registration</button>${rgFoot}`);
  const save = () => { rg.id_type = v('g-it'); rg.id_number = v('g-in').trim(); rg.consent = $('g-cs').checked; };
  $('rg-bk').onclick = e => { e.preventDefault(); save(); rg2(); };
  $('g-back').onclick = () => { save(); rg2(); };
  $('g-drop').onclick = () => $('g-file').click();
  $('g-file').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) return rg3('The file is too large. Please choose a photo or PDF under 5 MB.');
    if (!ID_TYPES[f.type] && !/\.(png|jpe?g|pdf)$/i.test(f.name)) return rg3('Please choose a PNG, JPEG or PDF file.');
    save(); idFile = f; rg3();
  };
  $('g-go').onclick = async () => {
    save();
    if (!rg.id_number) return rg3('Enter your ID number.');
    if (!idFile && !rg.id_path) return rg3('Upload a clear photo or PDF of your ID.');
    if (!rg.consent) return rg3('Please tick the confirmation box to continue.');
    $('g-go').disabled = true; $('g-go').textContent = 'Submitting…';
    let path = rg.id_path;
    if (idFile) {
      const ext = ID_TYPES[idFile.type] || (idFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').replace('jpeg', 'jpg') || 'jpg';
      path = `${acct.id}/id-${Date.now()}.${ext}`;
      const up = await supabase.storage.from('resident-ids').upload(path, idFile, { contentType: idFile.type || (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg') });
      if (up.error) return rg3('Could not upload your ID: ' + up.error.message);
    }
    const a = age(rg.birth) ?? 0;
    const p = { first: rg.first, middle: rg.middle, last: rg.last, birthdate: rg.birth, sex: rg.sex, civil: rg.civil, mobile: '0' + rg.mobile, email: rg.email,
      purok: rg.purok, street: rg.street, prev_street: rg.prev_street, prev_barangay: rg.prev_barangay, prev_city: rg.prev_city, residing_since: rg.since,
      voter: rg.voter, valid_id_type: rg.id_type, id_number: rg.id_number, id_file_path: path, consent: true, ...detailPayload(a, rg.cur) };
    const { data: ref, error } = await supabase.rpc('submit_registry', { p });
    if (error) return rg3(error.message);
    const { data: fresh } = await supabase.from('profiles').select('*').eq('id', acct.id).maybeSingle(); me = fresh || me;
    show(`<div class="wrap" style="text-align:center"><div style="font-size:56px">✅</div><h2>Registration Submitted</h2>
      <div class="card">${row('Reference No.', esc(ref))}${row('Status', badge('pending'))}</div>
      <p class="muted">Your information was submitted for barangay verification. You will be notified once it is verified.</p><button id="x-home" class="btn">GO TO HOME</button></div>`);
    $('x-home').onclick = () => home();
  };
}

/* ------------------------------------------------------------------ shared pieces (icons, header) */
const ICO = {
  complaint: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>', track: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  alert: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>', stats: '<path d="M5 20v-8M10 20V6M15 20v-10M20 20V3"/>',
  reg: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M12 18v-6M9.5 14.5 12 12l2.5 2.5"/>', svc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 14l2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c3 .2 5 2.2 5 5.3"/>',
  key: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 6l3 3M14 8l2 2"/>', mega: '<path d="M3 11v3h4l8 5V6L7 11z"/><path d="M18 9a4 4 0 0 1 0 6"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.5h-3a1.8 1.8 0 0 0 0 3.5H15"/>', list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  org: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', out: '<path d="M10 4H5v16h5M15 8l4 4-4 4M9 12h10"/>' };
const ico = (n, c = 'currentColor', z = 22) => `<svg width="${z}" height="${z}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICO[n]}</svg>`;
const initials = n => (String(n || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || 'U').toUpperCase();
const hdr = (name, title, sub, right = '', extra = '') => `<div class="hdr"><div class="hdr-row"><div class="av">${esc(initials(name))}</div>
  <div class="hdr-t"><b>${title}</b><span>${sub}</span></div>${right}</div>${extra}</div>`;
const tile = (k, label, icon, color) => `<button class="qa-t" data-k="${esc(k)}"><span class="qa-i">${ico(icon, color)}</span><span class="qa-l" style="color:${color}">${esc(label)}</span></button>`;
const CL_NAVY = '#0B2A8A', CL_GREEN = '#1F7A14', CL_ORANGE = '#E8782A';

/* ------------------------------------------------------------------ resident home (Canva page 10) */
const BLU = '#1565C0', CP_GRN = '#1B8A2E';
const fmtPh = m => (/^09\d{9}$/.test(m || '') ? `+63 ${m.slice(1, 4)} ${m.slice(4, 7)} ${m.slice(7)}` : (m || ''));
const realEmail = e => (e && !e.endsWith('@sbisp-guinsorongan.app') ? e : '');
const resName = () => me ? (me.first_name || (me.full_name || '').split(' ')[0])
  : (acct.user_metadata?.username || ((acct.email || '').endsWith('@sbisp-guinsorongan.app') ? '' : (acct.email || '').split('@')[0]));
const regDone = () => !!me && me.status !== 'unverified';
const lockMsg = () => me?.status === 'verified' ? 'This service is coming in the next update.'
  : regDone() ? 'Services unlock once the barangay verifies your residency.' : 'Complete your resident registration to unlock this service.';
const regEntry = () => { if (!regDone() || me.status === 'correction') { if (me) me.status = me.status === 'correction' ? 'correction' : 'unverified'; regStart(); } else home('profile'); };

async function home(tab = 'home', opt = {}) {
  const uid = acct.id, name = resName() || 'Ka-Barangay';
  const [ann, nt] = await Promise.all([loadActiveAnnouncements(),
    supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(15)]);
  const notes = nt.data || [], unread = notes.some(n => !n.read);
  const T = { complaints: ['Complaints', CP_GRN], analytics: ['Community Stats', CP_GRN], alerts: ['Alerts & News', BLU], profile: ['My Profile', BLU], services: ['Barangay Services', BLU] };
  const bell = `<button id="bell" aria-label="Alerts">${ico('alert', '#fff', 26)}${unread ? '<span class="dot"></span>' : ''}</button>`;
  const search = `<div class="srch"><input id="sq" placeholder="Search services…" autocomplete="off">${ico('search', CL_GREEN, 20)}</div>`;
  const edit = tab === 'profile' && (!me || me.role === 'resident') ? '<a href="#" id="pf-edit">EDIT</a>' : '';
  const head = tab === 'home' ? hdr(name, 'Maupay nga Adlaw!', `Welcome, ${esc(name)}!`, bell, search)
    : `<div class="pg-h"><b style="color:${T[tab][1]}">${esc(T[tab][0])}</b>${edit}</div>`;

  const banner = !regDone() ? `<div class="banner"><b>Complete your resident registration</b><p>Finish your registration to unlock complaints and barangay services.</p><button class="btn" id="reg-now">REGISTER NOW</button></div>`
    : me.status === 'pending' ? `<div class="banner ok"><b>Registration submitted</b><p>Waiting for barangay verification${me.reference_no ? ' · Ref ' + esc(me.reference_no) : ''}.</p></div>`
    : ['correction', 'declined'].includes(me.status) ? `<div class="banner">${msg('Barangay note: ' + esc(me.review_note || ''), 'er')}${me.status === 'correction' ? '<button class="btn" id="fix">UPDATE INFORMATION</button>' : ''}</div>` : '';
  const locked = t => `<div class="card"><b>${t}</b><p class="muted">${lockMsg()}</p>${regDone() ? '' : '<button class="btn" id="reg-now">REGISTER NOW</button>'}</div>`;
  const verified = me?.status === 'verified';
  const body = {
    home: `${banner}<div class="qa-h">Quick Actions</div><div class="qa" id="qa">${tile('complaint-new', 'Submit Complaint', 'complaint', CL_NAVY)}${tile('complaints', 'Track Complaint', 'track', CL_GREEN)}
      ${tile('alerts', 'Alerts & News', 'alert', CL_ORANGE)}${tile('analytics', 'Community Stats', 'stats', CL_GREEN)}${tile('reg', 'Resident Registration', 'reg', CL_NAVY)}${tile('services', 'Barangay Services', 'svc', CL_GREEN)}</div>
      <div class="qa-h"><span>RECENT COMPLAINTS &amp; TRANSACTIONS</span></div><div id="recent"><div class="card"><p class="muted">Loading…</p></div></div>
      <p class="org-link"><a href="#" id="org">View Barangay Organizational Structure</a></p>`,
    complaints: verified ? '<div id="cmp"></div>' : locked('Complaints'), services: verified ? '<div id="svc"></div>' : locked('Barangay Services'),
    analytics: `<div class="card"><b>Community Stats</b><p class="muted">Community statistics are coming in the next update.</p></div>`,
    alerts: `${renderAnnouncements(ann)}<div class="qa-h"><span>Notifications</span></div>`
      + (notes.map(n => `<div class="card">${esc(n.text)}<small class="muted" style="display:block">${new Date(n.created_at).toLocaleString('en-PH')}</small></div>`).join('') || '<p class="muted">No notifications yet.</p>'),
    profile: '<div id="pf"></div>'
  }[tab];
  const nav = [['home', 'Home', 'home'], ['complaints', 'Complaints', 'complaint'], ['analytics', 'Analytics', 'stats'], ['alerts', 'Alerts', 'alert'], ['profile', 'Profile', 'user']];
  show(`${head}<div class="wrap res-pad">${body}</div><nav class="bn">${nav.map(([k, l, i]) => `<button data-n="${k}" class="${tab === k ? 'on' : ''}">${ico(i)}<span>${l}</span></button>`).join('')}</nav>`);

  document.querySelectorAll('.bn button').forEach(b => { b.onclick = () => home(b.dataset.n); });
  if ($('bell')) $('bell').onclick = () => home('alerts');
  document.querySelectorAll('.qa-t').forEach(t => { t.onclick = () => (t.dataset.k === 'reg' ? regEntry() : t.dataset.k === 'complaint-new' ? home('complaints', { form: true }) : home(t.dataset.k)); });
  if ($('sq')) $('sq').oninput = e => { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('.qa-t').forEach(t => { t.style.display = t.textContent.toLowerCase().includes(q) ? '' : 'none'; }); };
  if ($('reg-now')) $('reg-now').onclick = regEntry;
  if ($('fix')) $('fix').onclick = () => { me.status = 'correction'; regStart(); };           // allow re-submission after correction
  if ($('org')) $('org').onclick = e => { e.preventDefault(); orgPage(boot); };
  if (tab === 'complaints' && verified) mountMyComplaints($('cmp'), me, !!opt.form);
  if (tab === 'services' && verified) mountServices($('svc'), me);
  if (tab === 'home' && $('recent')) {
    if (verified) recentActivity(me).then(h => { if ($('recent')) $('recent').innerHTML = h; });
    else $('recent').innerHTML = '<div class="card"><p class="muted">Complaints and requests will appear here after your residency is verified.</p></div>';
  }
  if (tab === 'profile') { profileView($('pf')); if ($('pf-edit')) $('pf-edit').onclick = e => { e.preventDefault(); $('pf-reg').click(); }; }
  if (tab === 'alerts' && unread) supabase.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false);
}

/* ------------------------------------------------------------------ My Profile (Figma), used by every account */
function profileView(el) {
  const isRes = !me || me.role === 'resident';
  const nm = me?.full_name || resName() || 'User';
  const sub = !me ? 'Registration not started' : !isRes ? roleLabel(me)
    : ({ verified: 'Registered Resident', pending: 'Registration pending verification', correction: 'Registration needs correction', declined: 'Registration declined', unverified: 'Registration not submitted' }[me.status] || '');
  const line = [me?.purok, 'Barangay Guinsorongan'].filter(Boolean).join(', ');
  const f = (l, v) => `<div><small>${l}</small><span>${esc(v || '—')}</span></div>`;
  const addr = [me?.street, me?.purok, 'Brgy. Guinsorongan'].filter(Boolean).join(', ');
  el.innerHTML = `<div class="pf-card"><div class="pf-av">${esc(initials(nm))}</div><div class="pf-n">${esc(nm)}</div><div class="pf-s">${esc(sub)}</div>${isRes ? `<div class="pf-a">${esc(line)}</div>` : ''}</div>
    <div class="pf-fields">${f('FULL NAME', nm)}${f('CONTACT NUMBER', fmtPh(me?.mobile))}${f('EMAIL ADDRESS', me?.contact_email || realEmail(acct.email))}${isRes ? f('ADDRESS', addr) : f('ROLE', roleLabel(me))}</div>
    <div id="pf-m"></div>${isRes ? `<button class="btn bl" id="pf-reg">${regDone() ? 'Edit Registration Details' : 'Complete Resident Registration'}</button>` : ''}
    <button class="btn gy" id="pf-pw">Change Password</button><button class="btn rd" id="pf-lo">Logout Account</button>
    <p class="org-link"><a href="#" id="pf-org">View Barangay Organizational Structure</a></p>`;
  if ($('pf-reg')) $('pf-reg').onclick = () => {
    if (!regDone() || me.status === 'correction') return regEntry();
    $('pf-m').innerHTML = msg('Your registration was already submitted. To correct your details, please contact the Barangay Secretary.');
  };
  $('pf-pw').onclick = () => pwView(el);
  $('pf-lo').onclick = logout;
  $('pf-org').onclick = e => { e.preventDefault(); orgPage(boot); };
}
function pwView(el) {
  el.innerHTML = `<a href="#" id="pw-bk">‹ Back to profile</a><div id="pw-m"></div>
    <div class="pf-fields" style="padding:6px 16px 16px">${field('pw-c', 'Current Password', '', 'password')}${field('pw-n', 'New Password', '', 'password', 'At least 6 characters')}${field('pw-n2', 'Confirm New Password', '', 'password')}</div>
    <button class="btn" id="pw-go">SAVE NEW PASSWORD</button>`;
  const bad = t => { $('pw-m').innerHTML = msg(esc(t), 'er'); };
  $('pw-bk').onclick = e => { e.preventDefault(); profileView(el); };
  $('pw-go').onclick = async () => {
    const c = v('pw-c'), n = v('pw-n');
    if (!c) return bad('Enter your current password.');
    if (n.length < 6) return bad('The new password must be at least 6 characters.');
    if (n !== v('pw-n2')) return bad('The two new passwords do not match.');
    $('pw-go').disabled = true;
    const chk = await supabase.auth.signInWithPassword({ email: acct.email, password: c });
    if (chk.error) { $('pw-go').disabled = false; return bad('Your current password is incorrect.'); }
    const { error } = await supabase.auth.updateUser({ password: n });
    if (error) { $('pw-go').disabled = false; return bad(error.message); }
    profileView(el); $('pf-m').innerHTML = msg('Your password was changed.');
  };
}

/* ------------------------------------------------------------------ staff shell (same look as the resident home) */
async function staff() {
  const admin = me.role === 'admin';
  const tabs = me.is_pb ? ['Complaints', 'Service Requests', 'Analytics', 'Hearings', 'My Profile']
    : admin ? ['Residents', 'Complaints', 'Service Requests', 'Residency Classification', 'Accounts', 'Analytics', 'Announcements', 'Fee Schedule', 'Masterlists', 'Officials', 'Hearings', 'My Profile']
    : me.role === 'employee' ? ['Residents', 'Complaints', 'Service Requests', 'Residency Classification', 'Analytics', 'Officials', 'Hearings', 'My Profile']
    : ['Complaints', 'Hearings', 'My Profile'];
  const ICONS = { Residents: ['users', CL_NAVY], Complaints: ['complaint', CL_NAVY], 'Service Requests': ['svc', CL_GREEN], 'Residency Classification': ['reg', CL_NAVY],
    Accounts: ['key', CL_GREEN], Analytics: ['stats', CL_GREEN], Announcements: ['mega', CL_ORANGE], 'Fee Schedule': ['coin', CL_NAVY], Masterlists: ['list', CL_GREEN],
    Officials: ['org', CL_NAVY], Hearings: ['cal', CL_ORANGE], 'My Profile': ['user', CL_GREEN] };
  const views = { Residents: residentsTab, Complaints: el => mountComplaints(el, me), 'Service Requests': el => mountServiceRequests(el, me),
    'Residency Classification': el => mountClassification(el, me), Accounts: mountAccounts, Analytics: el => mountDashboard(el, me, mountAnalytics),
    Announcements: mountAnnouncementsAdmin, 'Fee Schedule': mountFeeSchedule, Masterlists: mountMasterlists, Officials: mountOfficials, Hearings: mountUpcomingHearings, 'My Profile': profileView };
  const out = `<button id="lo" aria-label="Log out">${ico('out', '#fff', 24)}</button>`;
  const head = () => hdr(me.full_name, `${greeting()}, ${esc((me.full_name || '').split(' ')[0])}!`, esc(roleLabel(me)) + (me.is_pb ? ' (view-only)' : ''), out);
  const open = t => {
    if (!views[t] || !tabs.includes(t)) return;
    show(`${head()}<div class="wrap staff"><a href="#" id="sb">‹ Back to menu</a><h3 class="sec-h">${t}</h3><div id="pane"></div></div>`);
    $('lo').onclick = logout; $('sb').onclick = e => { e.preventDefault(); menu(); };
    views[t]($('pane'));
  };
  const menu = () => {
    show(`${head()}<div class="wrap staff"><div id="st-sum"></div><div class="qa-h">Quick Actions</div><div class="qa">${tabs.map(t => tile(t, t, ...ICONS[t])).join('')}</div><div id="st-al"></div></div>`);
    $('lo').onclick = logout;
    document.querySelectorAll('.qa-t').forEach(b => { b.onclick = () => open(b.dataset.k); });
    staffPanels(me).then(p => {
      if (!$('st-sum')) return;
      $('st-sum').innerHTML = p.summary; $('st-al').innerHTML = p.alerts;
      document.querySelectorAll('.al').forEach(a => { a.onclick = () => open(a.dataset.go); });
    }).catch(() => {});
  };
  menu();
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
    ${row('Email', esc(p.contact_email || '—'))}${row('Previous Address', esc([p.previous_street, p.previous_barangay, p.previous_city].filter(Boolean).join(', ') || '—'))}
    ${row('Residing since', esc(p.residing_since || '—'))}${row('Valid ID', esc((p.valid_id_type || '—') + (p.id_number ? ' · ' + p.id_number : '')))}
    ${p.previous_barangay ? row('Previous Barangay', esc(`${p.previous_barangay}, ${p.previous_city || ''}, ${p.previous_province || ''}`)) : ''}
    ${p.length_of_stay ? row('Length of Stay', esc(p.length_of_stay)) : ''}${p.stay_reason ? row('Reason for Stay', esc(p.stay_reason)) : ''}
    ${p.youth_status ? row('Youth Status', esc(p.youth_status)) : ''}${p.employment_interest ? row('Employment Interest', esc(p.employment_interest)) : ''}
    ${p.sk_voter_status ? row('SK Voter Status', esc(p.sk_voter_status)) : ''}${p.pension_status ? row('Pension Status', esc(p.pension_status)) : ''}
    ${p.senior_id ? row('Senior ID', esc(p.senior_id)) : ''}${p.is_pwd ? row('PWD', 'Yes' + (p.pwd_id ? ' · ID ' + esc(p.pwd_id) : '')) : ''}
    ${p.review_note ? row('Last note', esc(p.review_note)) : ''}</div>
    ${p.id_file_path ? '<button id="vid" class="btn sec">VIEW UPLOADED ID</button>' : ''}
    ${canEdit ? '<button id="ed" class="btn sec">EDIT DETAILS</button>' : ''}
    ${canDecide ? `<label for="nt">Note to the resident (required for correction or decline)</label><textarea id="nt"></textarea>
      <button id="ok" class="btn">APPROVE</button><button id="fx" class="btn sec">NEEDS CORRECTION</button><button id="no" class="btn er">DECLINE</button><div id="dm"></div>`
      : (p.status === 'pending' ? msg('Punong Barangay accounts are view-only.') : '')}`;
  $('bk').onclick = e => { e.preventDefault(); residentsTab(el, filter); };
  const decide = async s => {
    const { error: e } = await supabase.rpc('review_residency_v2', { p_user: id, p_status: s, p_note: v('nt') });
    if (e) $('dm').innerHTML = msg(esc(e.message), 'er'); else residentsTab(el, filter);
  };
  if (p.id_file_path) $('vid').onclick = async () => {
    const w = window.open('', '_blank');
    const { data, error: e2 } = await supabase.storage.from('resident-ids').createSignedUrl(p.id_file_path, 300);
    if (e2 || !data) { if (w) w.close(); return alert('Could not open the ID: ' + (e2 ? e2.message : 'not found')); }
    if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
  };
  if (canEdit) $('ed').onclick = () => editView(el, p, filter);
  if (canDecide) { $('ok').onclick = () => decide('verified'); $('fx').onclick = () => decide('correction'); $('no').onclick = () => decide('declined'); }
}

async function editView(el, p, filter) {                       // admin / secretary may correct a registration before verifying it
  const pk = await purokList(), cur = fromProfile(p), a0 = age(p.birthdate) ?? 0;
  el.innerHTML = `<a href="#" id="bk">‹ Cancel</a><h3 style="color:var(--p);margin-top:8px">Edit details: ${esc(p.full_name)}</h3><div id="em"></div>
    ${field('e-f', 'First Name', p.first_name || '')}${field('e-m', 'Middle Name', p.middle_name || '')}${field('e-l', 'Last Name', p.last_name || '')}
    ${field('e-b', 'Date of Birth', p.birthdate || '', 'date')}${select('e-s', 'Birth Gender', ['Female', 'Male'], p.sex || '')}
    ${select('e-c', 'Civil Status', withCur(CIVIL, p.civil_status), p.civil_status || '')}${field('e-em', 'Email Address', p.contact_email || '')}
    ${select('e-pu', 'Purok', withCur(pk, p.purok), p.purok || '')}${field('e-st', 'Street / House No.', p.street || '')}
    ${field('e-ps', 'Previous Address (street)', p.previous_street || '')}${field('e-pb', 'Previous Barangay', p.previous_barangay || '')}${field('e-pc', 'Municipality/City', p.previous_city || '')}
    ${field('e-sd', 'Date started residing here', p.residing_since || '', 'date')}${select('e-v', 'Registered Voter Status', VOTER, voterChoice(p))}
    ${select('e-it', 'Valid ID', withCur(IDS, p.valid_id_type), p.valid_id_type || IDS[0])}${field('e-in', 'ID Number', p.id_number || '')}
    <div id="dyn">${detailHTML(a0, cur)}</div><button id="e-go" class="btn">SAVE CHANGES</button>`;
  const getA = () => age(v('e-b')) ?? 0;
  const { sync, redraw } = bindDetails(cur, getA);
  $('e-b').onchange = redraw;
  $('bk').onclick = e => { e.preventDefault(); verifyView(el, p.id, filter); };
  $('e-go').onclick = async () => {
    sync();
    const body = { first_name: v('e-f'), middle_name: v('e-m'), last_name: v('e-l'), birthdate: v('e-b'), sex: v('e-s'), civil_status: v('e-c'), contact_email: v('e-em'),
      purok: v('e-pu'), street: v('e-st'), prev_street: v('e-ps'), prev_barangay: v('e-pb'), prev_city: v('e-pc'), residing_since: v('e-sd'), voter: v('e-v'),
      valid_id_type: v('e-it'), id_number: v('e-in'), ...detailPayload(getA(), cur) };
    const { error } = await supabase.rpc('admin_update_resident', { p_user: p.id, p: body });
    if (error) $('em').innerHTML = msg(esc(error.message), 'er'); else verifyView(el, p.id, filter);
  };
}

boot();
