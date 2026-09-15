// ---------- Carga semanal del plantel (microciclo) ----------
let weeklyMicroChart;
function buildWeeklyMicroTabs(){
  const box = document.getElementById('weeklyMicroTabs');
  if(!box) return;
  const opts = [
    {key:'total', label:t('totalPlantel')},
    {key:'promedio', label:t('promedioPorJugador')},
  ];
  box.innerHTML = opts.map(o=>`<div class="mtab ${o.key===state.weeklyMicroTab?'active':''}" data-k="${o.key}">${o.label}</div>`).join('');
  box.querySelectorAll('.mtab').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.weeklyMicroTab = el.dataset.k;
      buildWeeklyMicroTabs();
      buildWeeklyMicrocycle();
    });
  });
}
function buildWeeklyMicrocycle(){
  const canvas = document.getElementById('weeklyMicroChart');
  if(!canvas || typeof Chart==='undefined') return;
  const weekMap = {};
  categoryFilteredEvents().forEach(e=>{
    const monday = isoDate(getMonday(e.fecha));
    if(!weekMap[monday]) weekMap[monday] = {pl:0, dist:0, jugadores:new Set()};
    if(e.pl!==null && !isNaN(e.pl)) weekMap[monday].pl += e.pl;
    if(e.dist!==null && !isNaN(e.dist)) weekMap[monday].dist += e.dist;
    weekMap[monday].jugadores.add(e.jugador);
  });
  const weeks = Object.keys(weekMap).sort().slice(-8); // últimas 8 semanas
  const labels = weeks.map(w=>{
    const d = new Date(w+'T00:00:00');
    return 'sem. ' + String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
  });
  const jugadoresPorSemana = weeks.map(w=> weekMap[w].jugadores.size);
  const totalData = weeks.map(w=> Math.round(weekMap[w].pl));
  const avgData = weeks.map((w,i)=> jugadoresPorSemana[i]>0 ? Math.round(weekMap[w].pl/jugadoresPorSemana[i]) : null);

  const tag = document.getElementById('weeklyTag');
  if(tag){
    const base = state.weeklyMicroTab==='promedio' ? 'Player Load promedio por jugador' : 'Player Load total por semana';
    if(weeks.length>=2){
      const last = weekMap[weeks[weeks.length-1]].pl, prev = weekMap[weeks[weeks.length-2]].pl;
      const pctChange = prev>0 ? Math.round(((last-prev)/prev)*100) : null;
      tag.textContent = pctChange!==null ? `${base} · ${pctChange>=0?'+':''}${pctChange}% vs semana anterior` : base;
    } else {
      tag.textContent = base;
    }
  }

  const isTotal = state.weeklyMicroTab!=='promedio';
  const data = isTotal ? totalData : avgData;
  const color = isTotal ? '#22D3EE' : '#FBBF24';
  const colorBg = isTotal ? 'rgba(34,211,238,.55)' : 'rgba(251,191,36,.55)';
  const label = isTotal ? 'Player Load total' : 'Player Load promedio por jugador';

  // plugin propio: dibuja el valor arriba de cada barra (misma técnica que ya usamos en el ACWR diario)
  const dataLabelPlugin = {
    id: 'weeklyMicroLabels',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.font = "600 11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      meta.data.forEach((bar, idx)=>{
        const v = chart.data.datasets[0].data[idx];
        if(v===null || v===undefined) return;
        ctx.fillText(fmt(v), bar.x, bar.y - 8);
      });
      ctx.restore();
    }
  };

  const ctx = canvas.getContext('2d');
  const cfg = {
    type:'bar',
    data:{ labels, datasets:[{ label, data, backgroundColor:colorBg, borderColor:color, borderWidth:1, borderRadius:4 }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{ padding:{ top:18 } },
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#1E1E58', borderColor:color, borderWidth:1, titleColor:'#67E8F9', bodyColor:'#E7E7FB',
          callbacks:{ afterBody:(items)=> `${jugadoresPorSemana[items[0].dataIndex]} jugadores distintos esa semana` }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:9.5}} },
        y:{ grace:'18%', grid:{color:'rgba(231,231,251,.06)'}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:10}} }
      }
    },
    plugins:[dataLabelPlugin]
  };
  if(weeklyMicroChart){ weeklyMicroChart.destroy(); weeklyMicroChart=null; }
  weeklyMicroChart = new Chart(ctx, cfg);
  requestAnimationFrame(()=>{ if(weeklyMicroChart) weeklyMicroChart.resize(); });
}

