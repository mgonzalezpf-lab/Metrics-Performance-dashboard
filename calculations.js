function avg(arr,key){
  const vals = arr.map(e=>e[key]).filter(v=>v!==null && v!==undefined && !isNaN(v));
  if(!vals.length) return 0;
  return vals.reduce((a,b)=>a+b,0)/vals.length;
}
function lastN(arr,n){ return arr.slice(Math.max(0,arr.length-n)); }

function computeRecordsFromEvents(events, metricOrder=METRIC_ORDER){
  const rec = {};
  events.forEach(e=>{
    if(!rec[e.jugador]) rec[e.jugador] = {jugador:e.jugador};
    metricOrder.forEach(m=>{
      const v = e[m];
      if(v===null||v===undefined||isNaN(v)) return;
      const cur = rec[e.jugador][m];
      if(!cur || v>cur.valor){
        rec[e.jugador][m] = {valor:v, fecha:e.fecha, origen:e.tipo, detalle:e.detalle};
      }
    });
  });
  return Object.values(rec);
}

let ROSTER_GK_NAMES = []; // nombres marcados como arquero en roster_players (agregados a mano, sin datos de GPS todavía)
const CATEGORIAS_FUTBOL_BASE = ['U16','U18','U20'];
let CURRENT_CATEGORY = null; // null = "Todas las categorías"
let ROSTER_CATEGORIES = {}; // normalizeNameKey(nombre) -> categoria ('U16'/'U18'/'U20'), para clubes de fútbol base con varias categorías
function matchesCurrentCategory(playerName){
  if(!CURRENT_CATEGORY) return true; // "Todas": no filtra nada
  return ROSTER_CATEGORIES[normalizeNameKey(playerName)] === CURRENT_CATEGORY;
}
// Eventos del club ya filtrados por la categoría seleccionada — usar esto (no ACTIVE_EVENTS directo)
// en cualquier cálculo que agrupe por fecha/ciclo mezclando jugadores (microciclos, etc.), para que
// un club de fútbol base con varias categorías no mezcle los entrenos de una categoría con otra.
// Si el modal de "Archivo de Catapult/PlayerTek detectado" está abierto, cualquier reconstrucción de
// gráfico se salta directo — sea por resize (ya cubierto en resizeAllCharts) o por una interacción
// perdida en un control que quedó "detrás" del modal (ej. el foco del teclado se quedó en un slider de
// Evolución del Plantel y una flecha del teclado, tipeada sin querer mientras se completaba el modal,
// dispara su oninput). Sin esto, ese gráfico se reconstruía mientras estaba tapado y quedaba en blanco.
function hayModalDeImportacionAbierto(){
  return document.getElementById('csvImportModal')?.style.display === 'flex';
}
function categoryFilteredEvents(){
  return ACTIVE_EVENTS.filter(e=> matchesCurrentCategory(e.jugador));
}
function isGoalkeeper(playerName){
  return GK_EVENTS.some(e=>normalizeNameKey(e.jugador)===normalizeNameKey(playerName)) || ROSTER_GK_NAMES.some(n=>normalizeNameKey(n)===normalizeNameKey(playerName));
}

let players=[], byPlayer={}, playerAvg={}, squadMax={}, squadAvg={}, RECORDS=[], recordByPlayer={};
let ARCHIVED_PLAYERS = new Set(); // normalizeNameKey(nombre) de jugadores archivados (ya no están en el club) — se
// sacan de todos lados donde se arma el plantel activo, pero su historial de GPS/RPE/Wellness no se toca.

