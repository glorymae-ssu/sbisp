// =====================================================================
// SBISP | accounts.js
// Admin "Accounts" tab: every registered account (the automatic masterlist),
// with search, filter, password reset, activate/deactivate and delete.
// Passwords are never shown: they are stored hashed and cannot be read.
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc } from './admin-features.js';

const ROLE = { admin: 'Administrator', employee: 'Barangay Employee', kagawad: 'Barangay Kagawad',
  skchair: 'SK Chairperson', treasurer: 'Barangay Treasurer', resident: 'Resident' };
const STAT = { unverified: 'Not submitted', pending: 'Pending', verified: 'Verified', correction: 'Needs correction', declined: 'Declined' };
const when = d => (d ? new Date(d).toLocaleString('en-PH') : 'Never');
const msg = (t, k = '') => `<div class="msg ${k}">${esc(t)}</div>`;

export async function mountAccounts(el) {
  el.innerHTML = `<div id="ac-sum"></div><button class="btn" id="ac-add">+ ADD STAFF ACCOUNT</button><div id="ac-form"></div>
    <input id="ac-q" placeholder="Search name, mobile or email" style="margin-top:8px">
    <select id="ac-f" style="margin-top:8px"><option value="all">All accounts</option><option value="resident">Residents</option>
      <option value="staff">Staff and administrators</option><option value="off">Deactivated</option></select>
    <div id="ac-note"></div><div id="ac-list"><p class="muted">Loading…</p></div>`;

  const { data: { session } } = await supabase.auth.getSession();
  const myId = session?.user?.id;
  let rows = [], q = '', f = 'all', open = null, note = '';

  const load = async () => {
    const { data, error } = await supabase.rpc('admin_accounts');
    if (error) { note = msg(error.message, 'er'); rows = []; } else rows = data || [];
  };

  const draw = () => {
    const res = rows.filter(r => r.role === 'resident').length;
    el.querySelector('#ac-sum').innerHTML = `<div class="card"><div class="row"><span>Total accounts</span><b>${rows.length}</b></div>
      <div class="row"><span>Residents</span><b>${res}</b></div><div class="row"><span>Staff and administrators</span><b>${rows.length - res}</b></div>
      <div class="row"><span>Deactivated</span><b>${rows.filter(r => !r.active).length}</b></div></div>`;
    el.querySelector('#ac-note').innerHTML = note;
    const list = rows.filter(r => (f === 'all' || (f === 'resident' && r.role === 'resident') || (f === 'staff' && r.role !== 'resident') || (f === 'off' && !r.active))
      && (!q || [r.full_name, r.mobile, r.email].join(' ').toLowerCase().includes(q)));
    el.querySelector('#ac-list').innerHTML = list.map(r => {
      const self = r.id === myId, isAdmin = r.role === 'admin';
      return `<div class="card" data-id="${r.id}" style="cursor:pointer"><div class="item"><div><b>${esc(r.full_name || '(no name)')}</b>
        <small>${esc(r.role === 'resident' ? (r.mobile || '—') : (r.email || r.mobile || '—'))}</small></div>
        <span class="bd ${r.active ? 'ok' : 'er'}">${r.active ? 'Active' : 'Deactivated'}</span></div>
        ${open === r.id ? `<div style="margin-top:8px">${[['Role', ROLE[r.role] || r.role], ['Residency', r.role === 'resident' ? (STAT[r.status] || r.status) : '—'],
          ['Registered', when(r.created_at)], ['Last login', when(r.last_sign_in_at)]].map(([a, b]) => `<div class="row"><span>${a}</span><b>${esc(b)}</b></div>`).join('')}
          <button class="btn sec" data-a="reset" data-id="${r.id}">RESET PASSWORD</button>
          ${self ? '' : `<button class="btn sec" data-a="tog" data-id="${r.id}">${r.active ? 'DEACTIVATE ACCOUNT' : 'ACTIVATE ACCOUNT'}</button>`}
          ${self || isAdmin ? '' : `<button class="btn er" data-a="del" data-id="${r.id}">DELETE ACCOUNT</button>`}</div>` : ''}</div>`;
    }).join('') || '<p class="muted">No accounts match.</p>';
  };

  const act = async (a, id) => {
    const r = rows.find(x => x.id === id); if (!r) return;
    let res, ok = '';
    if (a === 'reset') {
      const pw = prompt(`New temporary password for ${r.full_name} (at least 6 characters):`);
      if (!pw) return;
      res = await supabase.rpc('admin_reset_password', { p_user: id, p_new: pw });
      ok = `Password reset for ${r.full_name}. Give them the new password privately.`;
    } else if (a === 'tog') {
      res = await supabase.rpc('admin_set_active', { p_user: id, p_active: !r.active });
      ok = `${r.full_name} is now ${r.active ? 'deactivated' : 'active'}.`;
    } else if (a === 'del') {
      if (!confirm(`Delete the account of ${r.full_name}? This cannot be undone.`)) return;
      res = await supabase.rpc('admin_delete_account', { p_user: id });
      ok = `Account of ${r.full_name} deleted.`; open = null;
    }
    if (res.error) note = msg(res.error.message, 'er');
    else { note = msg(ok); await load(); }
    draw();
  };

  // ---- add a staff account (Secretary, employees, kagawad, SK, treasurer, administrator) without opening Supabase
  const addForm = () => {
    const box = el.querySelector('#ac-form'), q2 = s => box.querySelector(s);
    box.innerHTML = `<div class="card"><b>New staff account</b><div id="n-msg"></div>
      <label>Full name</label><input id="n-name" placeholder="e.g. Celin Pestolane">
      <label>Mobile number (used to log in)</label><input id="n-mo" type="tel" placeholder="09XXXXXXXXX">
      <label>Role</label><select id="n-role"><option value="employee">Barangay Secretary / Employee</option><option value="kagawad">Barangay Kagawad</option>
        <option value="skchair">SK Chairperson</option><option value="treasurer">Barangay Treasurer</option><option value="admin">Administrator</option></select>
      <label>Temporary password</label><input id="n-pw" type="text" placeholder="At least 6 characters">
      <button class="btn" id="n-go">CREATE ACCOUNT</button><button class="btn sec" id="n-cancel">CANCEL</button></div>`;
    q2('#n-cancel').onclick = () => { box.innerHTML = ''; };
    q2('#n-go').onclick = async () => {
      const name = q2('#n-name').value.trim(), mob = q2('#n-mo').value.trim(), pw = q2('#n-pw').value, role = q2('#n-role').value;
      const fail = t => { q2('#n-msg').innerHTML = msg(t, 'er'); };
      if (!name) return fail('Enter the full name.');
      if (!/^09\d{9}$/.test(mob)) return fail('Enter a valid 11-digit mobile number (09XXXXXXXXX).');
      if (pw.length < 6) return fail('The password must be at least 6 characters.');
      if (!supabase.supabaseUrl || !supabase.supabaseKey) return fail('Could not read the project settings. Create the login in Supabase instead.');
      const email = mob + '@sbisp-guinsorongan.app';
      // sign-up goes straight to the auth service so the administrator stays logged in
      const r = await fetch(`${supabase.supabaseUrl}/auth/v1/signup`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: supabase.supabaseKey }, body: JSON.stringify({ email, password: pw }) });
      const j = await r.json().catch(() => ({}));
      const why = j.msg || j.error_description || j.message || '';
      if (!r.ok && !/registered|exists/i.test(why)) return fail(why || 'The login could not be created.');
      const { error } = await supabase.rpc('admin_create_staff', { p_email: email, p_name: name, p_mobile: mob, p_role: role });
      if (error) return fail(error.message);
      box.innerHTML = ''; note = msg(`Account created for ${name}. They log in with ${mob} and the temporary password.`);
      await load(); draw();
    };
  };
  el.querySelector('#ac-add').onclick = addForm;

  el.querySelector('#ac-q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
  el.querySelector('#ac-f').onchange = e => { f = e.target.value; draw(); };
  el.querySelector('#ac-list').onclick = e => {
    const b = e.target.closest('button[data-a]');
    if (b) return act(b.dataset.a, b.dataset.id);
    const c = e.target.closest('.card[data-id]');
    if (c) { open = open === c.dataset.id ? null : c.dataset.id; draw(); }
  };

  await load(); draw();
}
