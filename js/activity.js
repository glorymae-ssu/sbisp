// =====================================================================
// SBISP | activity.js
// Activity Monitor (administrator only): what is happening in the portal.
// Every edit, update, deletion, registration, complaint and request by the other users, newest first.
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc } from './admin-features.js';

const KINDS = [['all', 'All'], ['account', 'Accounts'], ['registration', 'Registrations'], ['update', 'Updates'], ['delete', 'Deletions'], ['complaint', 'Complaints'], ['service', 'Requests']];
const LABEL = { account: 'ACCOUNT', registration: 'REGISTRATION', update: 'UPDATE', delete: 'DELETED', complaint: 'COMPLAINT', service: 'REQUEST', other: 'ACTIVITY' };
const when = d => new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export async function mountActivity(el) {
  el.innerHTML = '<p class="muted">Loading…</p>';
  const r = await supabase.rpc('activity_list', { p_limit: 300 });
  if (r.error) { el.innerHTML = `<div class="msg er">${esc(r.error.message)} (Run sbisp-activity.sql in Supabase if you have not yet.)</div>`; return; }
  const rows = r.data || [], fresh = rows.filter(x => x.is_new).length;
  let f = 'all', q = '';
  el.innerHTML = `<p class="muted">Edits, updates, deletions and other transactions by the users of the portal.${fresh ? ` <b>${fresh} new</b> since your last visit.` : ''}</p>
    <div class="cp-bar"><div class="cp-s"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
      <input id="ac-q" placeholder="Search name or action…" autocomplete="off"></div></div><div class="cp-chips" id="ac-chips"></div><div id="ac-list"></div>`;
  const $ = s => el.querySelector(s);
  const draw = () => {
    const count = k => rows.filter(x => k === 'all' || x.kind === k).length;
    $('#ac-chips').innerHTML = KINDS.map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l} (${count(k)})</button>`).join('');
    const list = rows.filter(x => (f === 'all' || x.kind === f) && (!q || [x.summary, x.actor_name, x.action].join(' ').toLowerCase().includes(q)));
    $('#ac-list').innerHTML = list.map(x => `<div class="ac-item ${x.is_new ? 'new' : ''}"><span class="ac-k k-${esc(x.kind)}">${LABEL[x.kind] || 'ACTIVITY'}</span>
      <div><b>${esc(x.summary)}</b><small>${esc(when(x.happened_at))}</small></div>${x.is_new ? '<span class="new-pill">NEW</span>' : ''}</div>`).join('') || '<p class="muted">Nothing here yet.</p>';
  };
  $('#ac-q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
  $('#ac-chips').onclick = e => { const b = e.target.closest('button[data-f]'); if (b) { f = b.dataset.f; draw(); } };
  draw();
  supabase.rpc('activity_mark_seen');            // everything shown now counts as seen
}