function deriveAll(events){
  const filtered = events.filter(e=> matchesCurrentCategory(e.jugador) && !ARCHIVED_PLAYERS.has(normalizeNameKey(e.jugador)));
  players = [...new Set(filtered.map(e=>e.jugador))].sort();
  byPlayer = {};
  players.forEach(p=>{ byPlayer[p] = filtered.filter(e=>e.jugador===p).sort((a,b)=>a.fecha.localeCompare(b.fecha)); });

  playerAvg = {}; // metric averages over last 5 events
  players.forEach(p=>{
    const evs = lastN(byPlayer[p],5);
    playerAvg[p] = {};
    METRIC_ORDER.forEach(m=> playerAvg[p][m] = avg(evs,m));
  });

  squadMax = {}; squadAvg = {};
  METRIC_ORDER.forEach(m=>{
    squadMax[m] = Math.max(...filtered.map(e=>e[m]||0), 1);
    squadAvg[m] = avg(filtered,m);
  });

  RECORDS = computeRecordsFromEvents(filtered);
  recordByPlayer = {};
  RECORDS.forEach(r=> recordByPlayer[r.jugador]=r);
}
deriveAll(ACTIVE_EVENTS);

// ---------- ACWR (Acute:Chronic Workload Ratio) on Player Load ----------
function avgOrNull(arr,key){
  const vals = arr.map(e=>e[key]).filter(v=>v!==null && v!==undefined && !isNaN(v));
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}
function computeACWR(evs, refDateStr){
  if(!evs || evs.length<2) return {status:'insuf', ratio:null, acute:null, chronic:null};
  const ref = new Date(refDateStr+'T00:00:00');
  const within = (e,days)=>{
    const d = new Date(e.fecha+'T00:00:00');
    const diff = (ref-d)/86400000;
    return diff>=0 && diff<days;
  };
  const acuteEvs = evs.filter(e=>within(e,7));
  const chronicEvs = evs.filter(e=>within(e,28));
  if(!acuteEvs.length || !chronicEvs.length) return {status:'insuf', ratio:null, acute:null, chronic:null};
  // OJO: usamos avgOrNull (no avg) a propósito. Si los últimos 7 días son solo días libres/partido futuro
  // sin GPS real todavía (ej. se marcaron varios "Día libre" seguidos por adelantado), avg() devolvía 0 en
  // vez de "sin dato" — y un acute de 0 hacía ratio=0, mostrando "Carga baja" en TODO el plantel por error,
  // en vez de "Datos insuficientes" que es lo que realmente pasa (todavía no hay carga real para medir).
  const acute = avgOrNull(acuteEvs,'pl');
  const chronic = avgOrNull(chronicEvs,'pl');
  if(acute===null || !chronic) return {status:'insuf', ratio:null, acute, chronic};
  const ratio = acute/chronic;
  let status;
  if(ratio<0.8) status='low';
  else if(ratio<1.3) status='optimal';
  else if(ratio<1.5) status='caution';
  else status='high';
  return {status, ratio, acute, chronic};
}

