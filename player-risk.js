// ---------- player rail ----------
// ---------- Semáforo de riesgo por jugador (ACWR + Wellness/TQR + dolor + caída de RHIE) ----------
// Wellness vive en Supabase y se carga async — guardamos acá el último snapshot conocido (hoy) para
// poder pintar el semáforo de forma síncrona en buildPlayerList sin tener que esperar el fetch cada vez.
let LATEST_WELLNESS_BY_PLAYER = {};
let LATEST_WELLNESS_FETCHED_AT = null;
async function refreshWellnessRiskCache(){
  try{
    const fecha = todayISO();
    const {data, error} = await supabaseClient.from('wellness_reports').select('*').eq('club',CURRENT_CLUB).eq('fecha',fecha);
    if(error) return;
    const byPlayer = {};
    (data||[]).filter(r=> matchesCurrentCategory(r.player_name)).forEach(r=> byPlayer[normalizeNameKey(r.player_name)] = r);
    LATEST_WELLNESS_BY_PLAYER = byPlayer;
    LATEST_WELLNESS_FETCHED_AT = fecha;
    buildPlayerList(document.getElementById('searchInput')?.value || ''); // repinta los puntitos ya con wellness
    refreshNotifications(); // recalcula alertas ya con el factor TQR/dolor incluido
  } catch(e){ /* silencioso: el semáforo simplemente queda sin el factor wellness */ }
}

// Devuelve {level:'red'|'yellow'|'green'|'unknown', reasons:[...]} para un jugador puntual.
// No reemplaza criterio médico/técnico — es una señal compuesta para priorizar a quién mirar primero.
function computePlayerRisk(p){
  const reasons = [];
  let score = 0;
  let dataPoints = 0;

  // 1) ACWR (agudo:crónico de Player Load) — ya se calcula para la lista de ACWR, lo reusamos.
  const dates = [...new Set(categoryFilteredEvents().map(e=>e.fecha))].sort();
  const refDate = dates[dates.length-1];
  const acwr = refDate ? computeACWR(byPlayer[p], refDate) : {status:'insuf'};
  if(acwr.status && acwr.status!=='insuf'){
    dataPoints++;
    if(acwr.status==='high'){ score += 3; reasons.push(tf('riskRazonAcwr',{v:acwrLabel('high')})); }
    else if(acwr.status==='caution'){ score += 1.5; reasons.push(tf('riskRazonAcwr',{v:acwrLabel('caution')})); }
    else if(acwr.status==='low'){ score += 0.75; }
  }

  // 2) TQR (recuperación 0-10, según escala Kenttä & Hassmén) del último reporte de wellness disponible (hoy).
  const wr = LATEST_WELLNESS_BY_PLAYER[normalizeNameKey(p)];
  if(wr && wr.tqr!==null && wr.tqr!==undefined){
    dataPoints++;
    if(wr.tqr<=2){ score += 2; reasons.push(tf('riskRazonTqr',{v:wr.tqr})); }
    else if(wr.tqr<=5){ score += 1; reasons.push(tf('riskRazonTqr',{v:wr.tqr})); }
  }
  // 3) Dolor muscular reportado hoy.
  if(wr && (wr.zonas_dolor||[]).length>0){
    dataPoints++;
    score += 1.5;
    reasons.push(t('riskRazonDolor'));
  }

  // 4) Caída de RHIE (explosividad) vs. el propio promedio histórico del jugador — mismo criterio que
  // "récords logrados hoy", pero mirando si está MUY por debajo en vez de por encima.
  const sesiones = (byPlayer[p]||[]).filter(e=> e.rhie!==null && e.rhie!==undefined && !isNaN(e.rhie)).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const pAvgRhie = playerAvg[p] ? playerAvg[p].rhie : null;
  if(sesiones.length && pAvgRhie){
    dataPoints++;
    const ultimoRhie = sesiones[sesiones.length-1].rhie;
    const ratio = ultimoRhie / pAvgRhie;
    if(ratio < 0.7){ score += 1.5; reasons.push(t('riskRazonRhie')); }
  }

  if(!dataPoints) return {level:'unknown', reasons:[]};
  const level = score>=3.5 ? 'red' : score>=1.5 ? 'yellow' : 'green';
  return {level, reasons};
}
const RISK_COLOR = {red:'var(--bad)', yellow:'var(--warn)', green:'var(--good)', unknown:'var(--mist)'};

function buildPlayerList(filter=''){
  const list = document.getElementById('playerList');
  const f = filter.trim().toLowerCase();
  const filtered = players.filter(p=>p.toLowerCase().includes(f));
  document.getElementById('railCount').textContent = filtered.length;
  list.innerHTML = filtered.map(p=>{
    const rec = recordByPlayer[p];
    const lastDate = [...new Set(categoryFilteredEvents().map(e=>e.fecha))].sort().pop();
    const isNew = rec && METRIC_ORDER.some(m=>rec[m] && rec[m].fecha===lastDate);
    const risk = computePlayerRisk(p);
    const riskDot = risk.level==='unknown' ? '' :
      `<span class="risk-dot${risk.reasons.length?' wtip':''}" style="background:${RISK_COLOR[risk.level]};" ${risk.reasons.length?`data-tip="${t('riskTooltipTitulo')}: ${risk.reasons.join(' · ')}"`:''}></span>`;
    return `<div class="p-item ${p===state.player?'active':''}" data-p="${p}">
      <div class="ini">${initials(p)}</div>
      <div class="nm"><b>${p}</b><small>${byPlayer[p].length} sesiones</small></div>
      ${riskDot}
      ${isNew?'<span class="fire" title="Récord en la última sesión">🔥</span>':''}
    </div>`;
  }).join('');
  list.querySelectorAll('.p-item').forEach(el=>{
    el.addEventListener('click',()=>{ selectPlayer(el.dataset.p); });
  });
  list.querySelectorAll('.risk-dot.wtip').forEach(dot=>{
    dot.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      const wasActive = dot.classList.contains('wtip-active');
      list.querySelectorAll('.wtip-active').forEach(el=> el.classList.remove('wtip-active'));
      if(!wasActive) dot.classList.add('wtip-active');
    });
  });
}
