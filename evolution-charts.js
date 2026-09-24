// ---------- ACWR diario en base al RPE (mismo gráfico que el de GPS, pero con carga interna RPE×minutos) ----------
let rpeAcwrChartInstance;
function buildRpeAcwrChart(){
  const canvas = document.getElementById('rpeAcwrCanvas');
  if(!canvas) return;
  const byPlayerRpe = {};
  RPE_REPORTS_CACHE.forEach(r=>{ (byPlayerRpe[normalizeNameKey(r.player_name)] = byPlayerRpe[normalizeNameKey(r.player_name)]||[]).push(r); });
  const rpePlayerNames = [...new Set(RPE_REPORTS_CACHE.map(r=>r.player_name))];
  const dates = [...new Set(RPE_REPORTS_CACHE.map(r=>r.fecha))].sort();
  if(!dates.length){
    if(rpeAcwrChartInstance){ rpeAcwrChartInstance.destroy(); rpeAcwrChartInstance=null; }
    const tag2 = document.getElementById('rpeAcwrTag');
    if(tag2) tag2.textContent = t('sinReportesRpe');
    const labelElEmpty = document.getElementById('rpeAcwrLabel');
    if(labelElEmpty) labelElEmpty.innerHTML = '';
    const scrollBoxEmpty = document.getElementById('rpeAcwrScrollBox');
    const innerEmpty = document.getElementById('rpeAcwrInner');
    if(innerEmpty && scrollBoxEmpty) innerEmpty.style.width = scrollBoxEmpty.clientWidth + 'px';
    return;
  }

  // ACWR promedio del plantel (en base al RPE) para cada día con reportes cargados
  const allRatios = dates.map(d=>{
    const ratios = rpePlayerNames
      .map(p=> computeRpeACWR(byPlayerRpe[normalizeNameKey(p)]||[], d).ratio)
      .filter(r=> r!==null && r!==undefined && !isNaN(r));
    const avgRatio = ratios.length ? ratios.reduce((a,b)=>a+b,0)/ratios.length : null;
    const esPartido = categoryFilteredEvents().some(e=> e.fecha===d && e.tipo==='Partido');
    return { fecha:d, ratio: avgRatio!==null ? Math.round(avgRatio*100)/100 : null, esPartido };
  });

  const labels = allRatios.map(r=> r.fecha.slice(5).split('-').reverse().join('/'));
  const data = allRatios.map(r=> r.ratio);

  const labelEl = document.getElementById('rpeAcwrLabel');
  if(labelEl) labelEl.innerHTML = tf('diasRpeCargadosScrollHint', {n:`<b>${allRatios.length}</b>`}).replace('●', '<span style="color:#7C5CFC;">●</span>');

  const scrollBox = document.getElementById('rpeAcwrScrollBox');
  const inner = document.getElementById('rpeAcwrInner');
  const minWidth = scrollBox ? scrollBox.clientWidth : 300;
  const perDay = Math.max(48, Math.floor(minWidth / 15)); // ~15 días visibles en reposo, sin achicar demasiado en pantallas chicas
  const wantedWidth = Math.max(minWidth, allRatios.length * perDay);
  if(inner) inner.style.width = wantedWidth + 'px';

  if(typeof Chart === 'undefined'){
    canvas.parentElement.innerHTML = `<div style="color:var(--mist);font-family:'IBM Plex Mono';font-size:12px;padding:14px;text-align:center;">${t('noSePudoChartjs')}</div>`;
    return;
  }

  const rpeAcwrRefPlugin = {
    id: 'rpeAcwrDailyRef',
    afterDatasetsDraw(chart){
      const {ctx, chartArea, scales} = chart;
      if(!chartArea) return;
      const yScale = scales.y;
      ctx.save();
      [{v:0.8, color:'#34D399'},{v:1.3, color:'#34D399'},{v:1.5, color:'#FB7185'}].forEach(l=>{
        const y = yScale.getPixelForValue(l.v);
        if(y<chartArea.top || y>chartArea.bottom) return;
        ctx.strokeStyle = l.color; ctx.lineWidth = 1.2; ctx.setLineDash([5,4]);
        ctx.beginPath(); ctx.moveTo(chartArea.left,y); ctx.lineTo(chartArea.right,y); ctx.stroke();
      });
      ctx.restore();

      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textAlign = 'center';
      meta.data.forEach((point, idx)=>{
        const v = chart.data.datasets[0].data[idx];
        if(v===null || v===undefined) return;
        const esPartido = allRatios[idx] && allRatios[idx].esPartido;
        ctx.font = esPartido ? "700 12px 'IBM Plex Mono', monospace" : "600 11px 'IBM Plex Mono', monospace";
        ctx.fillStyle = esPartido ? '#B794F6' : '#67E8F9';
        ctx.fillText(v.toFixed(2), point.x, point.y - 12);
      });
      ctx.restore();
    }
  };

  const ctx2 = canvas.getContext('2d');
  const cfg2 = {
    type:'line',
    data:{ labels, datasets:[{
      label:'ACWR promedio del equipo (RPE)',
      data,
      spanGaps:true,
      borderColor:'#22D3EE',
      backgroundColor:'rgba(34,211,238,.10)',
      pointBackgroundColor: allRatios.map(r=> r.esPartido ? '#B794F6' : '#67E8F9'),
      pointBorderColor: allRatios.map(r=> r.esPartido ? '#7C5CFC' : '#22D3EE'),
      pointStyle: allRatios.map(r=> r.esPartido ? 'rectRot' : 'circle'),
      pointRadius: allRatios.map(r=> r.esPartido ? 6.5 : 5),
      pointHoverRadius: allRatios.map(r=> r.esPartido ? 8.5 : 7),
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
          backgroundColor:'#1E1E58', borderColor:'#22D3EE', borderWidth:1, titleColor:'#67E8F9', bodyColor:'#E7E7FB',
          callbacks:{
            label:(ctx)=> ctx.raw===null?'Datos insuficientes':`ACWR (RPE) promedio: ${ctx.raw.toFixed(2)}`,
            afterLabel:(ctx)=> allRatios[ctx.dataIndex] && allRatios[ctx.dataIndex].esPartido ? '⚽ Día de partido' : ''
          }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{
          color:(c)=> allRatios[c.index] && allRatios[c.index].esPartido ? '#B794F6' : '#9797C9',
          font:(c)=> ({family:'IBM Plex Mono', size:9.5, weight: (allRatios[c.index] && allRatios[c.index].esPartido) ? '700' : '400'})
        } },
        y:{ min:0.5, max:2.1, grid:{color:'rgba(231,231,251,.06)'}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:10}, stepSize:.2} }
      }
    },
    plugins:[rpeAcwrRefPlugin]
  };
  if(rpeAcwrChartInstance){ rpeAcwrChartInstance.destroy(); }
  rpeAcwrChartInstance = new Chart(ctx2, cfg2);
  requestAnimationFrame(()=>{
    if(rpeAcwrChartInstance) rpeAcwrChartInstance.resize();
    if(scrollBox) scrollBox.scrollLeft = scrollBox.scrollWidth;
    setTimeout(()=>{ if(scrollBox) scrollBox.scrollLeft = scrollBox.scrollWidth; }, 60);
  });
  const tag2 = document.getElementById('rpeAcwrTag');
  if(tag2) tag2.textContent = `${t('promedioPlantelRpe')} · ${tf('diasCargados',{n:allRatios.length})}`;
}

