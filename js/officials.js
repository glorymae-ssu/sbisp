// =====================================================================
// SBISP | officials.js
// Organizational Structure: public chart (login page link) + editor for the
// administrator and the Barangay Secretary (the "Officials" tab).
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc } from './admin-features.js';

const GROUPS = ['Barangay Officials', 'SK Officials', 'Barangay Employees'];
const TOP = /^(punong barangay|sk chairperson)$/i;
const msg = (t, k = '') => `<div class="msg ${k}">${esc(t)}</div>`;

export async function loadOfficials() {
  const { data } = await supabase.from('org_members').select('*').order('sort');
  return data || [];
}

const person = (o, big) => `<div class="og-card${big ? ' big' : ''}">${o.name ? `<b>${esc(o.name)}</b>` : '<b class="tbd">Name to be added</b>'}<small>${esc(o.position)}</small>${o.committees ? `<small class="cm">${esc(o.committees)}</small>` : ''}</div>`;
const sorted = (list, g) => list.filter(o => o.grp === g).sort((a, b) => (a.sort - b.sort) || a.position.localeCompare(b.position));

export function renderOrg(list) {
  if (!list.length) return '<p class="muted">The list of barangay officials has not been posted yet.</p>';
  return GROUPS.map(g => {
    const items = sorted(list, g);
    if (!items.length) return '';
    const top = items.filter(o => TOP.test(o.position)), rest = items.filter(o => !TOP.test(o.position));
    return `<div class="og-g">${esc(g)}</div>${top.length ? `<div class="og-top">${top.map(o => person(o, true)).join('')}</div>${rest.length ? '<div class="og-line"></div>' : ''}` : ''}
      <div class="og-grid">${rest.map(o => person(o)).join('')}</div>`;
  }).join('');
}

export async function mountOfficials(el) {
  let rows = await loadOfficials(), note = '', editing = null;       // editing: null, 'new' or an official's id
  let accts = []; try { accts = (await supabase.rpc('org_staff_accounts')).data || []; } catch (e) { accts = []; }

  const draw = () => {
    if (editing) {
      const o = editing === 'new' ? { name: '', position: '', committees: '', grp: GROUPS[0], sort: rows.length + 1 } : rows.find(r => r.id === editing);
      el.innerHTML = `<a href="#" id="of-bk">‹ Back to list</a><div class="card"><b>${editing === 'new' ? 'Add official' : 'Edit official'}</b><div id="of-msg"></div>
        <label for="of-n">Full name</label><input id="of-n" value="${esc(o.name || '')}" placeholder="Leave blank if not yet decided">
        <label for="of-p">Position</label><input id="of-p" value="${esc(o.position)}" placeholder="e.g. Barangay Kagawad">
        <label for="of-c">Designated committee(s)</label><input id="of-c" value="${esc(o.committees || '')}" placeholder="e.g. Peace and Order; Health (separate with ;)">
        <label for="of-a">Login account (optional)</label><select id="of-a"><option value="">No login account</option>${accts.map(a => `<option value="${a.id}" ${a.id === o.profile_id ? 'selected' : ''}>${esc(a.full_name)}</option>`).join('')}</select>
        <small class="muted">Link a staff account so this official can log in and see the complaints assigned to them.</small>
        <label for="of-g">Group</label><select id="of-g">${GROUPS.map(g => `<option ${g === o.grp ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
        <label for="of-s">Order in the list (1 = first)</label><input id="of-s" type="number" min="1" value="${o.sort}">
        <button class="btn" id="of-save">SAVE</button>${editing === 'new' ? '' : '<button class="btn er" id="of-del">DELETE</button>'}</div>`;
      el.querySelector('#of-bk').onclick = e => { e.preventDefault(); editing = null; draw(); };
      el.querySelector('#of-save').onclick = async () => {
        const g = id => el.querySelector(id).value;
        if (!g('#of-p').trim()) { el.querySelector('#of-msg').innerHTML = msg('Enter the position.', 'er'); return; }
        const { error } = await supabase.rpc('org_save', { p_id: editing === 'new' ? null : editing, p_name: g('#of-n').trim(),
          p_position: g('#of-p').trim(), p_grp: g('#of-g'), p_sort: parseInt(g('#of-s'), 10) || 1, p_committees: g('#of-c').trim(), p_profile: g('#of-a') || null });
        if (error) { el.querySelector('#of-msg').innerHTML = msg(error.message, 'er'); return; }
        rows = await loadOfficials(); editing = null; note = msg('Saved.'); draw();
      };
      if (editing !== 'new') el.querySelector('#of-del').onclick = async () => {
        if (!confirm('Remove this official from the list?')) return;
        const { error } = await supabase.rpc('org_delete', { p_id: editing });
        if (error) { el.querySelector('#of-msg').innerHTML = msg(error.message, 'er'); return; }
        rows = await loadOfficials(); editing = null; note = msg('Removed.'); draw();
      };
      return;
    }
    el.innerHTML = `<button class="btn" id="of-add">+ ADD OFFICIAL</button>${note}<p class="muted">This list appears on the public Organizational Structure page. Tap a name to edit it.</p>`
      + GROUPS.map(g => `<div class="og-g" style="text-align:left">${esc(g)}</div>`
        + (sorted(rows, g).map(o => `<div class="card item" data-id="${o.id}"><div><b>${o.name ? esc(o.name) : '<span class="muted">Name to be added</span>'}</b><small>${esc(o.position)}</small>${o.committees ? `<small>Committee: ${esc(o.committees)}</small>` : ''}</div><span class="muted">#${o.sort}</span></div>`).join('')
          || '<p class="muted">Nobody added yet.</p>')).join('');
    el.querySelector('#of-add').onclick = () => { note = ''; editing = 'new'; draw(); };
    el.querySelectorAll('.item').forEach(i => { i.onclick = () => { note = ''; editing = i.dataset.id; draw(); }; });
  };
  draw();
}
