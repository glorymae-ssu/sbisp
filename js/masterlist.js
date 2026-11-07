// =====================================================================
// SBISP | masterlist.js
// Masterlists of residents (voters, seniors, PWD, youth ...) from the population registry.
// New: Precinct Number column. Optional; the administrator and the Barangay Secretary can correct or update it.
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc, printHTML, reportHeader, table } from './admin-features.js';

const LISTS = ['All living residents', 'Registered Voters', 'Non-registered Voters', 'Senior Citizens (60+)', 'Persons with Disability (PWD)',
  'Youth (15-30)', 'In-School Youth', 'Out-of-School Youth', 'Children (below 15)', 'Registered SK Voters',
  'Social Pensioners (LGU)', 'SSS Pensioners', 'New Residents', 'Deceased'];

export async function mountMasterlist(el, me) {
  const canEdit = !me.is_pb && ['admin', 'employee'].includes(me.role);
  const pk = await supabase.from('puroks').select('name').order('sort');
  const puroks = (pk.data || []).map(x => x.name);
  const sel = (id, l, o) => `<label for="${id}">${l}</label><select id="${id}">${o.map(x => `<option>${esc(x)}</option>`).join('')}</select>`;
  el.innerHTML = `<div class="cp-form">${sel('ml-t', 'LIST', LISTS)}${sel('ml-p', 'PUROK', ['All Puroks', ...puroks])}
    <label for="ml-q">SEARCH</label><input id="ml-q" placeholder="Name, precinct number or address" autocomplete="off"></div>
    <div id="ml-flash"></div><div id="ml-out"></div>`;
  const $ = s => el.querySelector(s);
  let rows = [], type = LISTS[0], purok = 'All Puroks', q = '';

  const view = () => rows.filter(p => !q || [p.full_name, p.precinct_no, p.purok, p.street].join(' ').toLowerCase().includes(q));
  const draw = () => {
    const l = view();
    $('#ml-out').innerHTML = `<div class="cp-pn" style="margin:12px 0 8px"><small class="muted">${canEdit ? 'Tap a Precinct No. to correct or update it. It saves when you leave the box.' : 'View only.'}</small></div>
      <div class="ml-wrap"><table class="ml-t"><tr><th>#</th><th>Name</th><th>Age</th><th>Sex</th><th>Address</th><th>Mobile</th><th>Precinct No.</th><th>Notes</th></tr>
      ${l.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.full_name)}</td><td>${esc(p.age ?? '')}</td><td>${esc(p.sex ?? '')}</td><td>${esc([p.purok, p.street].filter(Boolean).join(', '))}</td><td>${esc(p.mobile ?? '—')}</td>
        <td>${canEdit ? `<input class="pn" data-id="${p.id}" value="${esc(p.precinct_no || '')}" placeholder="Optional" maxlength="20">` : esc(p.precinct_no || '—')}</td><td>${esc(p.notes ?? '')}</td></tr>`).join('')
        || '<tr><td colspan="8">None</td></tr>'}</table></div>
      <p>Total: <b>${l.length}</b></p><button class="cp-g" id="ml-print">🖨️ Print / Save as PDF</button>`;
    $('#ml-print').onclick = () => printHTML(
      reportHeader('MASTERLIST', type + (purok === 'All Puroks' ? ' · All Puroks' : ' · ' + purok))
      + table(['#', 'Name', 'Age', 'Sex', 'Address', 'Mobile', 'Precinct No.', 'Notes'],
        l.map((p, i) => [i + 1, p.full_name, p.age, p.sex, [p.purok, p.street].filter(Boolean).join(', '), p.mobile ?? '—', p.precinct_no ?? '', p.notes ?? '']))
      + `<p>Total: <b>${l.length}</b></p>`, 'SBISP-Masterlist-' + type.replace(/\W+/g, '_'));
    if (canEdit) $('#ml-out').querySelectorAll('input.pn').forEach(inp => {
      inp.onchange = async () => {
        const row = rows.find(r => r.id === inp.dataset.id); if (!row) return;
        inp.disabled = true;
        const { error } = await supabase.rpc('registry_set_precinct', { p_id: row.id, p_precinct: inp.value });
        inp.disabled = false;
        if (error) { $('#ml-flash').innerHTML = `<div class="msg er">${esc(error.message)}</div>`; inp.value = row.precinct_no || ''; return; }
        row.precinct_no = inp.value.trim() || null; inp.value = row.precinct_no || '';
        $('#ml-flash').innerHTML = `<div class="msg">Precinct number saved for ${esc(row.full_name)}.</div>`;
      };
    });
  };
  const load = async () => {
    type = $('#ml-t').value; purok = $('#ml-p').value;
    const { data, error } = await supabase.rpc('masterlist_v2', { p_type: type, p_purok: purok === 'All Puroks' ? null : purok });
    if (error) { rows = []; $('#ml-out').innerHTML = `<div class="msg er">${esc(error.message)} (Run sbisp-masterlist.sql in Supabase if you have not yet.)</div>`; return; }
    rows = data || []; $('#ml-flash').innerHTML = ''; draw();
  };
  $('#ml-t').onchange = load; $('#ml-p').onchange = load;
  $('#ml-q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
  load();
}