// ---------- team-wide daily evolution (dist / hsr / pl) ----------
const TEAM_METRICS = ['dist','hsr','vel','acc','desa','pl','sprint','sprint_count','rhie'];
// Plugin reutilizable: dibuja el valor numérico SOLO sobre los puntos de partido (no en cada sesión de entreno),
// para no saturar el gráfico — usado en Evolución del plantel y en el gráfico individual de cada jugador.
function matchValueLabelPlugin(evsRef, fmtFn, opts){
  const showAll = !!(opts && opts.showAll);
  const matchColor = (opts && opts.matchColor) || '#B794F6';
  const normalColor = (opts && opts.normalColor) || '#B794F6';
  return {
    id: 'matchValueLabel',
    afterDatasetsDraw(chart){
      const meta = chart.getDatasetMeta(0);
      if(!meta || !meta.data) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "700 11px 'IBM Plex Mono'";
      ctx.textAlign = 'center';
      meta.data.forEach((point, i)=>{
        const e = evsRef[i];
        const esPartido = !!(e && e.tipo==='Partido');
        if(!showAll && !esPartido) return;
        const v = chart.data.datasets[0].data[i];
        if(v===null || v===undefined) return;
        ctx.fillStyle = esPartido ? matchColor : normalColor;
        ctx.fillText(fmtFn(v), point.x, point.y - 12);
      });
      ctx.restore();
    }
  };
}
let teamTimelineChart;
let teamDailySeries = [];
function computeTeamDailySeries(){
  const map = {};
  categoryFilteredEvents().forEach(e=>{
    if(!map[e.fecha]) map[e.fecha] = { fecha:e.fecha, tipos:new Set(), dist:[], hsr:[], vel:[], pl:[], acc:[], desa:[], sprint:[], sprint_count:[], rhie:[], detalles:{} };
    const rec = map[e.fecha];
    rec.tipos.add(e.tipo);
    ['dist','hsr','vel','pl','acc','desa','sprint','sprint_count','rhie'].forEach(k=>{
      if(e[k]!==null && e[k]!==undefined && !isNaN(e[k])) rec[k].push(e[k]);
    });
    if(e.detalle){ const key=String(e.detalle).trim(); if(key) rec.detalles[key]=(rec.detalles[key]||0)+1; }
  });
  const avg = (arr)=> arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const topDetalle = (detalles)=>{
    const keys = Object.keys(detalles);
    if(!keys.length) return '';
    return keys.reduce((a,b)=> detalles[a]>=detalles[b] ? a : b);
  };
  teamDailySeries = Object.keys(map).sort().map(d=>{
    const rec = map[d];
    return {
      fecha: d,
      tipo: rec.tipos.size>1 ? 'Mixto' : [...rec.tipos][0],
      detalle: topDetalle(rec.detalles),
      dist: avg(rec.dist),
      hsr: avg(rec.hsr),
      vel: avg(rec.vel),
      pl: avg(rec.pl),
      acc: avg(rec.acc),
      desa: avg(rec.desa),
      sprint: avg(rec.sprint),
      sprint_count: avg(rec.sprint_count),
      rhie: avg(rec.rhie),
    };
  });
}