// ---------- Calidad de datos (outliers) ----------
// Marca valores que se alejan más de 3 desviaciones estándar del propio histórico del jugador.
// ---------- Pestañas de admin: Jugadores de Campo vs Arqueros (vistas completamente separadas) ----------
function switchAdminTab(tab){
  const fieldWrap = document.getElementById('fieldContentWrap');
  const gkView = document.getElementById('goalkeepersView');
  const cargaView = document.getElementById('controlCargaView');
  const partidosView = document.getElementById('partidosView');
  const wellnessView = document.getElementById('wellnessView');
  const rpeView = document.getElementById('rpeView');
  const clubesView = document.getElementById('clubesView');
  const eficienciaView = document.getElementById('eficienciaView');
  const btnJ = document.getElementById('tabBtnJugadores');
  const btnA = document.getElementById('tabBtnArqueros');
  const btnC = document.getElementById('tabBtnCarga');
  const btnP = document.getElementById('tabBtnPartidos');
  const btnW = document.getElementById('tabBtnWellness');
  const btnR = document.getElementById('tabBtnRpe');
  const btnCl = document.getElementById('tabBtnClubes');
  const btnE = document.getElementById('tabBtnEficiencia');
  const activeStyle = 'border-color:var(--gold);background:var(--gold);color:var(--pitch-950);';
  const inactiveStyle = 'border-color:var(--line-strong);background:transparent;color:var(--mist);';

  const views = {jugadores:fieldWrap, arqueros:gkView, carga:cargaView, partidos:partidosView, wellness:wellnessView, rpe:rpeView, clubes:clubesView, eficiencia:eficienciaView};
  const btns = {jugadores:btnJ, arqueros:btnA, carga:btnC, partidos:btnP, wellness:btnW, rpe:btnR, clubes:btnCl, eficiencia:btnE};
  const selected = views[tab] ? tab : 'jugadores';
  currentAdminTab = selected;
  Object.keys(views).forEach(key=>{
    if(views[key]) views[key].style.display = (key===selected) ? '' : 'none';
    if(btns[key]) btns[key].style.cssText += (key===selected) ? activeStyle : inactiveStyle;
  });
  if(selected==='clubes' && myProfile && myProfile.role==='owner'){ buildPendingClubsPanel(); buildClubesList(); }
  if(selected==='wellness' && !(myProfile && myProfile.role==='player')){ buildWellnessTeamList(); buildWellnessMetricTabs(); buildWellnessTrendChart(true); }
  if(selected==='eficiencia' && !(myProfile && myProfile.role==='player')){ buildEfficiencyRanking(); }
  if(selected==='carga'){
    // Estos 2 gráficos (ACWR diario y RPE) se construyen una sola vez al cargar la página, mientras esta
    // pestaña todavía estaba oculta — con el panel oculto, el navegador no puede calcular su ancho real,
    // así que el scroll hacia el día más reciente no tenía efecto en ese momento. Al entrar acá, ya con
    // el panel visible y el ancho ya calculado de verdad, se reintenta.
    requestAnimationFrame(()=>{
      const wb = document.getElementById('weeklyChartScrollBox');
      if(wb) wb.scrollLeft = wb.scrollWidth;
      const rb = document.getElementById('rpeAcwrScrollBox');
      if(rb) rb.scrollLeft = rb.scrollWidth;
      setTimeout(()=>{
        if(wb) wb.scrollLeft = wb.scrollWidth;
        if(rb) rb.scrollLeft = rb.scrollWidth;
      }, 60);
    });
  }
}
function buildDataQuality(){
  const box = document.getElementById('dataQualityList');
  if(!box) return;
  const flagged = [];
  const metricsToCheck = ['dist','hsr','vel','pl'];
  players.forEach(p=>{
    const evs = byPlayer[p]||[];
    metricsToCheck.forEach(m=>{
      const vals = evs.map(e=>e[m]).filter(v=>v!==null && v!==undefined && !isNaN(v));
      if(vals.length<5) return;
      const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
      const sd = Math.sqrt(vals.reduce((a,b)=>a+Math.pow(b-mean,2),0)/vals.length);
      if(sd<=0) return;
      evs.forEach(e=>{
        const v = e[m];
        if(v===null || v===undefined || isNaN(v)) return;
        const z = Math.abs(v-mean)/sd;
        if(z>3){
          flagged.push({p, fecha:e.fecha, metric:m, value:v, z, detalle:e.detalle||e.tipo});
        }
      });
    });
  });
  flagged.sort((a,b)=> b.z-a.z);
  if(!flagged.length){
    box.innerHTML = `<div style="padding:14px 0;color:var(--mist);font-size:12.5px;">${t('sinValoresAtipicos')}</div>`;
    return;
  }
  box.innerHTML = flagged.slice(0,15).map((r,i)=>{
    const dateStr = r.fecha.split('-').reverse().join('/');
    return `<div class="acwr-row" data-p="${r.p}">
      <div class="rk">${i+1<10?'0':''}${i+1}</div>
      <div class="nm">${r.p}</div>
      <div class="acwr-track" style="display:flex;align-items:center;color:var(--mist);font-size:11px;background:none;opacity:1;">${METRICS[r.metric].label} · ${dateStr} · ${r.detalle}</div>
      <div class="acwr-ratio">${fmt(r.value, METRICS[r.metric].dec)}</div>
      <div><span class="acwr-badge" style="background:var(--bad);color:#14143A;">z=${r.z.toFixed(1)}</span></div>
    </div>`;
  }).join('');
  box.querySelectorAll('.acwr-row').forEach(el=> el.addEventListener('click',()=>selectPlayer(el.dataset.p)));
}