// ---------- Monotonía y Strain (método Foster) ----------
// Semana = lunes a domingo. Días sin sesión cuentan como carga 0 (estándar del método).
function getMonday(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const day = d.getDay(); // 0=domingo
  const diff = (day===0? -6 : 1) - day;
  d.setDate(d.getDate()+diff);
  return d;
}
function isoDate(d){ return d.toISOString().slice(0,10); }
function computeMonotonyStrain(evs){
  if(!evs || !evs.length) return {monotony:null, strain:null, weeklyLoad:null, weekStart:null};
  const dates = evs.map(e=>e.fecha).sort();
  const lastDate = dates[dates.length-1];
  const monday = getMonday(lastDate);
  const dailyLoad = {};
  for(let i=0;i<7;i++){
    const d = new Date(monday); d.setDate(d.getDate()+i);
    dailyLoad[isoDate(d)] = 0;
  }
  evs.forEach(e=>{
    if(e.fecha in dailyLoad && e.pl!==null && e.pl!==undefined && !isNaN(e.pl)) dailyLoad[e.fecha] += e.pl;
  });
  const loads = Object.values(dailyLoad);
  const mean = loads.reduce((a,b)=>a+b,0)/loads.length;
  const variance = loads.reduce((a,b)=>a+Math.pow(b-mean,2),0)/loads.length;
  const sd = Math.sqrt(variance);
  const monotony = sd>0 ? mean/sd : null;
  const weeklyLoad = loads.reduce((a,b)=>a+b,0);
  const strain = monotony!==null ? weeklyLoad*monotony : null;
  return {monotony, strain, weeklyLoad, weekStart:isoDate(monday)};
}
function monotonyStatus(monotony){
  if(monotony===null) return {label:'Datos insuf.', varName:'--mist'};
  if(monotony<1.5) return {label:'Saludable', varName:'--good'};
  if(monotony<2.0) return {label:'Atención', varName:'--warn'};
  return {label:'Riesgo alto', varName:'--bad'};
}
function buildMonotonyStrain(){
  const box = document.getElementById('monotonyList');
  if(!box) return;
  const rows = players.map(p=>({p, ...computeMonotonyStrain(byPlayer[p])}))
    .sort((a,b)=> (b.strain||0)-(a.strain||0));
  box.innerHTML = rows.map((r,i)=>{
    const st = monotonyStatus(r.monotony);
    const pct = r.monotony!==null ? Math.min(100, r.monotony/3*100) : null;
    return `<div class="acwr-row ${r.p===state.player?'active':''}" data-p="${r.p}">
      <div class="rk">${i+1<10?'0':''}${i+1}</div>
      <div class="nm">${r.p}</div>
      <div class="acwr-track">${pct!==null?`<div class="acwr-marker" style="left:${pct}%"></div>`:''}</div>
      <div class="acwr-ratio">${r.monotony!==null? r.monotony.toFixed(2) : '—'}</div>
      <div><span class="acwr-badge" style="background:var(${st.varName});color:#14143A;">${st.label}</span></div>
    </div>`;
  }).join('');
  box.querySelectorAll('.acwr-row').forEach(el=> el.addEventListener('click',()=>selectPlayer(el.dataset.p)));
}