function buildTeamMetricTabs(){
  const box = document.getElementById('teamMetricTabs');
  if(!box) return;
  box.innerHTML = TEAM_METRICS.map(k=>`<button class="mtab ${k===state.ttMetric?'active':''}" data-m="${k}">${METRICS[k].label}</button>`).join('');
  box.querySelectorAll('.mtab').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.ttMetric = el.dataset.m;
      buildTeamMetricTabs();
      buildTeamTimeline();
    });
  });
}

function buildTeamTimeline(resetToLatest){
  if(hayModalDeImportacionAbierto()) return;
  computeTeamDailySeries();
  const allEvs = teamDailySeries;
  const maxOffset = Math.max(0, allEvs.length - TIMELINE_WINDOW);
  if(resetToLatest) state.ttOffset = maxOffset;
  state.ttOffset = Math.min(Math.max(0, state.ttOffset||0), maxOffset);

  const prevBtn = document.getElementById('ttPrev');
  const nextBtn = document.getElementById('ttNext');
  const slider = document.getElementById('ttSlider');
  if(slider){
    slider.max = maxOffset; slider.value = state.ttOffset;
    slider.oninput = (e)=>{ state.ttOffset = Number(e.target.value); buildTeamTimeline(); };
  }
  if(prevBtn) prevBtn.onclick = ()=>{ state.ttOffset = Math.max(0, state.ttOffset - TIMELINE_WINDOW); buildTeamTimeline(); };
  if(nextBtn) nextBtn.onclick = ()=>{ state.ttOffset = Math.min(maxOffset, state.ttOffset + TIMELINE_WINDOW); buildTeamTimeline(); };
  if(prevBtn) prevBtn.disabled = state.ttOffset<=0;
  if(nextBtn) nextBtn.disabled = state.ttOffset>=maxOffset;
  if(slider) slider.disabled = maxOffset<=0;

  const evs = allEvs.slice(state.ttOffset, state.ttOffset + TIMELINE_WINDOW);
  const label = document.getElementById('ttLabel');
  if(label){
    if(!allEvs.length) label.innerHTML = t('sinSesionesCargadas');
    else{
      const from = state.ttOffset+1, to = Math.min(allEvs.length, state.ttOffset+TIMELINE_WINDOW);
      label.innerHTML = tf('sesionesXaYdeZ',{from,to,total:allEvs.length});
    }
  }
  const tag = document.getElementById('teamTimelineTag');
  if(tag) tag.textContent = `${METRICS[state.ttMetric].label} · ${t('promedioDiarioPlantel')}`;

  const canvas = document.getElementById('teamTimelineChart');
  if(!canvas) return;
  if(typeof Chart === 'undefined'){
    canvas.parentElement.innerHTML = `<div style="color:var(--mist);font-family:'IBM Plex Mono';font-size:12px;padding:20px;text-align:center;">${t('noSePudoChartjsResto')}</div>`;
    return;
  }
  const m = state.ttMetric;
  const labels = evs.map(e=>{
    const dateStr = e.fecha.slice(5).split('-').reverse().join('/');
    const sub = e.detalle ? (e.tipo==='Partido' ? ('vs '+e.detalle) : e.detalle) : '';
    return sub ? [dateStr, sub.length>16 ? sub.slice(0,15)+'…' : sub] : dateStr;
  });
  // En un día libre no hay ninguna sesión — el promedio queda en null, y sin este ajuste el gráfico
  // conecta la línea directo entre el día anterior y el siguiente como si hubiera actividad real ahí
  // en el medio. Para las métricas de GPS, 0 es justamente lo que corresponde mostrar (no hubo distancia,
  // no hubo carga, etc.) — a diferencia de Wellness, donde un 0 significaría "recuperación pésima" en vez
  // de "no hubo sesión", así que ese otro gráfico no lleva este mismo ajuste.
  const data = evs.map(e=> isRestDayEvent(e) ? 0 : e[m]);
  const pointColors = evs.map(e=> e.tipo==='Partido' ? '#7C5CFC' : e.tipo==='Mixto' ? '#9797C9' : '#22D3EE');
  const pointStyles = evs.map(e=> e.tipo==='Partido' ? 'rectRot' : 'circle');
  const ctx = canvas.getContext('2d');
  const cfg = {
    type:'line',
    data:{ labels, datasets:[{
      label: METRICS[m].label,
      data,
      spanGaps:true,
      borderColor:'#22D3EE',
      backgroundColor:'rgba(34,211,238,.12)',
      pointBackgroundColor: pointColors,
      pointBorderColor: pointColors,
      pointStyle: pointStyles,
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
          backgroundColor:'#1E1E58', borderColor:'#22D3EE', borderWidth:1, titleColor:'#67E8F9', bodyColor:'#E7E7FB',
          callbacks:{
            title:(items)=>{
              const i=items[0].dataIndex; const e=evs[i];
              const dateStr = e.fecha.slice(5).split('-').reverse().join('/');
              const sub = e.detalle ? (e.tipo==='Partido' ? ('vs '+e.detalle) : e.detalle) : '';
              return sub ? `${dateStr} · ${sub}` : dateStr;
            },
            label:(ctx)=> ctx.raw===null||ctx.raw===undefined ? t('sinDatosTooltip') : `${METRICS[m].label}: ${fmt(ctx.raw, METRICS[m].dec)}${METRICS[m].unit?(' '+METRICS[m].unit):''}`
          }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:9.5}} },
        y:{ grace:'12%', grid:{color:'rgba(231,231,251,.06)'}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:10}} }
      }
    },
    plugins:[matchValueLabelPlugin(evs, (v)=>fmt(v, METRICS[m].dec))]
  };
  if(teamTimelineChart){ teamTimelineChart.destroy(); } // idem: se recrea siempre para que el plugin de etiquetas de partido no quede con datos/decimales de la métrica anterior
  teamTimelineChart = new Chart(ctx, cfg); requestAnimationFrame(()=>{ if(teamTimelineChart) teamTimelineChart.resize(); });
}