// ---------- KPI strip ----------
// Total de un campo (pl, dist, etc.) de la semana actual vs la anterior (mismo agrupado lunes-domingo que "Carga semanal del plantel")
function getWeeklyFieldComparison(field='pl'){
  const weekMap = {};
  categoryFilteredEvents().forEach(e=>{
    const monday = isoDate(getMonday(e.fecha));
    if(!weekMap[monday]) weekMap[monday] = 0;
    if(e[field]!==null && e[field]!==undefined && !isNaN(e[field])) weekMap[monday] += e[field];
  });
  const weeks = Object.keys(weekMap).sort();
  if(!weeks.length) return null;
  const current = weekMap[weeks[weeks.length-1]];
  const prev = weeks.length>=2 ? weekMap[weeks[weeks.length-2]] : null;
  const pctChange = (prev!==null && prev>0) ? ((current-prev)/prev*100) : null;
  return { current: Math.round(current), prev: prev!==null?Math.round(prev):null,
    pctChange: pctChange!==null?Math.round(pctChange):null,
    within20: pctChange!==null ? Math.abs(pctChange)<=20 : null };
}
function getWeeklyPLComparison(){ return getWeeklyFieldComparison('pl'); }

// Player Load por microciclo (partido a partido), no por semana calendario: compara el promedio diario
// del ciclo actual (en curso) contra el del ciclo anterior ya cerrado, así ciclos cortos/largos no se distorsionan entre sí.
function getCyclePLComparison(){
  const {cycles, byDate} = computeMicrocycles(categoryFilteredEvents());
  if(!cycles.length) return null;
  const sumCycle = (datesArr)=>{
    let total = 0, count = 0;
    datesArr.forEach(d=>{
      const withVal = (byDate[d]||[]).filter(e=> e.pl!==null && e.pl!==undefined && !isNaN(e.pl));
      if(withVal.length){ total += withVal.reduce((a,e)=>a+e.pl,0)/withVal.length; count++; }
    });
    return { total, days: count };
  };
  // El ciclo ACTUAL siempre es el más reciente de verdad (aunque todavía no tenga datos cargados, ej.
  // recién arrancó con un día libre tras el partido) — si no, esta tarjeta se quedaba pegada mostrando el
  // total del último ciclo CERRADO (ej. el del partido anterior) en vez de reflejar que ya arrancó uno nuevo.
  const currentArr = cycles[cycles.length-1];
  const current = sumCycle(currentArr);
  // Para el ciclo de REFERENCIA (anterior) sí hay que saltar los ciclos "fantasma" (ej. un día libre suelto
  // sin ningún entreno/partido) — si no, "el ciclo anterior" terminaba siendo ese día libre vacío en vez del
  // ciclo real con partido, mostrando siempre "sin ciclo anterior para comparar" aunque sí hubiera uno.
  const cycleHasData = (datesArr)=> datesArr.some(d=> (byDate[d]||[]).some(e=> !isRestDayEvent(e)));
  const priorCyclesWithData = cycles.slice(0, -1).filter(cycleHasData);
  const prevArr = priorCyclesWithData.length ? priorCyclesWithData[priorCyclesWithData.length-1] : null;
  const prev = prevArr ? sumCycle(prevArr) : null;
  const currentPerDay = current.days ? current.total/current.days : null;
  const prevPerDay = (prev && prev.days) ? prev.total/prev.days : null;
  const pctChange = (currentPerDay!==null && prevPerDay!==null && prevPerDay>0) ? ((currentPerDay-prevPerDay)/prevPerDay*100) : null;
  return {
    current: current.days ? Math.round(current.total) : null,
    currentHasData: current.days > 0,
    prev: prev ? Math.round(prev.total) : null,
    pctChange: pctChange!==null ? Math.round(pctChange) : null,
    within20: pctChange!==null ? Math.abs(pctChange)<=20 : null,
  };
}

