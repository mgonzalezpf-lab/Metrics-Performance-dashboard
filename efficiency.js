// ---------- Eficiencia GPS-RPE: compara carga interna (RPE×min) vs carga externa (Distancia) por jugador ----------
// Ciencia detrás: la Distancia Total es, según la literatura (fútbol), la métrica de GPS con correlación más fuerte
// y consistente con el RPE de sesión (r hasta ~0.74, "muy grande" en varios estudios). Un jugador cuyo índice
// (RPE×min ÷ Distancia) sube sin que su carga de GPS haya cambiado puede estar acumulando fatiga no visible en el GPS solo.
function computeEfficiencySessions(playerName){
  const evsByDate = {};
  categoryFilteredEvents().filter(e=> normalizeNameKey(e.jugador)===normalizeNameKey(playerName) && e.dist).forEach(e=>{
    evsByDate[e.fecha] = (evsByDate[e.fecha]||0) + e.dist; // por si hay más de un evento el mismo día, se suma
  });
  const reports = RPE_REPORTS_CACHE.filter(r=> normalizeNameKey(r.player_name)===normalizeNameKey(playerName));
  const sessions = [];
  reports.forEach(r=>{
    const dist = evsByDate[r.fecha];
    if(dist && dist>0 && r.rpe!==null && r.rpe!==undefined && r.minutos!==null && r.minutos!==undefined){
      const rpeLoad = r.rpe * r.minutos;
      sessions.push({ fecha:r.fecha, dist, rpeLoad, ratio: rpeLoad/dist });
    }
  });
  sessions.sort((a,b)=> a.fecha.localeCompare(b.fecha));
  return sessions;
}
function efficiencyStatusFor(sessions){
  if(sessions.length < 4) return {status:'insuf', label:t('eficienciaSinDatos'), varName:'--mist', current:null, baseline:null, deltaPct:null};
  const recentN = Math.min(3, Math.floor(sessions.length/2));
  const recent = sessions.slice(-recentN);
  const baselineArr = sessions.slice(0, sessions.length-recentN);
  const avg = arr=> arr.reduce((a,b)=>a+b.ratio,0)/arr.length;
  const current = avg(recent);
  const baseline = avg(baselineArr);
  const deltaPct = baseline>0 ? ((current-baseline)/baseline*100) : null;
  let status='normal', label=t('eficienciaNormal'), varName='--good';
  if(deltaPct!==null){
    if(deltaPct>=20){ status='alerta'; label=t('eficienciaAlerta'); varName='--bad'; }
    else if(deltaPct>=10){ status='atencion'; label=t('eficienciaAtencion'); varName='--warn'; }
  }
  return {status, label, varName, current, baseline, deltaPct};
}
async function buildEfficiencyRanking(){
  const box = document.getElementById('eficienciaTeamList');
  if(!box) return;
  // Asegura tener el RPE cargado, sin depender de haber visitado la pestaña RPE antes.
  if(!RPE_REPORTS_CACHE.length){
    const {data,error} = await supabaseClient.from('rpe_reports').select('player_name,fecha,rpe,minutos,updated_at').eq('club',CURRENT_CLUB).order('fecha',{ascending:false});
    if(!error) RPE_REPORTS_CACHE = data || [];
  }
  const rosterExtra = await getRosterExtraNames();
  const allPlayers = mergePlayerNames(players, rosterExtra).filter(p=>!isGoalkeeper(p));
  const order = {alerta:0, atencion:1, normal:2, insuf:3};
  const rows = allPlayers.map(p=>{
    const sessions = computeEfficiencySessions(p);
    const st = efficiencyStatusFor(sessions);
    return {p, sessions, ...st};
  }).sort((a,b)=> (order[a.status]-order[b.status]) || ((b.deltaPct??-999)-(a.deltaPct??-999)));
  box.innerHTML = rows.map((r,i)=>{
    const pct = r.deltaPct!==null ? Math.min(100, Math.max(0, r.deltaPct+50)) : null; // 0% de desvío queda al centro de la barra
    return `<div class="acwr-row" data-p="${r.p}" style="cursor:pointer;">
      <div class="rk">${i+1<10?'0':''}${i+1}</div>
      <div class="nm">${r.p}</div>
      <div class="acwr-track">${pct!==null?`<div class="acwr-marker" style="left:${pct}%"></div>`:''}</div>
      <div class="acwr-ratio">${r.deltaPct!==null? (r.deltaPct>=0?'+':'')+r.deltaPct.toFixed(0)+'%' : '—'}</div>
      <div><span class="acwr-badge" style="background:var(${r.varName});color:#14143A;">${r.label}</span></div>
    </div>`;
  }).join('');
  box.querySelectorAll('.acwr-row').forEach(el=> el.addEventListener('click', ()=> buildEfficiencyDetail(el.dataset.p)));
}
let efficiencyDetailChart;
function buildEfficiencyDetail(playerName){
  const panel = document.getElementById('eficienciaDetailPanel');
  const titleEl = document.getElementById('eficienciaDetailTitle');
  const tagEl = document.getElementById('eficienciaDetailTag');
  const canvas = document.getElementById('eficienciaDetailChart');
  if(!panel || !canvas) return;
  panel.style.display = '';
  requestAnimationFrame(()=>{ panel.scrollIntoView({behavior:'smooth', block:'start'}); });
  if(titleEl) titleEl.textContent = `📈 ${playerName}`;
  if(tagEl) tagEl.textContent = t('eficienciaVsBaseline');
  const sessions = computeEfficiencySessions(playerName);
  if(!sessions.length){
    canvas.parentElement.innerHTML = `<div style="color:var(--mist);font-family:'IBM Plex Mono';font-size:12px;padding:20px;text-align:center;">${t('eficienciaSinSesiones')}</div>`;
    return;
  }
  if(typeof Chart === 'undefined'){
    canvas.parentElement.innerHTML = `<div style="color:var(--mist);font-family:'IBM Plex Mono';font-size:12px;padding:20px;text-align:center;">${t('noSePudoChartjsResto')}</div>`;
    return;
  }
  const labels = sessions.map(s=> s.fecha.slice(5).split('-').reverse().join('/'));
  const data = sessions.map(s=> s.ratio);
  const ctx = canvas.getContext('2d');
  const cfg = {
    type:'line',
    data:{ labels, datasets:[{
      label: t('eficienciaIndiceLabel'),
      data,
      spanGaps:true,
      borderColor:'#FBBF24',
      backgroundColor:'rgba(251,191,36,.12)',
      pointBackgroundColor:'#FBBF24',
      pointBorderColor:'#FBBF24',
      pointRadius:5,
      pointHoverRadius:7,
      tension:.3,
      fill:true,
      borderWidth:2.2,
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{ padding:{ top:18 } },
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#1E1E58', borderColor:'#FBBF24', borderWidth:1, titleColor:'#FDE68A', bodyColor:'#E7E7FB',
          callbacks:{ label:(ctx)=> `${t('eficienciaIndiceLabel')}: ${fmt(ctx.raw,2)}` }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:9.5}} },
        y:{ grace:'12%', grid:{color:'rgba(231,231,251,.06)'}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:10}} }
      }
    },
    plugins:[matchValueLabelPlugin(sessions.map(()=>({tipo:'Partido'})), (v)=>fmt(v,2), {showAll:true, matchColor:'#FBBF24', normalColor:'#FBBF24'})]
  };
  if(efficiencyDetailChart){ efficiencyDetailChart.destroy(); efficiencyDetailChart=null; }
  try{
    efficiencyDetailChart = new Chart(ctx, cfg);
    requestAnimationFrame(()=>{ if(efficiencyDetailChart) efficiencyDetailChart.resize(); });
  }catch(e){
    console.error('buildEfficiencyDetail: error creando el gráfico', e);
    canvas.parentElement.innerHTML = `<div style="color:var(--bad);font-family:'IBM Plex Mono';font-size:12px;padding:20px;text-align:center;">Error al dibujar el gráfico: ${e.message||e}</div>`;
  }
}
