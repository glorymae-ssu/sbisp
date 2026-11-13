// =====================================================================
// SBISP | masterlist.js
// Masterlists of residents (voters, seniors, PWD, youth ...) from the population registry.
// New: Precinct Number column. Optional; the administrator and the Barangay Secretary can correct or update it.
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc, printHTML, reportHeader, table } from './admin-features.js';
import { generatePdf, canPdf } from './pdf.js';

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
      <div class="ml-wrap"><table class="ml-t"><tr><th>#</th><th>Name</th><th>Age</th><th>Sex</th><th>Address</th><th>Mobile</th><th>Precinct No.</th><th>Notes</th>${canEdit ? '<th></th>' : ''}</tr>
      ${l.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.full_name)}</td><td>${esc(p.age ?? '')}</td><td>${esc(p.sex ?? '')}</td><td>${esc([p.purok, p.street].filter(Boolean).join(', '))}</td><td>${esc(p.mobile ?? '—')}</td>
        <td>${canEdit ? `<input class="pn" data-id="${p.id}" value="${esc(p.precinct_no || '')}" placeholder="Optional" maxlength="20">` : esc(p.precinct_no || '—')}</td><td>${esc(p.notes ?? '')}</td>${canEdit ? `<td><button class="ml-ed" data-id="${p.id}" aria-label="Edit record">✎ Edit</button></td>` : ''}</tr>`).join('')
        || `<tr><td colspan="${canEdit ? 9 : 8}">None</td></tr>`}</table></div>
      <p>Total: <b>${l.length}</b></p><button class="cp-g sec" id="ml-print">Print</button>${canPdf(me) ? '<button class="cp-g" id="ml-pdf">Generate PDF Report</button>' : ''}`;
    $('#ml-print').onclick = () => printHTML(
      reportHeader('MASTERLIST', type + (purok === 'All Puroks' ? ' · All Puroks' : ' · ' + purok))
      + table(['#', 'Name', 'Age', 'Sex', 'Address', 'Mobile', 'Precinct No.', 'Notes'],
        l.map((p, i) => [i + 1, p.full_name, p.age, p.sex, [p.purok, p.street].filter(Boolean).join(', '), p.mobile ?? '—', p.precinct_no ?? '', p.notes ?? '']))
      + `<p>Total: <b>${l.length}</b></p>`, 'SBISP-Masterlist-' + type.replace(/\W+/g, '_'));
    if (canEdit) $('#ml-out').querySelectorAll('.ml-ed').forEach(b => { b.onclick = () => edit(b.dataset.id); });
    if ($('#ml-pdf')) $('#ml-pdf').onclick = () => generatePdf({ me, title: 'MASTERLIST - ' + type.toUpperCase(), subtitle: purok === 'All Puroks' ? 'All Puroks' : purok, filename: 'SBISP-Masterlist-' + type.replace(/\W+/g, '_'), landscape: true,
      summary: [['List', type], ['Purok', purok], ['Total', l.length]],
      sections: [{ columns: ['#', 'Name', 'Age', 'Sex', 'Address', 'Mobile', 'Precinct No.', 'Notes'], rows: l.map((p, i) => [i + 1, p.full_name, p.age ?? '', p.sex ?? '', [p.purok, p.street].filter(Boolean).join(', '), p.mobile ?? '', p.precinct_no ?? '', p.notes ?? '']) }] });
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

  /* ---- edit one resident's registry (masterlist) record: administrator and Barangay Secretary ---- */
  const edit = async id => {
    const g = await supabase.rpc('registry_get', { p_id: id });
    if (g.error || !g.data) { $('#ml-flash').innerHTML = `<div class="msg er">${esc(g.error ? g.error.message : 'Record not found')}</div>`; return; }
    const r = g.data, root = el.querySelector('#ml-out'), top = el.querySelector('.cp-form'), fl = $('#ml-flash');
    const f = (i, l, v, t = 'text', ph = '') => `<label for="${i}">${l}</label><input id="${i}" type="${t}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`;
    const s2 = (i, l, o, v) => `<label for="${i}">${l}</label><select id="${i}">${o.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    top.style.display = 'none'; fl.innerHTML = '';
    root.innerHTML = `<a href="#" id="ed-bk">‹ Back to the masterlist</a><div class="cp-form"><div id="ed-m"></div>
      ${f('ed-f', 'FIRST NAME', r.first_name)}${f('ed-m2', 'MIDDLE NAME', r.middle_name)}${f('ed-l', 'LAST NAME', r.last_name)}${f('ed-b', 'DATE OF BIRTH', r.birthdate, 'date')}
      ${s2('ed-s', 'SEX', ['Female', 'Male'], r.sex)}${s2('ed-c', 'CIVIL STATUS', ['Single', 'Married', 'Widow', 'Living-in with Partner', 'Single Parent'], r.civil_status)}
      ${f('ed-mo', 'MOBILE NUMBER', r.mobile, 'tel', '09XXXXXXXXX')}${s2('ed-pu', 'PUROK', ['', ...puroks], r.purok)}${f('ed-st', 'STREET / HOUSE NO.', r.street)}
      ${s2('ed-v', 'VOTER STATUS', ['Registered Voter', 'Non-registered Voter'], r.voter_status || 'Non-registered Voter')}${f('ed-pn', 'PRECINCT NUMBER (OPTIONAL)', r.precinct_no, 'text', 'Optional')}
      ${s2('ed-pwd', 'PERSON WITH DISABILITY (PWD)', ['No', 'Yes'], r.is_pwd ? 'Yes' : 'No')}${s2('ed-dc', 'DECEASED', ['No', 'Yes'], r.is_deceased ? 'Yes' : 'No')}</div>
      <button class="cp-g" id="ed-save">Save Changes</button>`;
    const done = () => { top.style.display = ''; load(); };
    root.querySelector('#ed-bk').onclick = e => { e.preventDefault(); done(); };
    root.querySelector('#ed-save').onclick = async () => {
      const v = i => root.querySelector('#' + i).value;
      const { error } = await supabase.rpc('registry_update', { p_id: id, p: { first_name: v('ed-f'), middle_name: v('ed-m2'), last_name: v('ed-l'), birthdate: v('ed-b'), sex: v('ed-s'),
        civil_status: v('ed-c'), mobile: v('ed-mo'), purok: v('ed-pu'), street: v('ed-st'), voter_status: v('ed-v'), precinct_no: v('ed-pn'), is_pwd: v('ed-pwd') === 'Yes', is_deceased: v('ed-dc') === 'Yes' } });
      if (error) { root.querySelector('#ed-m').innerHTML = `<div class="msg er">${esc(error.message)}</div>`; return; }
      done(); $('#ml-flash').innerHTML = '<div class="msg">Resident record saved.</div>';
    };
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
