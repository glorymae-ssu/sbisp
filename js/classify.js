// =====================================================================
// SBISP | classify.js
// Residency Classification (Figma): authorized staff classify a resident as a voter or non-voter resident,
// from another barangay, temporary / transient, informal settler, non-resident / visitor, or other.
// Saving also updates the population registry for verified residents.
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc } from './admin-features.js';

const OPTS = [['resident_voter', 'Resident – Registered Voter'], ['resident_nonvoter', 'Resident – Not a Registered Voter'], ['another_barangay', 'Resident from Another Barangay'],
  ['transient', 'Temporary/Transient Resident'], ['informal', 'Informal Settler'], ['visitor', 'Non-Resident/Visitor'], ['other', 'Other']];
const LABEL = Object.fromEntries(OPTS);
const SHORT = { resident_voter: 'VOTER', resident_nonvoter: 'NON-VOTER', another_barangay: 'FROM ANOTHER BRGY', transient: 'TRANSIENT', informal: 'INFORMAL SETTLER', visitor: 'VISITOR', other: 'OTHER' };
const initials = n => (String(n || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || 'U').toUpperCase();
const codeOf = p => p.classification
  || (p.residency_type === 'Transferred from Another Barangay' ? 'another_barangay' : p.residency_type === 'Informal Settler' ? 'informal'
    : p.residency_type === 'Temporary/Transient Resident' ? 'transient' : p.residency_type === 'Non-Resident/Visitor' ? 'visitor' : p.residency_type === 'Other' ? 'other'
      : p.voter_status === 'Registered Voter' ? 'resident_voter' : 'resident_nonvoter');
const note = (t, k = '') => `<div class="msg ${k}">${esc(t)}</div>`;

export async function mountClassification(el, me) {
  const can = !me.is_pb;
  let rows = [], q = '', flash = '';
  el.innerHTML = '<p class="muted">Loading…</p>';
  const load = async () => {
    const r = await supabase.from('profiles').select('id, full_name, purok, street, status, reference_no, residency_type, voter_status, classification, classification_notes, previous_barangay, previous_city, previous_street, residing_since, length_of_stay, current_area')
      .eq('role', 'resident').in('status', ['pending', 'verified', 'correction']).order('full_name').limit(500);
    if (r.error) { flash = note(r.error.message + ' (Run sbisp-dashboard.sql in Supabase if you have not yet.)', 'er'); rows = []; } else rows = r.data || [];
  };
  await load();

  const list = () => {
    el.innerHTML = `<div class="cl-auth"><b>AUTHORIZED PERSONNEL ONLY</b><small>${can ? 'Staff Admin' : 'View only'}</small></div>
      <p class="muted">Open resident classification for informal settlers and residents from another barangay.</p>${flash}
      <div class="cp-bar"><div class="cp-s"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input id="cl-q" placeholder="Search resident name or purok…" value="${esc(q)}" autocomplete="off"></div></div><div id="cl-list"></div>`;
    const draw = () => {
      const l = rows.filter(r => !q || [r.full_name, r.purok, r.reference_no].join(' ').toLowerCase().includes(q));
      el.querySelector('#cl-list').innerHTML = l.map(r => `<div class="cl-row" data-id="${r.id}"><span class="cl-av">${esc(initials(r.full_name))}</span>
        <div><b>${esc(r.full_name)}</b><small>${esc(r.reference_no || '')} • ${esc(r.purok || '—')}</small></div><span class="cp-chip as">${esc(SHORT[codeOf(r)])}</span></div>`).join('') || '<p class="muted">No residents found.</p>';
      el.querySelectorAll('.cl-row').forEach(c => { c.onclick = () => form(rows.find(r => r.id === c.dataset.id)); });
    };
    el.querySelector('#cl-q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
    draw();
  };

  const form = (r, err = '') => {
    const d = { code: codeOf(r), previous_barangay: r.previous_barangay || '', previous_city: r.previous_city || '', previous_street: r.previous_street || '', residing_since: r.residing_since || '',
      length_of_stay: r.length_of_stay || '', current_area: r.current_area || '', notes: r.classification_notes || '' };
    const g = s => el.querySelector(s);
    const field = (id, l, v, t = 'text', ph = '') => `<label>${l}</label><input id="${id}" type="${t}" value="${esc(v)}" placeholder="${esc(ph)}" ${can ? '' : 'disabled'}>`;
    const dyn = () => `${d.code === 'another_barangay' ? field('f-pb', 'PREVIOUS BARANGAY', d.previous_barangay) + field('f-pc', 'PREVIOUS MUNICIPALITY/CITY', d.previous_city) + field('f-ps', 'PREVIOUS ADDRESS', d.previous_street) : ''}
      ${d.code === 'informal' ? '<div class="cl-info">This classification supports service planning and accurate records only. It does not reduce a person’s dignity, rights, or access to basic barangay services.</div>' : ''}
      ${d.code !== 'visitor' ? field('f-sd', 'DATE STARTED RESIDING HERE', d.residing_since, 'date') : ''}
      ${['another_barangay', 'resident_voter', 'resident_nonvoter', 'transient'].includes(d.code) ? field('f-ls', 'LENGTH OF STAY', d.length_of_stay, 'text', 'e.g. 1 year, 8 months') : ''}
      ${d.code === 'informal' ? field('f-ca', 'CURRENT LOCATION / AREA', d.current_area, 'text', 'e.g. Riverside Area, near Purok 6') : ''}
      <label>${d.code === 'another_barangay' ? 'NOTES' : 'OPTIONAL NOTES'}</label><textarea id="f-nt" rows="3" placeholder="Add factual, respectful notes if needed." ${can ? '' : 'disabled'}>${esc(d.notes)}</textarea>`;
    const read = () => {
      const v = (s, k) => { const e = g(s); if (e) d[k] = e.value; };
      v('#f-pb', 'previous_barangay'); v('#f-pc', 'previous_city'); v('#f-ps', 'previous_street'); v('#f-sd', 'residing_since'); v('#f-ls', 'length_of_stay'); v('#f-ca', 'current_area'); v('#f-nt', 'notes');
    };
    el.innerHTML = `<a href="#" id="cl-bk">‹ Back to residents</a><div class="cl-auth"><b>AUTHORIZED PERSONNEL ONLY</b><small>${can ? 'Staff Admin' : 'View only'}</small></div>${err ? note(err, 'er') : ''}
      <div class="cl-res"><span class="cl-av">${esc(initials(r.full_name))}</span><div><b>${esc(r.full_name)}</b><small>${esc(r.reference_no || '')} • ${esc(r.purok || '—')}</small></div></div>
      <div class="cl-card"><div class="cl-t">RESIDENCY CLASSIFICATION</div>
        ${OPTS.map(([k, l]) => `<label class="cl-opt ${d.code === k ? 'on' : ''}"><input type="radio" name="cl" value="${k}" ${d.code === k ? 'checked' : ''} ${can ? '' : 'disabled'}><span>${esc(l)}</span></label>`).join('')}
        <div id="cl-dyn">${dyn()}</div></div>
      ${can ? '<button class="cp-g" id="cl-save" style="background:#2E7D32">Save Classification</button>' : ''}`;
    g('#cl-bk').onclick = e => { e.preventDefault(); list(); };
    el.querySelectorAll('input[name=cl]').forEach(i => { i.onchange = () => { read(); d.code = i.value; g('#cl-dyn').innerHTML = dyn(); el.querySelectorAll('.cl-opt').forEach(o => o.classList.toggle('on', o.querySelector('input').checked)); }; });
    if (can) g('#cl-save').onclick = async () => {
      read();
      const { error } = await supabase.rpc('classify_resident', { p_user: r.id, p: { classification: d.code, previous_barangay: d.previous_barangay, previous_city: d.previous_city, previous_street: d.previous_street,
        residing_since: d.residing_since, length_of_stay: d.length_of_stay, current_area: d.current_area, notes: d.notes } });
      if (error) return form(r, error.message);
      flash = note(`Classification saved for ${r.full_name}.`); await load(); list();
    };
  };
  list();
}