// ---------- Microciclos reales (partido a partido, cerrando en el/los día(s) libre(s)) ----------
// Promedio genérico de un campo numérico (dist, hsr, pl) sobre un conjunto de eventos, ignorando nulls.
function avgField(events, field){
  const withVal = events.filter(e=> e[field]!==null && e[field]!==undefined && !isNaN(e[field]));
  return withVal.length ? withVal.reduce((a,e)=>a+e[field],0)/withVal.length : null;
}
// m/min por evento: solo se puede calcular si ese evento tiene minutos jugados cargados (hoy, solo partidos).
function eventMPerMin(e){
  if(e.dist===null||e.dist===undefined||isNaN(e.dist)) return null;
  if(e.min===null||e.min===undefined||isNaN(e.min)||e.min<=0) return null;
  return e.dist/e.min;
}
function avgMPerMin(events){
  const vals = events.map(eventMPerMin).filter(v=>v!==null);
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}
// Info del último partido REALMENTE jugado (no la fecha manual futura) — sirve de referencia fija
// tanto para el % de intensidad de cada sesión (compuesto: dist + HSR + PL + m/min) como para saber
// desde cuándo arranca a contar el ciclo actual.
function getLastMatchInfo(events, nMatches=3){
  const matches = events.filter(e=>e.tipo==='Partido');
  if(!matches.length) return null;
  const matchDates = [...new Set(matches.map(e=>e.fecha))].sort();
  const lastDates = matchDates.slice(-nMatches); // hasta los últimos N partidos (más estable que uno solo)
  const perMatch = lastDates.map(d=>{
    const sameDay = matches.filter(e=>e.fecha===d);
    return {
      avgDist: avgField(sameDay,'dist'),
      avgHsr: avgField(sameDay,'hsr'),
      avgPl: avgField(sameDay,'pl'),
      avgMMin: avgMPerMin(sameDay),
    };
  });
  // promedio de los promedios: cada partido pesa igual, sin importar cuántos jugadores registró ese día
  const avgOf = (key)=>{
    const vals = perMatch.map(m=>m[key]).filter(v=>v!==null);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  };
  const lastDate = lastDates[lastDates.length-1]; // el ÚLTIMO partido real: sigue marcando el inicio del microciclo actual
  return {
    fecha: lastDate,
    rival: matches.find(e=>e.fecha===lastDate).detalle,
    matchesUsed: perMatch.length,
    avgDist: avgOf('avgDist'),
    avgHsr: avgOf('avgHsr'),
    avgPl: avgOf('avgPl'),
    avgMMin: avgOf('avgMMin'),
  };
}
function sumCycleDistanceAvg(datesArr, byDate){
  let total = 0;
  datesArr.forEach(d=>{
    const withDist = (byDate[d]||[]).filter(e=> e.dist!==null && e.dist!==undefined && !isNaN(e.dist));
    if(withDist.length) total += withDist.reduce((a,e)=>a+e.dist,0)/withDist.length;
  });
  return total;
}
function computeCurrentCycleAvg(field='dist'){
  const {cycles, byDate} = computeMicrocycles(categoryFilteredEvents());
  if(!cycles.length) return null;
  const lastCycle = cycles[cycles.length-1];
  let total = 0, count = 0;
  lastCycle.forEach(d=>{
    const withVal = (byDate[d]||[]).filter(e=> e[field]!==null && e[field]!==undefined && !isNaN(e[field]));
    if(withVal.length){
      total += withVal.reduce((a,e)=>a+e[field],0)/withVal.length;
      count++;
    }
  });
  return count ? Math.round(total/count) : null;
}
// Igual que computeCurrentCycleAvg, pero sumando el promedio diario de cada sesión del ciclo
// (el total acumulado del microciclo), en vez de promediar todo junto.
function computeCurrentCycleTotal(field='dist'){
  const {cycles, byDate} = computeMicrocycles(categoryFilteredEvents());
  if(!cycles.length) return null;
  const lastCycle = cycles[cycles.length-1];
  let total = 0, count = 0;
  lastCycle.forEach(d=>{
    const withVal = (byDate[d]||[]).filter(e=> e[field]!==null && e[field]!==undefined && !isNaN(e[field]));
    if(withVal.length){
      total += withVal.reduce((a,e)=>a+e[field],0)/withVal.length;
      count++;
    }
  });
  return count ? Math.round(total) : null;
}
const REST_DAY_KEYWORDS = ['day off','descanso','día libre','dia libre','rest day','libre'];
function isRestDayEvent(e){
  if(!e || !e.detalle) return false;
  const d = String(e.detalle).toLowerCase().trim();
  return REST_DAY_KEYWORDS.some(k => d===k || d.includes(k));
}
function computeMicrocycles(events){
  const byDate = {};
  events.forEach(e=>{
    if(!byDate[e.fecha]) byDate[e.fecha] = [];
    byDate[e.fecha].push(e);
  });
  const dates = Object.keys(byDate).sort();
  const cycles = [];
  let current = [];
  let lastCycleWasClosed = true; // se vuelve false solo si el último bloque queda sin cerrar (ni partido ni día libre final)
  for(let i=0;i<dates.length;i++){
    const d = dates[i];
    current.push(d);
    const isMatch = byDate[d].some(e=>e.tipo==='Partido');
    const isRest = byDate[d].some(isRestDayEvent);
    const nextIsRest = dates[i+1] ? byDate[dates[i+1]].some(isRestDayEvent) : false;
    // El microciclo cierra: (a) el mismo día del partido (el partido es el último día del ciclo, "MD"),
    // o (b) al terminar el último día libre consecutivo (bloques sin partido, ej. pretemporada).
    if(isMatch || (isRest && !nextIsRest)){
      cycles.push(current);
      current = [];
      lastCycleWasClosed = true;
    }
  }
  if(current.length){
    cycles.push(current);
    lastCycleWasClosed = false; // este bloque final quedó genuinamente abierto, sin partido ni día libre que lo cierre
  }
  return {cycles, byDate, lastCycleWasClosed};
}
