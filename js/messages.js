// =====================================================================
// SBISP | messages.js
// The approval notice and the contact line shown where users edit their information and while an update
// waits for approval. Everyone reads them; only the administrator can change them (Portal Messages tile).
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc } from './admin-features.js';

export const DEFAULTS = {
  approval_notice: 'You can update your information here, but your changes need approval from the Barangay Secretary or the administrator first. Until they are approved, you cannot file complaints or request clearances and other barangay services.',
  contact_note: 'If you have concerns and clarifications, you can contact us at 09-1234-56789.'
};

export async function loadMessages() {
  const m = { ...DEFAULTS };
  try {
    const r = await supabase.from('portal_settings').select('key,value').in('key', Object.keys(DEFAULTS));
    (r.data || []).forEach(x => { if (x.value && String(x.value).trim()) m[x.key] = x.value; });
  } catch (e) { /* keep the defaults */ }
  return m;
}

export function mountMessages(el, current, onSaved) {
  let cur = { ...DEFAULTS, ...current };
  const draw = (flash = '') => {
    el.innerHTML = `<p class="muted">These messages appear when a user edits their information and while the update waits for approval. Only the administrator can change them.</p>${flash}
      <div class="cp-form"><label>APPROVAL NOTICE</label><textarea id="pm-a" rows="5" maxlength="500">${esc(cur.approval_notice)}</textarea>
        <label>CONTACT MESSAGE</label><textarea id="pm-c" rows="3" maxlength="500">${esc(cur.contact_note)}</textarea></div>
      <div class="qa-h"><span>PREVIEW</span></div><div class="notice" id="pm-pv"></div>
      <button class="cp-g" id="pm-save">Save Messages</button><button class="cp-g sec" id="pm-reset">Reset to the original wording</button>`;
    const pv = () => { el.querySelector('#pm-pv').innerHTML = `<p>${esc(el.querySelector('#pm-a').value)}</p><p>${esc(el.querySelector('#pm-c').value)}</p>`; };
    pv(); el.querySelector('#pm-a').oninput = pv; el.querySelector('#pm-c').oninput = pv;
    el.querySelector('#pm-reset').onclick = () => { cur = { ...DEFAULTS }; draw(); };
    el.querySelector('#pm-save').onclick = async () => {
      const a = el.querySelector('#pm-a').value.trim(), c = el.querySelector('#pm-c').value.trim();
      const r1 = await supabase.rpc('portal_setting_save', { p_key: 'approval_notice', p_value: a });
      const r2 = r1.error ? r1 : await supabase.rpc('portal_setting_save', { p_key: 'contact_note', p_value: c });
      if (r2.error) { cur = { approval_notice: a, contact_note: c }; return draw(`<div class="msg er">${esc(r2.error.message)}</div>`); }
      cur = { approval_notice: a, contact_note: c }; if (onSaved) onSaved(cur);
      draw('<div class="msg">Messages saved. Users will see the new wording right away.</div>');
    };
  };
  draw();
}
