// =====================================================================
// SBISP | updates.js
//  1. "Update available" banner  - compares APP_VERSION with version.json on the website
//  2. "What's new" window        - shows each new update once to every account
//  3. System Updates screen      - lets the Administrator send an update to every account
// To release: upload the new files, then change APP_VERSION below AND version.json to the same new value.
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc } from './admin-features.js';

export const APP_VERSION = '2026.11.22-2';

/* ---------- 1. update-available banner ---------- */
let watching = false;
export function startVersionWatch() {
  if (watching) return; watching = true;
  const check = async () => {
    try {
      const r = await fetch(new URL('version.json', location.href).href + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json()).version;
      if (v && v !== APP_VERSION) showBanner();
    } catch (e) { /* offline or no version file: stay quiet */ }
  };
  check();
  setInterval(check, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
function showBanner() {
  if (document.getElementById('upd-bar')) return;
  const bar = document.createElement('div'); bar.id = 'upd-bar';
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:300;background:#0B2A8A;color:#fff;padding:10px 14px;padding-top:calc(10px + env(safe-area-inset-top,0px));display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:14px';
  bar.innerHTML = '<span>A new version of SBISP is available.</span><button id="upd-go" style="border:0;border-radius:99px;padding:7px 14px;font-weight:700;background:#fff;color:#0B2A8A;cursor:pointer">Refresh now</button><button id="upd-x" aria-label="Dismiss" style="border:0;background:transparent;color:#fff;font-size:22px;line-height:1;cursor:pointer">\u00d7</button>';
  document.body.appendChild(bar);
  bar.querySelector('#upd-go').onclick = () => location.reload();
  bar.querySelector('#upd-x').onclick = () => bar.remove();
}

/* ---------- 2. "What's new" window (once per update, per account) ---------- */
let checkedNew = false;
const day = d => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
export async function checkWhatsNew(me) {
  if (!me || checkedNew) return; checkedNew = true;
  try {
    const { data, error } = await supabase.rpc('my_new_updates');
    if (error || !data || !data.length) return;
    showWhatsNew(data);
  } catch (e) { /* the feature is optional */ }
}
function showWhatsNew(list) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:250;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:18px';
  ov.innerHTML = `<div role="dialog" aria-label="What's new" style="background:#fff;border-radius:16px;max-width:440px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,.25)">
    <div style="padding:16px 18px 8px"><b style="font-size:20px;color:#1F7A14">What's new in SBISP</b></div>
    <div style="padding:0 18px;overflow:auto">${list.map(u => `<div style="margin:10px 0 14px"><b>${esc(u.title)}</b><br><small style="color:#666">${esc(day(u.created_at))}</small><p style="margin:6px 0 0;white-space:pre-line;line-height:1.45">${esc(u.body)}</p></div>`).join('')}</div>
    <div style="padding:10px 18px 16px"><button id="wn-ok" class="btn">Got it</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('#wn-ok').onclick = async () => { ov.remove(); try { await supabase.rpc('mark_updates_seen'); } catch (e) { /* ignore */ } };
}

/* ---------- 3. System Updates screen (Administrator) ---------- */
export async function mountUpdates(el) {
  const inp = 'width:100%;box-sizing:border-box;border:1px solid #cfd8cc;border-radius:10px;padding:11px;font:inherit;margin-top:6px';
  el.innerHTML = `<div style="padding:4px 2px 24px">
    <p class="muted" style="margin:0 0 12px">Send a message to every active account. People see it under Alerts and in a "What's new" window the next time they open SBISP.</p>
    <label style="font-weight:700">Title</label><input id="su-t" maxlength="80" placeholder="Example: New photo verification" style="${inp}">
    <label style="font-weight:700;display:block;margin-top:12px">Message</label>
    <textarea id="su-b" rows="6" maxlength="800" placeholder="Write what changed, one point on each line. Start each line with a dash." style="${inp}"></textarea>
    <div id="su-m" style="margin-top:8px"></div>
    <button class="btn" id="su-go" style="margin-top:8px">Send to everyone</button>
    <p class="muted" style="margin:16px 0 4px">Version running here: <b>${esc(APP_VERSION)}</b>. After uploading new files to GitHub, change the version in js/updates.js and in version.json to the same new value, so open apps show the Refresh banner.</p>
    <h3 style="margin:18px 0 6px">Sent updates</h3><div id="su-h"><p class="muted">Loading\u2026</p></div></div>`;
  const $ = id => el.querySelector('#' + id);
  const note = (t, ok) => { $('su-m').innerHTML = `<div style="padding:10px 12px;border-radius:10px;background:${ok ? '#E7F5E4' : '#FDE8E8'};color:${ok ? '#14540D' : '#9B1C1C'}">${esc(t)}</div>`; };
  const history = async () => {
    const { data, error } = await supabase.from('app_updates').select('id,title,body,created_at').order('created_at', { ascending: false }).limit(20);
    if (error) { $('su-h').innerHTML = `<p class="muted">${esc(error.message)} (Run the System Updates SQL in Supabase first.)</p>`; return; }
    $('su-h').innerHTML = (data || []).map(u => `<div style="border:1px solid #E2E6EA;border-radius:12px;padding:10px 12px;margin-bottom:8px;background:#fff"><b>${esc(u.title)}</b><br><small style="color:#666">${esc(day(u.created_at))}</small><p style="margin:6px 0 0;white-space:pre-line;font-size:14px">${esc(u.body)}</p></div>`).join('') || '<p class="muted">Nothing sent yet.</p>';
  };
  $('su-go').onclick = async () => {
    const t = $('su-t').value.trim(), b = $('su-b').value.trim();
    if (!t || !b) return note('Please write a title and a message.', false);
    if (!confirm('Send this update to every active account?')) return;
    $('su-go').disabled = true; note('Sending\u2026', true);
    const { data, error } = await supabase.rpc('broadcast_update', { p_title: t, p_body: b });
    $('su-go').disabled = false;
    if (error) return note(error.message, false);
    $('su-t').value = ''; $('su-b').value = '';
    note(`Sent to ${data} accounts.`, true); history();
  };
  history();
}
