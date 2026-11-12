// =====================================================================
// SBISP | complaints.js
//  - mountComplaints: staff view (Figma "Manage Complaints"): search, status chips, update status, assign officer
//      admin + Barangay Secretary  -> all complaints, update status, assign an officer
//      kagawad / SK chair / treasurer -> only the complaints assigned to them, update status
//      Punong Barangay (view-only)  -> all complaints, read only
//  - mountMyComplaints: resident view to file and track their own complaints
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc } from './admin-features.js';

const ST = { pending: ['PENDING', 'pd'], ongoing: ['ONGOING', 'og'], resolved: ['RESOLVED', 'rs'] };
const CATS = ['Illegal Dumping', 'Drainage / Flooding', 'Street Light / Infrastructure', 'Noise / Nuisance', 'Stray Animals', 'Peace and Order', 'Sanitation', 'Other'];
const day = d => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const chip = s => `<span class="cp-chip ${(ST[s] || ST.pending)[1]}">${(ST[s] || ST.pending)[0]}</span>`;
const note = (t, k = '') => `<div class="msg ${k}">${esc(t)}</div>`;
const SEARCH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
const SLIDERS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>';
const ROLE = { employee: 'Secretary / Employee', kagawad: 'Kagawad', skchair: 'SK Chairperson', treasurer: 'Treasurer' };
const group = (officers, cur) => {                       // officials from the Organizational Structure, with position and committee
  const g = {}; officers.forEach(x => { (g[x.grp || 'Officials'] = g[x.grp || 'Officials'] || []).push(x); });
  return Object.entries(g).map(([n, l]) => `<optgroup label="${esc(n)}">${l.map(x => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)} — ${esc(x.position || '')}${x.committees ? ' · ' + esc(x.committees) : ''}${x.has_account ? '' : ' (no login)'}</option>`).join('')}</optgroup>`).join('');
};
const asLine = r => `${r.assigned_name}${r.assigned_position ? ' (' + r.assigned_position + (r.assigned_committees ? ', ' + r.assigned_committees : '') + ')' : ''}`;
const opts = (list, val) => list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`; }).join('');