// ---------- Objetivo para el próximo microciclo: compara el ciclo actual contra el ÚLTIMO ciclo cerrado ----------
function buildWeeklyTarget(){
  const body = document.getElementById('weeklyTargetBody');
  const recBox = document.getElementById('weeklyTargetRecommendation');
  if(!body) return;
  const pctInput = document.getElementById('weeklyTargetPct');
  const pct = pctInput ? Math.max(1, Math.min(100, Number(pctInput.value) || 20)) : 20;

  const {cycles, byDate, lastCycleWasClosed} = computeMicrocycles(categoryFilteredEvents());
  const emptyState = ()=>{
    body.innerHTML = `<div style="color:var(--mist);font-size:12px;">${t('sinDatosSuficientes')}</div>`;
    if(recBox) recBox.innerHTML = '';
  };
  if(!cycles.length){ emptyState(); return; }

  // Ignora los "microciclos" que son solo un día libre suelto sin ningún dato real (ej. el día siguiente
  // a un partido) — si no, ese ciclo vacío contamina la comparación como si fuera el ciclo de referencia
  // (esto era lo que generaba mensajes contradictorios y porcentajes exagerados antes).
  const cycleHasData = (datesArr)=> datesArr.some(d=> (byDate[d]||[]).some(e=> !isRestDayEvent(e)));
  const cyclesWithData = cycles.filter(cycleHasData);
  if(!cyclesWithData.length){ emptyState(); return; }

  // El ciclo EN CURSO es el último de la lista, solo si todavía no cerró (sin partido/día libre que lo cierre).
  // El ciclo de REFERENCIA es siempre el último ciclo CERRADO con datos reales — no un promedio de varios,
  // así es más fácil de asociar: "esta semana vs. la semana pasada", nada más.
  const lastIsOpen = !lastCycleWasClosed;
  const currentCycle = lastIsOpen ? cyclesWithData[cyclesWithData.length-1] : null;
  const refCycle = lastIsOpen ? cyclesWithData[cyclesWithData.length-2] : cyclesWithData[cyclesWithData.length-1];

  if(!refCycle){
    body.innerHTML = `<div style="color:var(--mist);font-size:12px;">${t('necesitaUnCicloCerrado')}</div>`;
    if(recBox) recBox.innerHTML = '';
    return;
  }

  // Promedio DIARIO (no total) — así un ciclo corto (post-racha de partidos) y uno normal de 7 días
  // se comparan de igual a igual, sin importar cuántos días de trabajo tenga cada uno.
  const dailyAvg = (datesArr, field) => {
    let total = 0, count = 0;
    datesArr.forEach(d=>{
      const v = avgField(byDate[d]||[], field);
      if(v!==null){ total += v; count++; }
    });
    return count ? total/count : null;
  };

  // Cuántos días de trabajo (entrenos + partido) va a tener este ciclo, para poder mostrar una meta TOTAL,
  // no solo el promedio diario. Si ya está cargada la fecha del próximo partido, se usan los días reales
  // que faltan hasta esa fecha. Si no, se usa la duración real del último ciclo cerrado como mejor estimación
  // (el historial disponible), en vez de asumir siempre una semana completa de 7 días.
  const countWorkDays = (datesArr) => datesArr.filter(d=> (byDate[d]||[]).some(e=> !isRestDayEvent(e))).length;
  let cicloDias = countWorkDays(refCycle) || refCycle.length;
  if(currentCycle && currentCycle.length){
    if(NEXT_MATCH_DATE){
      const start = currentCycle[0];
      const totalDays = Math.round((new Date(NEXT_MATCH_DATE+'T00:00:00') - new Date(start+'T00:00:00')) / 86400000) + 1;
      if(totalDays > 0) cicloDias = totalDays;
    } else {
      cicloDias = Math.max(currentCycle.length, cicloDias);
    }
  }

  const metrics = [
    {key:'dist', label:t('mtDistancia'), unit:'m'},
    {key:'hsr', label:'HSR', unit:'m'},
    {key:'pl', label:t('mtPlayerLoad'), unit:''},
    {key:'rhie', label:'RHIE Bouts', unit:''},
  ];

  const diffs = []; // {label, diffPct, within} de cada métrica, para la recomendación final
  const cardsHtml = metrics.map(m=>{
    const refDaily = dailyAvg(refCycle, m.key);
    if(refDaily===null){
      return `<div class="kpi" style="flex:1;min-width:170px;"><div class="lbl">${m.label}</div><div class="sub">${t('sinCiclosCerrados')}</div></div>`;
    }
    let curDaily = null, diffPct = null, within = null;
    if(currentCycle){
      curDaily = dailyAvg(currentCycle, m.key);
      if(curDaily!==null && refDaily>0){
        diffPct = Math.round((curDaily-refDaily)/refDaily*100);
        within = Math.abs(diffPct) <= pct;
        diffs.push({label:m.label, diffPct, within});
      }
    }
    const diffHtml = diffPct!==null ? `<div class="sub" style="margin-top:4px;">
      <span style="color:${within?'var(--good)':(diffPct>0?'var(--bad)':'var(--warn)')};font-weight:700;">${diffPct>=0?'▲':'▼'} ${Math.abs(diffPct)}%</span> ${t('vsUltimoCiclo')}
    </div>` : '';
    const valShown = curDaily!==null ? curDaily : refDaily;
    const metaTotal = Math.round(refDaily * cicloDias);
    return `<div class="kpi" style="flex:1;min-width:170px;">
      <div class="lbl">${m.label}</div>
      <div class="val" style="font-size:24px;">${fmt(Math.round(valShown))}<small>${m.unit}/${t('diaAbrev')}</small></div>
      <div class="sub">${t('ultimoCicloFue')} ${fmt(Math.round(refDaily))}${m.unit}/${t('diaAbrev')}</div>
      <div class="sub" style="margin-top:4px;color:var(--gold-bright);font-weight:700;">${tf('metaTotalCiclo',{d:cicloDias})}: ${fmt(metaTotal)}${m.unit}</div>
      ${diffHtml}
    </div>`;
  }).join('');
  body.innerHTML = cardsHtml;

  // ---- Recomendación en una frase: ¿subo, bajo o mantengo la carga? ----
  if(recBox){
    if(!currentCycle){
      recBox.innerHTML = `<div style="padding:10px 14px;background:rgba(255,255,255,.03);border:1px solid var(--line-strong);border-radius:8px;font-size:12.5px;color:var(--mist);line-height:1.5;">${t('esperandoProximoCiclo')}</div>`;
    } else if(!diffs.length){
      recBox.innerHTML = `<div style="padding:10px 14px;background:rgba(255,255,255,.03);border:1px solid var(--line-strong);border-radius:8px;font-size:12.5px;color:var(--mist);line-height:1.5;">${t('sinDatosSuficientes')}</div>`;
    } else {
      const porArriba = diffs.filter(d=>!d.within && d.diffPct>0);
      const porAbajo = diffs.filter(d=>!d.within && d.diffPct<0);
      let color, texto;
      if(porArriba.length){
        color = 'var(--bad)';
        texto = `⬇️ ${tf('bajarCargaSimple',{m:porArriba.map(c=>c.label).join(', ')})}`;
      } else if(porAbajo.length === diffs.length){
        color = 'var(--warn)';
        texto = `⬆️ ${t('subirCargaSimple')}`;
      } else {
        color = 'var(--good)';
        texto = `✅ ${t('mantenerCargaSimple')}`;
      }
      recBox.innerHTML = `<div style="padding:10px 14px;background:rgba(255,255,255,.03);border:1px solid ${color};border-radius:8px;font-size:13px;font-weight:700;color:var(--bone);line-height:1.5;">${texto}</div>`;
    }
  }
}

