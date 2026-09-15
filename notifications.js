// ---------- Campana de notificaciones: nuevos jugadores registrados + alertas de riesgo (ACWR/TQR/dolor/RHIE) ----------
const SEEN_SIGNUPS_KEY = 'seen_player_signups';
function getSeenSignups(){
  try{ return JSON.parse(localStorage.getItem(SEEN_SIGNUPS_KEY) || '[]'); }catch{ return []; }
}
function markAllSignupsSeen(ids){
  localStorage.setItem(SEEN_SIGNUPS_KEY, JSON.stringify(ids));
}
// El id incluye la fecha de hoy a propósito: así la alerta "renace" como nueva cada día si el jugador
// sigue en riesgo, en vez de quedar marcada como "ya vista" para siempre después de la primera vez.
function computeRiskAlerts(){
  if(!players || !players.length) return [];
  const today = todayISO();
  const alerts = [];
  players.forEach(p=>{
    const risk = computePlayerRisk(p);
    if(risk.level==='red' || risk.level==='yellow'){
      alerts.push({ id:`risk:${today}:${p}`, player:p, level:risk.level, reasons:risk.reasons });
    }
  });
  alerts.sort((a,b)=> (a.level==='red'?0:1) - (b.level==='red'?0:1));
  return alerts;
}
let LATEST_RISK_ALERTS = [];
async function refreshNotifications(){
  if(!myProfile) return;
  const role = myProfile.role;
  const canSeeRisk = role && role!=='player' && !String(role).startsWith('pending');
  const canSeeSignups = role==='admin' || role==='owner';
  if(!canSeeRisk && !canSeeSignups) return;

  LATEST_RISK_ALERTS = canSeeRisk ? computeRiskAlerts() : [];

  let signups = [];
  if(canSeeSignups){
    const {data,error} = await supabaseClient.from('player_profiles')
      .select('user_id,player_name,created_at')
      .eq('club',CURRENT_CLUB).eq('role','player').not('player_name','is',null)
      .order('created_at',{ascending:false});
    if(!error) signups = data || [];
  }

  const wrap = document.getElementById('notifBellWrap');
  wrap.style.display = 'inline-block';
  const seen = getSeenSignups();
  const unseenRisk = LATEST_RISK_ALERTS.filter(a=> !seen.includes(a.id));
  const unseenSignups = signups.filter(r=> !seen.includes(r.user_id));
  const badge = document.getElementById('notifBadge');
  const totalUnseen = unseenRisk.length + unseenSignups.length;
  badge.style.display = totalUnseen ? 'block' : 'none';
  badge.textContent = totalUnseen;

  const sectionTitle = (txt)=> `<div style="padding:8px 14px 4px;font-size:10px;font-weight:700;color:var(--mist);text-transform:uppercase;letter-spacing:.05em;">${txt}</div>`;
  const riskHtml = !LATEST_RISK_ALERTS.length ? '' : sectionTitle(t('alertasRendimientoTitulo')) + LATEST_RISK_ALERTS.map(a=>{
    const isNew = !seen.includes(a.id);
    const color = a.level==='red' ? 'var(--bad)' : 'var(--warn)';
    return `<div style="padding:9px 14px;border-bottom:1px solid var(--line);font-size:12px;${isNew?'background:rgba(34,211,238,.06);':''}">
      <div style="color:var(--bone);font-weight:600;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle;"></span>${isNew?'🆕 ':''}${a.player}</div>
      <div style="color:var(--mist);font-size:11px;margin-top:2px;margin-left:14px;">${a.reasons.join(' · ')}</div>
    </div>`;
  }).join('');

  const signupsHtml = !canSeeSignups ? '' : (!signups.length ? '' : sectionTitle(t('solicitudesTitulo')) + signups.map(r=>{
    const isNew = !seen.includes(r.user_id);
    const fecha = new Date(r.created_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    return `<div style="padding:10px 14px;border-bottom:1px solid var(--line);font-size:12.5px;${isNew?'background:rgba(34,211,238,.06);':''}">
      <div style="color:var(--bone);font-weight:600;">${isNew?'🆕 ':''}${r.player_name}</div>
      <div style="color:var(--mist);font-size:11px;margin-top:2px;">${t('cuentaCreada')} · ${fecha}</div>
    </div>`;
  }).join(''));

  const dropdown = document.getElementById('notifDropdown');
  dropdown.innerHTML = (riskHtml + signupsHtml) || `<div style="padding:14px;color:var(--mist);font-size:12px;">${t('sinNotificaciones')}</div>`;

  document.getElementById('notifBell').onclick = ()=>{
    dropdown.style.display = dropdown.style.display==='block' ? 'none' : 'block';
    if(dropdown.style.display==='block'){
      markAllSignupsSeen([...LATEST_RISK_ALERTS.map(a=>a.id), ...signups.map(r=>r.user_id)]);
      badge.style.display='none';
    }
  };
  document.addEventListener('click', (e)=>{
    if(!wrap.contains(e.target)) dropdown.style.display='none';
  });
}