// ---------- Evolución del Wellness (TQR / Total Muscular / Score, promedio diario del plantel) ----------
let wellnessDailySeries = [];
let wellnessTrendChart;
function wellnessMetricMeta(key){
  if(key==='total_muscular') return {label:t('metricaTotalMuscular'), dec:1};
  if(key==='score') return {label:t('metricaScore'), dec:1};
  return {label:t('metricaTqr'), dec:1};
}
async function computeWellnessDailySeries(){
  const {data, error} = await supabaseClient.from('wellness_reports').select('*').eq('club', CURRENT_CLUB);
  if(error){ console.warn('No se pudo cargar la evolución de Wellness:', error); wellnessDailySeries = []; return; }
  const filtered = (data||[]).filter(r=> matchesCurrentCategory(r.player_name));
  const byDate = {};
  filtered.forEach(r=>{ (byDate[r.fecha] = byDate[r.fecha] || []).push(r); });
  // Fechas de partido real (si el club tiene GPS cargado), para marcar esos puntos distinto en el gráfico —
  // los clubes sin GPS no tienen este dato disponible, sus puntos quedan todos con el color normal.
  const matchDates = new Set(categoryFilteredEvents().filter(e=>e.tipo==='Partido').map(e=>e.fecha));
  const avg = (arr)=> arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  wellnessDailySeries = Object.keys(byDate).sort().map(fecha=>{
    const rows = byDate[fecha];
    const tqrVals = rows.map(r=>r.tqr).filter(v=>v!==null && v!==undefined);
    const muscVals = rows.map(r=> (r.fatiga!==null && r.fatiga!==undefined && r.dolor_muscular!==null && r.dolor_muscular!==undefined) ? (r.fatiga + r.dolor_muscular) : null).filter(v=>v!==null);
    const scoreVals = rows.map(r=>{
      const vals = ['sueno','fatiga','dolor_muscular','estres','animo'].map(k=>r[k]).filter(v=>v!==null && v!==undefined);
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    }).filter(v=>v!==null);
    return { fecha, tqr:avg(tqrVals), total_muscular:avg(muscVals), score:avg(scoreVals), esPartido:matchDates.has(fecha) };
  });
}
function buildWellnessMetricTabs(){
  const box = document.getElementById('wellnessMetricTabs');
  if(!box) return;
  const keys = ['tqr','total_muscular','score'];
  box.innerHTML = keys.map(k=>`<button class="mtab ${k===state.wtMetric?'active':''}" data-m="${k}">${wellnessMetricMeta(k).label}</button>`).join('');
  box.querySelectorAll('.mtab').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.wtMetric = el.dataset.m;
      buildWellnessMetricTabs();
      renderWellnessTrendChart(); // solo redibuja con los datos ya cargados — no hace falta pedirlos de nuevo a Supabase
    });
  });
}
async function buildWellnessTrendChart(resetToLatest){
  await computeWellnessDailySeries();
  renderWellnessTrendChart(resetToLatest);
}
function renderWellnessTrendChart(resetToLatest){
  if(hayModalDeImportacionAbierto()) return;
  const allEvs = wellnessDailySeries;
  const maxOffset = Math.max(0, allEvs.length - TIMELINE_WINDOW);
  if(resetToLatest) state.wtOffset = maxOffset;
  state.wtOffset = Math.min(Math.max(0, state.wtOffset||0), maxOffset);

  const prevBtn = document.getElementById('wtPrev');
  const nextBtn = document.getElementById('wtNext');
  const slider = document.getElementById('wtSlider');
  if(slider){
    slider.max = maxOffset; slider.value = state.wtOffset;
    slider.oninput = (e)=>{ state.wtOffset = Number(e.target.value); renderWellnessTrendChart(); };
  }
  if(prevBtn) prevBtn.onclick = ()=>{ state.wtOffset = Math.max(0, state.wtOffset - TIMELINE_WINDOW); renderWellnessTrendChart(); };
  if(nextBtn) nextBtn.onclick = ()=>{ state.wtOffset = Math.min(maxOffset, state.wtOffset + TIMELINE_WINDOW); renderWellnessTrendChart(); };
  if(prevBtn) prevBtn.disabled = state.wtOffset<=0;
  if(nextBtn) nextBtn.disabled = state.wtOffset>=maxOffset;
  if(slider) slider.disabled = maxOffset<=0;

  const evs = allEvs.slice(state.wtOffset, state.wtOffset + TIMELINE_WINDOW);
  const label = document.getElementById('wtLabel');
  if(label){
    if(!allEvs.length) label.innerHTML = t('sinSesionesCargadas');
    else{
      const from = state.wtOffset+1, to = Math.min(allEvs.length, state.wtOffset+TIMELINE_WINDOW);
      label.innerHTML = tf('sesionesXaYdeZ',{from,to,total:allEvs.length});
    }
  }
  const m = state.wtMetric;
  const meta = wellnessMetricMeta(m);
  const tag = document.getElementById('wellnessTrendTag');
  if(tag) tag.textContent = `${meta.label} · ${t('promedioDiarioPlantel')}`;

  const canvas = document.getElementById('wellnessTrendChart');
  if(!canvas) return;
  if(typeof Chart === 'undefined'){
    canvas.parentElement.innerHTML = `<div style="color:var(--mist);font-family:'IBM Plex Mono';font-size:12px;padding:20px;text-align:center;">${t('noSePudoChartjsResto')}</div>`;
    return;
  }
  const labels = evs.map(e=> e.fecha.slice(5).split('-').reverse().join('/'));
  const data = evs.map(e=>e[m]);
  const pointColors = evs.map(e=> e.esPartido ? '#7C5CFC' : '#34D399');
  const pointStyles = evs.map(e=> e.esPartido ? 'rectRot' : 'circle');
  const ctx = canvas.getContext('2d');
  const cfg = {
    type:'line',
    data:{ labels, datasets:[{
      label: meta.label,
      data,
      spanGaps:true,
      borderColor:'#34D399',
      backgroundColor:'rgba(52,211,153,.12)',
      pointBackgroundColor: pointColors,
      pointBorderColor: pointColors,
      pointStyle: pointStyles,
      pointRadius: evs.map(e=> e.esPartido ? 6.5 : 5),
      pointHoverRadius: evs.map(e=> e.esPartido ? 8.5 : 7),
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
          backgroundColor:'#1E1E58', borderColor:'#34D399', borderWidth:1, titleColor:'#6EE7B7', bodyColor:'#E7E7FB',
          callbacks:{
            label:(ctx)=> ctx.raw===null||ctx.raw===undefined ? t('sinDatosTooltip') : `${meta.label}: ${fmt(ctx.raw, meta.dec)}`
          }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:9.5}} },
        y:{ grace:'12%', grid:{color:'rgba(231,231,251,.06)'}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:10}} }
      }
    },
    plugins:[matchValueLabelPlugin(evs.map(e=>({tipo: e.esPartido ? 'Partido' : 'Entreno'})), (v)=>fmt(v, meta.dec), {showAll:true, matchColor:'#B794F6', normalColor:'#6EE7B7'})]
  };
  if(wellnessTrendChart){ wellnessTrendChart.destroy(); }
  wellnessTrendChart = new Chart(ctx, cfg); requestAnimationFrame(()=>{ if(wellnessTrendChart) wellnessTrendChart.resize(); });
}
