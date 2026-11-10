// =====================================================================
// SBISP | profilereview.js
// The administrator and the Barangay Secretary check profile updates (old value -> new value)
// and approve or reject them. Nobody can review their own update.
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc } from './admin-features.js';

const LABEL = { first_name: 'First name', middle_name: 'Middle name', last_name: 'Last name', full_name: 'Full name', birthdate: 'Date of birth', sex: 'Sex', civil_status: 'Civil status',
  mobile: 'Contact number', contact_email: 'Email address', purok: 'Purok', street: 'Street / house no.', previous_street: 'Previous address', previous_barangay: 'Previous barangay',
  previous_city: 'Previous municipality/city', residing_since: 'Residing here since', voter: 'Voter status', precinct_no: 'Precinct number', youth_status: 'Youth status',
  school_level: 'School level', employment_interest: 'Looking for work', study_interest: 'Continue studying', sk_voter_status: 'SK voter status', pension_status: 'Pension status',
  senior_id: 'Senior ID', is_pwd: 'PWD', pwd_id: 'PWD ID', username: 'Username' };
const VOTER = { this: 'Registered voter – this barangay', other: 'Registered voter – other barangay', not: 'Not a registered voter', unspecified: 'Not specified' };
const val = (k, v) => (v === null || v === undefined || v === '' ? '—' : k === 'voter' ? (VOTER[v] || v) : k === 'is_pwd' ? (v === 'true' || v === true ? 'Yes' : 'No') : String(v));
const when = d => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const note = (t, k = '') => `<div class="msg ${k}">${esc(t)}</div>`;
const ST = { pending: ['WAITING', 'fr'], approved: ['APPROVED', 'rc'], rejected: ['REJECTED', 'rj'] };

export async function mountProfileUpdates(el, me) {
  let rows = [], flash = '';
  el.innerHTML = '<p class="muted">Loading…</p>';
  const load = async () => { const r = await supabase.rpc('profile_updates_list'); if (r.error) { flash = note(r.error.message, 'er'); rows = []; } else rows = r.data || []; };
  await load();
  const draw = () => {
    const pend = rows.filter(r => r.status === 'pending');
    el.innerHTML = `<p class="muted">Check that each change is true and correct before approving. The resident cannot file complaints or request services while an update is waiting.</p>${flash}
      <div class="qa-h"><span>WAITING FOR REVIEW (${pend.length})</span></div>
      ${rows.map(r => `<div class="cp-card" data-id="${r.id}" style="cursor:default"><div class="cp-top"><b style="color:#111">${esc(r.user_name || 'Resident')}</b><span class="cp-chip ${ST[r.status][1]}">${ST[r.status][0]}</span></div>
        <small class="muted">${esc(r.role === 'resident' ? 'Resident' : r.role || '')} • sent ${when(r.created_at)}${r.reviewed_at ? ' • reviewed ' + when(r.reviewed_at) : ''}</small>
        <table class="pu-t">${Object.keys(r.changes || {}).map(k => `<tr><th>${esc(LABEL[k] || k)}</th><td class="pu-o">${esc(val(k, (r.previous || {})[k]))}</td><td class="pu-a">→</td><td class="pu-n">${esc(val(k, r.changes[k]))}</td></tr>`).join('')}</table>
        ${r.note ? `<p class="muted">Note: ${esc(r.note)}</p>` : ''}
        ${r.status === 'pending' ? `<textarea class="rm" placeholder="Note to the resident (required when rejecting)"></textarea>
          <div class="pu-b"><button class="cp-g" data-d="approved">Approve</button><button class="cp-g rj" data-d="rejected">Reject</button></div>` : ''}</div>`).join('') || '<div class="card"><p class="muted">No profile updates yet.</p></div>'}`;
    el.querySelectorAll('button[data-d]').forEach(b => {
      b.onclick = async () => {
        const c = b.closest('.cp-card'), decision = b.dataset.d;
        if (decision === 'approved' && !confirm('Approve this update? It will change the resident\'s record and the masterlist.')) return;
        const { error } = await supabase.rpc('profile_update_review', { p_id: c.dataset.id, p_decision: decision, p_note: c.querySelector('.rm').value });
        if (error) flash = note(error.message, 'er'); else { flash = note(decision === 'approved' ? 'Update approved and applied.' : 'Update rejected. The resident was notified.'); await load(); }
        draw();
      };
    });
  };
  draw();
}
