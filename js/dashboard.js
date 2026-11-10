// =====================================================================
// SBISP | dashboard.js
//  - mountDashboard: Figma "Analytics Dashboard" (monthly trend line, categories donut, complaints by purok,
//    resolution rate, average resolve time) built from the complaints the account is allowed to see
//  - staffPanels: "Complaints summary" and "New recent alerts" for the staff home
// =====================================================================
import { supabase } from './supabaseClient.js';
import { esc } from './admin-features.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAL = ['#27C227', '#1B6B1B', '#E8782A', '#1565C0', '#8E8E8E', '#9C27B0', '#00ACC1', '#F9A825'];
const ago = d => {
  const m = Math.max(0, Math.round((Date.now() - new Date(d)) / 60000));
  if (m < 2) return 'just now'; if (m < 60) return m + ' mins ago';
  const h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  const dd = Math.round(h / 24); return dd + (dd === 1 ? ' day ago' : ' days ago');
};

/* ---------------------------------------------------------------- charts (plain SVG) */
function lineChart(b) {
  const W = 300, H = 130, px = 14, top = 12, bot = 22, max = Math.max(1, ...b.map(x => x.n));
  const X = i => (b.length === 1 ? W / 2 : px + i * (W - 2 * px) / (b.length - 1));
  const Y = v => top + (H - top - bot) * (1 - v / max);
  const pts = b.map((x, i) => `${X(i).toFixed(1)},${Y(x.n).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Monthly complaint trends">
    <line x1="${px}" y1="${H - bot}" x2="${W - px}" y2="${H - bot}" stroke="#E3E6EA"/>
    <polyline points="${pts}" fill="none" stroke="#27C227" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    ${b.map((x, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(x.n).toFixed(1)}" r="3.4" fill="#27C227"/><text x="${X(i).toFixed(1)}" y="${Y(x.n) - 8}" font-size="9" text-anchor="middle" fill="#444">${x.n}</text>
      <text x="${X(i).toFixed(1)}" y="${H - 6}" font-size="10" text-anchor="middle" fill="#666">${x.label}</text>`).join('')}</svg>`;
}
function donut(parts, total) {
  const r = 40, C = 2 * Math.PI * r; let off = 0;
  const segs = parts.map((p, i) => { const len = C * p.n / total, s = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${PAL[i % PAL.length]}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 60 60)"/>`; off += len; return s; }).join('');
  return `<svg viewBox="0 0 120 120" width="112" height="112" role="img" aria-label="Complaint categories"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#EEF1F3" stroke-width="22"/>${segs}</svg>`;
}
const ring = pct => { const r = 15, C = 2 * Math.PI * r; return `<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="${r}" fill="none" stroke="#E3E6EA" stroke-width="5"/>
  <circle cx="20" cy="20" r="${r}" fill="none" stroke="#1B8A2E" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(C * pct / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 20 20)"/></svg>`; };
const clock = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#E8782A" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

/* ---------------------------------------------------------------- analytics dashboard */
export async function mountDashboard(el, me, mountPopulation) {
  el.innerHTML = '<p class="muted">Loading…</p>';
  const r = await supabase.rpc('complaints_list');
  if (r.error) { el.innerHTML = `<div class="msg er">${esc(r.error.message)}</div>`; return; }
  const all = r.data || []; let months = 6;
  el.innerHTML = `<div class="an-range"><span>DATE RANGE</span><select id="an-r"><option value="3">Last 3 Months</option><option value="6" selected>Last 6 Months</option><option value="12">Last 12 Months</option></select></div>
    <div id="an-main"></div>${mountPopulation ? '<div class="qa-h"><span>Population</span></div><div id="an-pop"></div>' : ''}`;
  const draw = () => {
    const now = new Date(), start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const rows = all.filter(x => new Date(x.created_at) >= start), total = rows.length, by = s => rows.filter(x => x.status === s).length;
    const b = Array.from({ length: months }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1); return { k: d.getFullYear() * 12 + d.getMonth(), label: MON[d.getMonth()], n: 0 }; });
    rows.forEach(x => { const d = new Date(x.created_at), k = d.getFullYear() * 12 + d.getMonth(), m = b.find(y => y.k === k); if (m) m.n++; });
    const cur = b[b.length - 1].n, prev = b.length > 1 ? b[b.length - 2].n : 0;
    const delta = prev ? Math.round((cur - prev) / prev * 100) : null;
    const trend = delta === null ? `${cur} this month` : `${delta > 0 ? '+' : ''}${delta}% vs ${b[b.length - 2].label}`;
    const cnt = (key) => Object.entries(rows.reduce((a, x) => { const k = x[key] || 'Unspecified'; a[k] = (a[k] || 0) + 1; return a; }, {})).map(([k, n]) => ({ k, n })).sort((a, c) => c.n - a.n);
    let cats = cnt('category'); if (cats.length > 5) { const rest = cats.slice(4).reduce((s, x) => s + x.n, 0); cats = [...cats.slice(0, 4), { k: 'Others', n: rest }]; }
    const pur = cnt('purok').slice(0, 6), pmax = Math.max(1, ...pur.map(x => x.n));
    const res = rows.filter(x => x.status === 'resolved'), rate = total ? Math.round(res.length / total * 1000) / 10 : 0;
    const times = res.filter(x => x.resolved_at).map(x => (new Date(x.resolved_at) - new Date(x.created_at)) / 86400000);
    const avg = times.length ? (times.reduce((s, x) => s + x, 0) / times.length).toFixed(1) : null;
    el.querySelector('#an-main').innerHTML = `
      <div class="an-kpis"><div><b>${total}</b><small>Total</small></div><div><b style="color:#E65100">${by('pending')}</b><small>Pending</small></div>
        <div><b style="color:#1B7A1B">${by('ongoing')}</b><small>Ongoing</small></div><div><b style="color:#1565C0">${by('resolved')}</b><small>Resolved</small></div></div>
      <div class="an-card"><div class="an-h"><b>Monthly Complaint Trends</b><span class="an-d">${esc(trend)}</span></div>${lineChart(b)}</div>
      <div class="an-card"><b>Complaint Categories</b>${total ? `<div class="an-don">${donut(cats, total)}<div class="an-leg">${cats.map((c, i) => `<div><i style="background:${PAL[i % PAL.length]}"></i>${esc(c.k)} (${Math.round(c.n / total * 100)}%)</div>`).join('')}</div></div>` : '<p class="muted">No complaints in this period.</p>'}</div>
      <div class="an-card"><b>Complaints by Purok</b>${pur.map(p => `<div class="an-bar"><div class="an-bl"><span>${esc(p.k)}</span><span>${p.n} ${p.n === 1 ? 'Case' : 'Cases'}</span></div><div class="an-bt"><div style="width:${(p.n / pmax * 100).toFixed(0)}%"></div></div></div>`).join('') || '<p class="muted">No complaints in this period.</p>'}</div>
      <div class="an-two"><div class="an-card"><small>RESOLUTION RATE</small><div class="an-big">${ring(rate)}<b>${rate}%</b></div></div>
        <div class="an-card"><small>AVG RESOLVE TIME</small><div class="an-big">${clock}<b>${avg === null ? '—' : avg + ' Days'}</b></div></div></div>`;
  };
  el.querySelector('#an-r').onchange = e => { months = +e.target.value; draw(); };
  draw();
  if (mountPopulation) { try { await mountPopulation(el.querySelector('#an-pop')); } catch (e) { el.querySelector('#an-pop').innerHTML = '<p class="muted">Population statistics are not available for this account.</p>'; } }
}