// % de intensidad compuesta (dist+hsr+pl+m/min vs promedio de los últimos 3 partidos) de la sesión MÁS RECIENTE cargada
function getCurrentSessionIntensity(){
  const dates = [...new Set(categoryFilteredEvents().map(e=>e.fecha))].sort();
  if(!dates.length) return null;
  const lastDate = dates[dates.length-1];
  const catEvents = categoryFilteredEvents();
  const dayEvents = catEvents.filter(e=>e.fecha===lastDate);
  const lastMatch = getLastMatchInfo(catEvents);
  const distAvg = avgField(dayEvents,'dist');
  const hsrAvg = avgField(dayEvents,'hsr');
  const plAvg = avgField(dayEvents,'pl');
  const mminAvg = avgMPerMin(dayEvents);
  const pcts = [];
  if(distAvg!==null && lastMatch && lastMatch.avgDist) pcts.push(distAvg/lastMatch.avgDist*100);
  if(hsrAvg!==null && lastMatch && lastMatch.avgHsr) pcts.push(hsrAvg/lastMatch.avgHsr*100);
  if(plAvg!==null && lastMatch && lastMatch.avgPl) pcts.push(plAvg/lastMatch.avgPl*100);
  if(mminAvg!==null && lastMatch && lastMatch.avgMMin) pcts.push(mminAvg/lastMatch.avgMMin*100);
  return { fecha:lastDate, pct: pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length) : null };
}

