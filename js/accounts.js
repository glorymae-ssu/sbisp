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
  el.innerHTML = `<div id="ac-sum"></div>
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