/* ---------------------------------------------------------------- staff */
export async function mountComplaints(el, me) {
  const mode = me.is_pb ? 'view' : ['admin', 'employee'].includes(me.role) ? 'manage' : 'officer';
  let rows = [], officers = [], q = '', f = 'all', pk = '', cat = '', open = null, assigning = null, flash = '', showFilters = false;
  el.innerHTML = '<p class="muted">Loading…</p>';
  const load = async () => {
    const r = await supabase.rpc('complaints_list');
    if (r.error) { flash = note(r.error.message, 'er'); rows = []; } else rows = r.data || [];
  };
  await load();
  if (mode !== 'officer') officers = (await supabase.rpc('complaint_officers')).data || [];
  const puroks = [...new Set(rows.map(r => r.purok).filter(Boolean))].sort();
  const assigneeOpts = (cur) => group(officers, cur);

  el.innerHTML = `<div class="cp-bar"><div class="cp-s">${SEARCH}<input id="cp-q" placeholder="Search complaints or ID…" autocomplete="off"></div>
      <button id="cp-f" class="cp-fb" aria-label="Filters">${SLIDERS}</button></div><div id="cp-flt"></div><div class="cp-chips" id="cp-chips"></div>
      <div id="cp-flash"></div><div id="cp-list"></div>`;
  const $ = s => el.querySelector(s);
  if (mode === 'officer') $('#cp-flash').insertAdjacentHTML('beforebegin', '<p class="muted">Complaints assigned to you.</p>');

  const card = r => {
    const o = open === r.id, can = mode === 'manage' || (mode === 'officer' && r.assigned_to === me.id);
    const done = r.status === 'resolved';           // a resolved complaint is final: no more status changes or officer assignment
    const panelOpen = `<div class="cp-pn">
      ${r.ref ? `<small class="muted">Reference ${esc(r.ref)}${r.purok ? ' • ' + esc(r.purok) : ''} • ${esc(r.category)}</small>` : ''}
      <div class="cp-r"><span>UPDATE STATUS</span><select class="st" ${can ? '' : 'disabled'}>${opts([['pending', 'Pending'], ['ongoing', 'Ongoing'], ['resolved', 'Resolved']], r.status)}</select></div>
      <textarea class="rm" placeholder="Remarks or action taken (optional)" ${can ? '' : 'disabled'}>${esc(r.remarks || '')}</textarea>
      ${can ? '<button class="cp-g sec" data-a="save">Save Status</button>' : ''}
      ${mode === 'manage' ? (assigning === r.id
        ? (officers.length ? `<div class="cp-r"><span>OFFICER</span></div><select class="of"><option value="">Choose an official…</option>${assigneeOpts(r.assigned_official)}</select>
           <button class="cp-g" data-a="doassign">Confirm Assignment</button>`
           : '<p class="muted">No officials with names yet. Add their names and committees in the Officials tab first.</p>')
        : `<button class="cp-g" data-a="assign">${r.assigned_name ? 'Reassign Barangay Officer' : 'Assign Barangay Officer'}</button>`) : ''}
      ${!can ? `<p class="muted">${mode === 'view' ? 'View only.' : 'Only the assigned officer or the Barangay Secretary can update this complaint.'}</p>` : ''}</div>`;
    const panel = done ? `<div class="cp-pn">${r.ref ? `<small class="muted">Reference ${esc(r.ref)}${r.purok ? ' • ' + esc(r.purok) : ''} • ${esc(r.category)}</small>` : ''}
      <p><b>Status:</b> Resolved</p>${r.assigned_name ? `<p><b>Handled by:</b> ${esc(asLine(r))}</p>` : ''}${r.remarks ? `<p><b>Remarks:</b> ${esc(r.remarks)}</p>` : ''}
      <p class="muted">This complaint is resolved and can no longer be changed. The resident can file a new complaint if the problem happens again.</p></div>` : panelOpen;
    return `<div class="cp-card ${o ? 'open' : ''}" data-id="${r.id}"><div class="cp-top" data-t="1"><b>${esc(r.title)}</b>${chip(r.status)}</div>
      <p data-t="1">${esc(r.description)}</p>
      ${r.assigned_name ? `<small class="cp-as">Assigned to ${esc(asLine(r))}</small>` : r.status !== 'resolved' ? '<small class="cp-un">UNASSIGNED</small>' : ''}
      ${o ? panel : ''}<div class="cp-foot" data-t="1"><span>Filer: ${esc(r.filer_name || '—')} • ${day(r.created_at)}</span><span class="cp-chev">${o ? '⌃' : '⌄'}</span></div></div>`;
  };
  const draw = () => {
    const count = s => rows.filter(r => s === 'all' || r.status === s).length;
    $('#cp-chips').innerHTML = [['all', 'All'], ['pending', 'Pending'], ['ongoing', 'Ongoing'], ['resolved', 'Resolved']]
      .map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l} (${count(k)})</button>`).join('');
    $('#cp-flt').innerHTML = showFilters ? `<div class="cp-flt"><select id="cp-pk"><option value="">All puroks</option>${opts(puroks, pk)}</select>
      <select id="cp-ct"><option value="">All types</option>${opts(CATS, cat)}</select></div>` : '';
    const list = rows.filter(r => (f === 'all' || r.status === f) && (!pk || r.purok === pk) && (!cat || r.category === cat)
      && (!q || [r.title, r.ref, r.filer_name, r.description, r.assigned_name].join(' ').toLowerCase().includes(q)));
    $('#cp-flash').innerHTML = flash;
    $('#cp-list').innerHTML = list.map(card).join('') || '<p class="muted">No complaints in this list.</p>';
  };
  const act = async (a, card) => {
    const id = card.dataset.id; let res, ok;
    if (a === 'save') { res = await supabase.rpc('complaint_update', { p_id: id, p_status: card.querySelector('.st').value, p_remarks: card.querySelector('.rm').value }); ok = 'Complaint updated.'; }
    if (a === 'assign') { assigning = id; return draw(); }
    if (a === 'doassign') { const v = card.querySelector('.of').value; if (!v) { flash = note('Choose an officer first.', 'er'); return draw(); }
      res = await supabase.rpc('complaint_assign', { p_id: id, p_officer: v }); ok = 'Barangay officer assigned.'; }
    if (res.error) flash = note(res.error.message, 'er'); else { flash = note(ok); assigning = null; await load(); }
    draw();
  };
  $('#cp-q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
  $('#cp-f').onclick = () => { showFilters = !showFilters; draw(); };
  $('#cp-flt').onchange = e => { if (e.target.id === 'cp-pk') pk = e.target.value; if (e.target.id === 'cp-ct') cat = e.target.value; draw(); };
  $('#cp-chips').onclick = e => { const b = e.target.closest('button[data-f]'); if (b) { f = b.dataset.f; draw(); } };
  $('#cp-list').onclick = e => {
    const b = e.target.closest('button[data-a]'); const c = e.target.closest('.cp-card'); if (!c) return;
    if (b) return act(b.dataset.a, c);
    if (e.target.closest('[data-t]')) { open = open === c.dataset.id ? null : c.dataset.id; assigning = null; draw(); }
  };
  draw();
}

/* ---------------------------------------------------------------- resident */
export async function mountMyComplaints(el, me, startForm = false) {
  let rows = [], open = null, flash = '';
  const load = async () => { const r = await supabase.rpc('complaints_list'); if (r.error) { flash = note(r.error.message, 'er'); rows = []; } else rows = r.data || []; };

  const form = async (err = '') => {
    const pr = await supabase.from('puroks').select('name').order('sort');
    const pks = (pr.data || []).map(x => x.name); if (me.purok && !pks.includes(me.purok)) pks.unshift(me.purok);
    el.innerHTML = `<a href="#" id="cf-bk">‹ Back to my complaints</a><div class="cp-form">${err ? note(err, 'er') : ''}
      <label>TYPE OF COMPLAINT</label><select id="cf-c">${opts(CATS)}</select>
      <label>PUROK</label><select id="cf-p">${opts(pks, me.purok)}</select>
      <label>WHAT HAPPENED? (include the exact location)</label><textarea id="cf-d" rows="5" placeholder="Describe the problem clearly so the barangay can act on it."></textarea></div>
      <button class="cp-g" id="cf-go">Submit Complaint</button>`;
    el.querySelector('#cf-bk').onclick = e => { e.preventDefault(); show(); };
    el.querySelector('#cf-go').onclick = async () => {
      const btn = el.querySelector('#cf-go'); btn.disabled = true; btn.textContent = 'Submitting…';
      const { data: ref, error } = await supabase.rpc('complaint_submit', { p: { category: el.querySelector('#cf-c').value, purok: el.querySelector('#cf-p').value, description: el.querySelector('#cf-d').value } });
      if (error) return form(error.message);
      flash = note(`Complaint submitted. Reference ${ref}. You will be notified when the barangay acts on it.`); await load(); show();
    };
  };
  const show = () => {
    el.innerHTML = `<button class="cp-g" id="cm-new">+ File a Complaint</button>${flash}
      <div class="qa-h" style="margin-top:16px"><span>MY COMPLAINTS</span></div>
      ${rows.map(r => `<div class="cp-card ${open === r.id ? 'open' : ''}" data-id="${r.id}"><div class="cp-top"><b>${esc(r.title)}</b>${chip(r.status)}</div>
        <p>${esc(r.description)}</p>
        ${open === r.id ? `<div class="cp-pn"><small class="muted">Reference ${esc(r.ref)} • Filed ${day(r.created_at)}</small>
          ${r.assigned_name ? `<p><b>Assigned officer:</b> ${esc(asLine(r))}</p>` : '<p class="muted">Not yet assigned to an officer.</p>'}
          ${r.remarks ? `<p><b>Barangay remarks:</b> ${esc(r.remarks)}</p>` : ''}</div>` : ''}
        <div class="cp-foot"><span>${esc(r.ref)} • ${day(r.created_at)}</span><span class="cp-chev">${open === r.id ? '⌃' : '⌄'}</span></div></div>`).join('') || '<div class="card"><p class="muted">You have not filed any complaints yet.</p></div>'}`;
    el.querySelector('#cm-new').onclick = () => form();
    el.querySelectorAll('.cp-card').forEach(c => { c.onclick = () => { open = open === c.dataset.id ? null : c.dataset.id; show(); }; });
  };
  el.innerHTML = '<p class="muted">Loading…</p>';
  await load();
  if (startForm) form(); else show();
}