/* ---------------------------------------------------------------- staff home: summary + recent alerts */
export async function staffPanels(me) {
  const role = me.is_pb ? 'view' : ['admin', 'employee'].includes(me.role) ? 'manage' : 'officer';
  const [c, s] = await Promise.all([supabase.rpc('complaints_list'), role === 'officer' ? { data: [] } : supabase.rpc('service_requests_list')]);
  const comp = c.data || [], reqs = s.data || [];
  let pend = 0, act = 0;
  if (me.role === 'admin' && !me.is_pb) { try { act = (await supabase.rpc('activity_unread_count')).data || 0; } catch (e) { act = 0; } }
  if (role === 'manage') { try { const q = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'resident').eq('status', 'pending'); pend = q.count || 0; } catch (e) { pend = 0; } }
  let upd = 0;
  if (role === 'manage') { try { const u = await supabase.rpc('profile_updates_list'); upd = (u.data || []).filter(x => x.status === 'pending' && x.user_id !== me.id).length; } catch (e) { upd = 0; } }
  const n = st => comp.filter(x => x.status === st).length;
  const summary = `<div class="qa-h"><span>${role === 'officer' ? 'MY ASSIGNED COMPLAINTS' : 'COMPLAINTS SUMMARY'}</span></div>
    <div class="ss"><div class="ss-p"><b>${n('pending')}</b><small>Pending</small></div><div class="ss-o"><b>${n('ongoing')}</b><small>Ongoing</small></div><div class="ss-r"><b>${n('resolved')}</b><small>Resolved Case</small></div></div>`;
  const items = [];
  if (act) items.push({ go: 'Activity Monitor', t: 'Activity monitor', chip: `<span class="cp-chip as">${act} NEW</span>`, sub: 'Edits, updates and deletions by the users of the portal' });
  if (pend) items.push({ go: 'Residents', t: 'Residents waiting for verification', chip: `<span class="cp-chip fr">${pend} PENDING</span>`, sub: 'Open Residents to review the registrations' });
  if (upd) items.push({ go: 'Profile Updates', t: 'Profile updates waiting for approval', chip: `<span class="cp-chip fr">${upd} PENDING</span>`, sub: 'Open Profile Updates to approve or reject' });
  comp.filter(x => x.status !== 'resolved').slice(0, 4).forEach(x => items.push({ go: 'Complaints', t: x.title,
    chip: x.assigned_name ? '<span class="cp-chip as">ASSIGNED</span>' : '<span class="cp-chip un">UNASSIGNED</span>',
    sub: role === 'officer' ? `Assigned to you • ${ago(x.updated_at || x.created_at)}` : x.assigned_name ? `Assigned to ${esc(x.assigned_name || 'an officer')} • ${ago(x.updated_at || x.created_at)}` : `Submitted by ${esc(x.filer_name || 'a resident')} • ${ago(x.created_at)}` }));
  reqs.filter(x => x.status === 'for_review').slice(0, 3).forEach(x => items.push({ go: 'Service Requests', t: x.service, chip: '<span class="cp-chip fr">FOR REVIEW</span>', sub: `Requested by ${esc(x.resident_name || 'a resident')} • ${ago(x.created_at)}` }));
  const fresh = act + pend + upd + comp.filter(x => x.status !== 'resolved' && !x.assigned_name).length + reqs.filter(x => x.status === 'for_review').length;
  const alerts = `<div class="qa-h"><span>NEW RECENT ALERTS</span>${fresh ? `<span class="new-pill">${fresh} NEW</span>` : ''}</div>`
    + (items.slice(0, 6).map(i => `<div class="cp-card al" data-go="${esc(i.go)}"><div class="cp-top"><b style="color:#111">${esc(i.t)}</b>${i.chip}</div><small class="muted">${i.sub}</small></div>`).join('')
      || '<div class="card"><p class="muted">No new alerts. You are all caught up.</p></div>');
  return { summary, alerts };
}