function buildKPIs(){
  const catEvents = categoryFilteredEvents();
  const avgPL = avg(catEvents,'pl');
  const dates = [...new Set(catEvents.map(e=>e.fecha))].sort();
  const lastDate = dates[dates.length-1];
  document.getElementById('lastDate').textContent = lastDate ? lastDate.split('-').reverse().join('/') : '—';
  const rangeMetaCountEl = document.getElementById('rangeMetaCount');
  if(rangeMetaCountEl) rangeMetaCountEl.textContent = players.length;
  const todays = lastDate ? RECORDS.filter(r=>['dist','hsr','vel','acc','desa','pl','rhie'].some(m=>r[m] && r[m].fecha===lastDate)) : [];
  const lastMatch = getLastMatchInfo(catEvents);
  const cycleDistTotal = computeCurrentCycleTotal('dist');
  const cycleHsrTotal = computeCurrentCycleTotal('hsr');
  const cyclePL = getCyclePLComparison();
  const sessionIntensity = getCurrentSessionIntensity();

  const cycleSub = lastMatch ? tf('desdeVs', {r:lastMatch.rival, d:lastMatch.fecha.split('-').reverse().join('/')}) : t('sinPartidoRef');

  let weeklySub = (cyclePL && !cyclePL.currentHasData && cyclePL.prev!==null) ? t('esperandoDatosCicloActual') : t('sinCicloAnterior');
  if(cyclePL && cyclePL.pctChange!==null){
    const signo = cyclePL.pctChange>=0 ? '+' : '';
    weeklySub = cyclePL.within20
      ? `<b style="color:var(--good);">${t('dentroDe20')}</b> · ${signo}${cyclePL.pctChange}% ${t('vsCicloAnterior')}`
      : `<b style="color:var(--bad);">${t('fueraDe20')}</b> · ${signo}${cyclePL.pctChange}% ${t('vsCicloAnterior')}`;
  }

  const kpis = [
    {lbl:t('kpiDistCiclo'), val: cycleDistTotal!==null ? fmt(cycleDistTotal) : '—', unit:'m',
      sub: `${t('totalAcumulado')} · ${cycleSub}`},
    {lbl:t('kpiHsrCiclo'), val: cycleHsrTotal!==null ? fmt(cycleHsrTotal) : '—', unit:'m',
      sub: `${t('totalAcumulado')} · ${cycleSub}`},
    {lbl:t('kpiPlCiclo'), val: cyclePL ? fmt(cyclePL.current) : '—', unit:'',
      sub: weeklySub},
    {lbl:t('kpiRecords'), val:todays.length, unit:'', sub: todays.length? `<b>${todays.map(x=>x.jugador.split(' ')[0]).slice(0,3).join(', ')}${todays.length>3?'…':''}</b>` : t('sinNuevos')},
    {lbl:t('kpiIntensidadSesion'), val: sessionIntensity && sessionIntensity.pct!==null ? sessionIntensity.pct : '—', unit: sessionIntensity && sessionIntensity.pct!==null ? '%' : '',
      sub: sessionIntensity ? tf('sesionDelVsProm', {d:sessionIntensity.fecha.split('-').reverse().join('/')}) : t('sinDatos')},
  ];
  document.getElementById('kpiStrip').innerHTML = kpis.map(k=>`
    <div class="kpi">
      <div class="lbl">${k.lbl}</div>
      <div class="val">${k.val}${k.unit?`<small>${k.unit}</small>`:''}</div>
      <div class="sub">${k.sub}</div>
    </div>`).join('');
}
