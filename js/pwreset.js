// =====================================================================
// SBISP | pwreset.js
//  Staff screen (Administrator and Barangay Secretary): verify and approve or decline password reset requests.
//  A resident asks for a reset on the login page; they can set a new password only after staff approve.
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc } from './admin-features.js';

const when = d => new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const initials = n => (String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?').toUpperCase();
const CHIP = { pending: ['PENDING', '#FFF0DC', '#B85F00'], approved: ['APPROVED', '#E7F5E4', '#14540D'], rejected: ['DECLINED', '#FDE6E6', '#9B1C1C'], used: ['PASSWORD CHANGED', '#E8EEF9', '#0B2A8A'], expired: ['EXPIRED', '#EEE', '#666'] };

export async function mountPasswordResets(el, me) {
  el.innerHTML = '<p class="muted">Loading\u2026</p>';
  const draw = (rows, flash = '') => {
    el.innerHTML = `<div style="padding:2px 2px 24px">
      <p class="muted" style="margin:0 0 10px">A resident who forgot their password cannot set a new one until you approve. Before approving, confirm it is really them: compare the photo, call the registered number, or ask them to visit the Barangay Hall. An approval is valid for 24 hours.</p>${flash}
      ${rows.map(r => {
        const [label, bg, fg] = CHIP[r.status] || CHIP.expired;
        return `<div style="border:1px solid #E2E6EA;border-radius:14px;padding:12px;margin-bottom:10px;background:#fff">
          <div style="display:flex;gap:12px;align-items:center">
            <span style="width:56px;height:56px;border-radius:50%;overflow:hidden;background:#E3EEFB;color:#0B5CBD;display:flex;align-items:center;justify-content:center;font-weight:800;flex:none">${r.avatar_url ? `<img src="${esc(r.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover">` : esc(initials(r.full_name))}</span>
            <div style="flex:1;min-width:0"><b>${esc(r.full_name || 'Resident')}</b><br><small style="color:#666">${esc(r.purok || '')}${r.purok && r.mobile ? ' \u2022 ' : ''}${esc(r.mobile || '')}</small><br><small style="color:#666">Requested ${esc(when(r.created_at))}</small></div>
            <span style="font-size:11px;font-weight:800;padding:4px 8px;border-radius:99px;background:${bg};color:${fg};white-space:nowrap">${label}</span></div>
          ${r.status === 'pending' ? `<div style="display:flex;gap:8px;margin-top:10px"><button class="btn" data-a="approved" data-id="${esc(r.id)}" style="flex:1;margin:0">Verified: approve</button><button class="btn rd" data-a="rejected" data-id="${esc(r.id)}" style="flex:1;margin:0">Decline</button></div>` : ''}</div>`;
      }).join('') || '<p class="muted">No password reset requests.</p>'}</div>`;
    el.querySelectorAll('button[data-a]').forEach(b => b.onclick = async () => {
      const approve = b.dataset.a === 'approved';
      if (!confirm(approve ? 'Approve this reset? Only do this if you have confirmed it is really the resident.' : 'Decline this reset request?')) return;
      b.disabled = true;
      const { error } = await supabase.rpc('pw_reset_review', { p_id: b.dataset.id, p_decision: b.dataset.a });
      if (error) return load(`<div class="msg er">${esc(error.message)}</div>`);
      load(`<div class="msg">${approve ? 'Approved. Tell the resident to open Forgot Password and tap "Check if my request is approved".' : 'Declined.'}</div>`);
    });
  };
  const load = async (flash = '') => {
    const { data, error } = await supabase.rpc('pw_reset_list');
    if (error) return (el.innerHTML = `<div class="msg er">${esc(error.message)}</div><p class="muted">If this says the function does not exist, run the Password Reset SQL in Supabase first.</p>`);
    draw(data || [], flash);
  };
  load();
}
