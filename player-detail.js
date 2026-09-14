// ---------- radar ----------
function polygonPoints(values, cx, cy, R){
  const n = values.length;
  return values.map((v,i)=>{
    const angle = -Math.PI/2 + i*(2*Math.PI/n);
    const r = v*R;
    return [cx + r*Math.cos(angle), cy + r*Math.sin(angle)];
  });
}
// Estira visualmente los valores hacia afuera del centro (un valor típico, no extremo, ocupa más
// espacio del radar), sin cambiar el orden relativo entre métricas ni el límite de 100% en el borde.
// Ej: 0.15 (un valor chico frente al máximo histórico del club) pasa a verse como ~0.42 en el dibujo.
function radarBoost(v){ return v<=0 ? 0 : Math.pow(v, 0.55); }

function drawRadar(player){
  const svg = document.getElementById('radarSvg');
  const cx=200, cy=205, R=140;
  const n = METRIC_ORDER.length;
  let parts = [];

  // range rings
  [0.25,0.5,0.75,1].forEach(f=>{
    const pts = polygonPoints(Array(n).fill(f), cx,cy,R);
    parts.push(`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="rgba(231,231,251,.14)" stroke-width="1"/>`);
  });
  // spokes + labels
  METRIC_ORDER.forEach((m,i)=>{
    const angle = -Math.PI/2 + i*(2*Math.PI/n);
    const x2 = cx + R*Math.cos(angle), y2 = cy + R*Math.sin(angle);
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="rgba(231,231,251,.10)" stroke-width="1"/>`);
    const lx = cx + (R+31)*Math.cos(angle), ly = cy + (R+31)*Math.sin(angle);
    parts.push(`<text x="${lx}" y="${ly}" fill="#9797C9" font-size="12.5" font-family="IBM Plex Mono" text-anchor="middle" dominant-baseline="middle">${METRICS[m].label.toUpperCase()}</text>`);
  });

  const pAvg = playerAvg[player] || {};
  const normPlayer = METRIC_ORDER.map(m=> squadMax[m]? radarBoost(Math.min(1,(pAvg[m]||0)/squadMax[m])) : 0);
  const normSquad = METRIC_ORDER.map(m=> squadMax[m]? radarBoost((squadAvg[m]||0)/squadMax[m]) : 0);

  const squadPts = polygonPoints(normSquad,cx,cy,R);
  parts.push(`<polygon points="${squadPts.map(p=>p.join(',')).join(' ')}" fill="rgba(151,151,201,.08)" stroke="#9797C9" stroke-width="1.4" stroke-dasharray="4,3"/>`);

  const playerPts = polygonPoints(normPlayer,cx,cy,R);
  parts.push(`<polygon points="${playerPts.map(p=>p.join(',')).join(' ')}" fill="rgba(34,211,238,.22)" stroke="#22D3EE" stroke-width="2"/>`);
  playerPts.forEach(p=>{ parts.push(`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#67E8F9" stroke="#14143A" stroke-width="1.3"/>`); });

  // record markers (personal best) as small maroon diamonds + etiqueta fija con el valor
  const rec = recordByPlayer[player];
  if(rec){
    const normRec = METRIC_ORDER.map(m=> squadMax[m]? radarBoost(Math.min(1,(rec[m]?rec[m].valor:0)/squadMax[m])) : 0);
    const recPts = polygonPoints(normRec,cx,cy,R);
    recPts.forEach(p=>{ parts.push(`<rect x="${p[0]-3.5}" y="${p[1]-3.5}" width="7" height="7" fill="#FB923C" stroke="#14143A" stroke-width="1.2" transform="rotate(45 ${p[0]} ${p[1]})"/>`); });
    METRIC_ORDER.forEach((m,i)=>{
      const rv = rec[m] ? rec[m].valor : null;
      if(rv===null || rv===undefined) return;
      const angle = -Math.PI/2 + i*(2*Math.PI/n);
      const p = recPts[i];
      const labelR = Math.hypot(p[0]-cx, p[1]-cy) + 15; // un poco más afuera del punto, sobre el mismo ángulo
      const lx = cx + labelR*Math.cos(angle), ly = cy + labelR*Math.sin(angle);
      const unit = METRICS[m].unit;
      const text = `${fmt(rv, METRICS[m].dec)}${unit?(' '+unit):''}`;
      parts.push(`<text x="${lx}" y="${ly}" fill="#FDBA74" font-size="11" font-weight="700" font-family="IBM Plex Mono" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#14143A" stroke-width="3">${text}</text>`);
    });
  }

  parts.push(`<circle cx="${cx}" cy="${cy}" r="2" fill="#E7E7FB"/>`);
  svg.innerHTML = parts.join('');

  // side stats
  const side = document.getElementById('radarSide');
  const sesionesJugador = byPlayer[player] || [];
  const ultimaSesion = sesionesJugador.length ? sesionesJugador[sesionesJugador.length-1] : null;
  side.innerHTML = `
    <div class="rs-item gold"><div class="k">${t('ultimaSesion')}${ultimaSesion?' · '+ultimaSesion.fecha.split('-').reverse().join('/'):''}</div><div class="v">${fmt(ultimaSesion?ultimaSesion.dist:0)}<span>m dist.</span></div></div>
    <div class="rs-item gold"><div class="k">${t('playerLoadProm')}</div><div class="v">${fmt(Math.round(pAvg.pl||0))}</div></div>
    <div class="rs-item mist"><div class="k">${t('promedioDelPlantel')}</div><div class="v">${fmt(Math.round(squadAvg.dist))}<span>m dist.</span></div></div>
  `;
}

// ---------- timeline chart ----------
let timelineChart;
function clampTlOffset(total){
  const maxOffset = Math.max(0, total - TIMELINE_WINDOW);
  state.tlOffset = Math.min(Math.max(0, state.tlOffset), maxOffset);
  return maxOffset;
}
function buildTimeline(player, metric, resetToLatest){
  const allEvs = byPlayer[player]||[];
  const maxOffset = Math.max(0, allEvs.length - TIMELINE_WINDOW);
  if(resetToLatest) state.tlOffset = maxOffset;
  clampTlOffset(allEvs.length);

  // wire nav controls (idempotent)
  const prevBtn = document.getElementById('tlPrev');
  const nextBtn = document.getElementById('tlNext');
  const slider = document.getElementById('tlSlider');
  if(slider){
    slider.max = maxOffset;
    slider.value = state.tlOffset;
    slider.oninput = (e)=>{ state.tlOffset = Number(e.target.value); buildTimeline(state.player, state.metric); };
  }
  if(prevBtn) prevBtn.onclick = ()=>{ state.tlOffset = Math.max(0, state.tlOffset - TIMELINE_WINDOW); buildTimeline(state.player, state.metric); };
  if(nextBtn) nextBtn.onclick = ()=>{ state.tlOffset = Math.min(maxOffset, state.tlOffset + TIMELINE_WINDOW); buildTimeline(state.player, state.metric); };
  if(prevBtn) prevBtn.disabled = state.tlOffset<=0;
  if(nextBtn) nextBtn.disabled = state.tlOffset>=maxOffset;
  if(slider) slider.disabled = maxOffset<=0;

  const evs = allEvs.slice(state.tlOffset, state.tlOffset + TIMELINE_WINDOW);
  const tlLabelEl = document.getElementById('tlLabel');
  if(tlLabelEl){
    if(!allEvs.length){ tlLabelEl.innerHTML = t('sinSesionesCargadas'); }
    else{
      const from = state.tlOffset+1, to = Math.min(allEvs.length, state.tlOffset+TIMELINE_WINDOW);
      tlLabelEl.innerHTML = tf('sesionesXaYdeZ',{from,to,total:allEvs.length});
    }
  }

  if(typeof Chart === 'undefined'){
    document.getElementById('timelinePlayerTag').textContent = player;
    const box = document.querySelector('.chart-box');
    if(box) box.innerHTML = `<div style="color:var(--mist);font-family:'IBM Plex Mono';font-size:12px;padding:20px;text-align:center;">${t('noSePudoChartjsResto')}</div>`;
    return;
  }
  const labels = evs.map(e=>{
    const dateStr = e.fecha.slice(5).split('-').reverse().join('/');
    const sub = e.detalle ? (e.tipo==='Partido' ? ('vs '+e.detalle) : e.detalle) : '';
    return sub ? [dateStr, sub.length>16 ? sub.slice(0,15)+'…' : sub] : dateStr;
  });
  const data = evs.map(e=>e[metric]);
  const pointColors = evs.map(e=> e.tipo==='Partido' ? '#7C5CFC' : '#22D3EE');
  const pointStyles = evs.map(e=> e.tipo==='Partido' ? 'rectRot' : 'circle');
  const ctx = document.getElementById('timelineChart').getContext('2d');
  const cfg = {
    type:'line',
    data:{ labels, datasets:[{
      label: METRICS[metric].label,
      data,
      spanGaps: true,
      borderColor:'#22D3EE',
      backgroundColor:'rgba(34,211,238,.12)',
      pointBackgroundColor:pointColors,
      pointBorderColor:pointColors,
      pointStyle:pointStyles,
      pointRadius:5,
      pointHoverRadius:7,
      tension:.35,
      fill:true,
      borderWidth:2,
    }]},
    options:{
      responsive:true,maintainAspectRatio:false,
      layout:{ padding:{ top:18 } },
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#1E1E58', borderColor:'#22D3EE', borderWidth:1, titleColor:'#67E8F9', bodyColor:'#E7E7FB',
          callbacks:{
            label:(ctx)=>{ const e = evs[ctx.dataIndex]; return `${METRICS[metric].label}: ${fmt(e[metric],METRICS[metric].dec)} ${METRICS[metric].unit} — ${e.tipo}: ${e.detalle}`; }
          }
        }
      },
      scales:{
        x:{ grid:{color:'rgba(231,231,251,.06)'}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:10}} },
        y:{ grace:'12%', grid:{color:'rgba(231,231,251,.06)'}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:10}} }
      }
    },
    plugins:[matchValueLabelPlugin(evs, (v)=>fmt(v, METRICS[metric].dec))]
  };
  if(timelineChart){ timelineChart.destroy(); } // se recrea siempre (no solo .data/.options) para que el plugin de etiquetas de partido no quede pegado a sesiones/métrica viejas
  timelineChart = new Chart(ctx, cfg); requestAnimationFrame(()=>{ if(timelineChart) timelineChart.resize(); });
  document.getElementById('timelinePlayerTag').textContent = player || '—';
}

function buildMetricTabs(){
  const box = document.getElementById('metricTabs');
  box.innerHTML = METRIC_ORDER.map(m=>`<div class="mtab ${m===state.metric?'active':''}" data-m="${m}">${METRICS[m].label}</div>`).join('');
  box.querySelectorAll('.mtab').forEach(el=>{
    el.addEventListener('click',()=>{
      state.metric = el.dataset.m;
      box.querySelectorAll('.mtab').forEach(x=>x.classList.remove('active'));
      el.classList.add('active');
      buildTimeline(state.player, state.metric);
    });
  });
}

function buildLbMetricTabs(){
  const box = document.getElementById('lbMetricTabs');
  if(!box) return;
  box.innerHTML = METRIC_ORDER.map(m=>`<div class="mtab ${m===state.lbMetric?'active':''}" data-m="${m}">${METRICS[m].label}</div>`).join('');
  box.querySelectorAll('.mtab').forEach(el=>{
    el.addEventListener('click',()=>{
      state.lbMetric = el.dataset.m;
      box.querySelectorAll('.mtab').forEach(x=>x.classList.remove('active'));
      el.classList.add('active');
      buildLeaderboard();
    });
  });
}

// ---------- leaderboard (referencia: récord personal en la variable) ----------
const LB_THRESHOLDS = { dist:10000, vel:30, hsr:900 };

function buildLeaderboard(){
  const m = state.lbMetric;
  document.getElementById('lbMetricTag').textContent = `${METRICS[m].label} · orden de mayor a menor · récord personal como tope`;
  const rows = players.map(p=>{
    const evs = byPlayer[p]||[];
    // buscamos la última sesión que SÍ tenga datos de esta métrica (así un día libre recién cargado no tapa todo)
    let last = null;
    for(let i=evs.length-1; i>=0; i--){
      if(evs[i][m]!==null && evs[i][m]!==undefined && !isNaN(evs[i][m])){ last = evs[i]; break; }
    }
    const lastVal = last ? last[m] : null;
    const rec = recordByPlayer[p];
    const recVal = rec && rec[m] ? rec[m].valor : null;
    const hasData = lastVal!==null && lastVal!==undefined && !isNaN(lastVal) && recVal;
    const pct = hasData ? (lastVal/recVal*100) : null;
    const isRecordNow = hasData && last && rec[m].fecha===last.fecha;
    return {p, lastVal, recVal, pct, isRecordNow, lastTipo:last?last.tipo:null};
  }).sort((a,b)=>{
    const av = (a.lastVal===null||a.lastVal===undefined) ? -Infinity : a.lastVal;
    const bv = (b.lastVal===null||b.lastVal===undefined) ? -Infinity : b.lastVal;
    return bv - av;
  });

  // alerta cuando alguien bate su récord personal en la métrica activa
  const breakers = rows.filter(r=>r.isRecordNow);
  const banner = document.getElementById('lbAlertBanner');
  if(banner){
    if(breakers.length){
      const names = breakers.map(r=>r.p.split(' ')[0]).join(', ');
      banner.style.display = 'block';
      banner.innerHTML = tf('recordSuperadoBanner', {m:METRICS[m].label, n:names});
    } else {
      banner.style.display = 'none';
    }
  }

  const threshold = LB_THRESHOLDS[m];
  const box = document.getElementById('leaderboard');
  box.innerHTML = rows.map((r,i)=>{
    const barPct = r.pct===null ? 0 : Math.max(3, Math.min(100, r.pct));
    const overTh = threshold!==undefined && r.lastVal!==null && r.lastVal!==undefined && r.lastVal>threshold;
    const pctLabel = r.pct===null ? t('sinRecordRef') : tf('pctDelRecordTope',{pct:fmt(r.pct,0), v:fmt(r.recVal,METRICS[m].dec)});
    return `
    <div class="lb-row ${r.p===state.player?'active':''}" data-p="${r.p}">
      <div class="rk">${i+1<10?'0':''}${i+1}</div>
      <div class="nm">${r.p}${r.isRecordNow?`<span class="lb-record-tag">${t('recordTag')}</span>`:''}</div>
      <div class="lb-bar-track"><div class="lb-bar-fill ${r.isRecordNow?'is-record':''} ${overTh?'over-th':''}" style="width:${barPct}%"></div></div>
      <div class="num ${overTh?'over-th':''}">${r.lastVal!==null&&r.lastVal!==undefined? fmt(r.lastVal, METRICS[m].dec):'—'}<span class="pct ${r.isRecordNow?'is-record':''}">${pctLabel}</span></div>
    </div>`;
  }).join('');
  box.querySelectorAll('.lb-row').forEach(el=>{
    el.addEventListener('click',()=>selectPlayer(el.dataset.p));
  });
}

// ---------- records table ----------
function buildRecordsTable(){
  const lastDate = [...new Set(categoryFilteredEvents().map(e=>e.fecha))].sort().pop();
  const rows = RECORDS.slice().sort((a,b)=> a.jugador.localeCompare(b.jugador));
  const head = `<tr><th>${t('colJugador')}</th>${METRIC_ORDER.map(m=>`<th>${METRICS[m].label}</th>`).join('')}</tr>`;
  const body = rows.map(r=>{
    return `<tr data-p="${r.jugador}" style="cursor:pointer;">
      <td><b>${r.jugador}</b></td>
      ${METRIC_ORDER.map(m=>{
        const d = r[m];
        if(!d) return `<td class="mono">—</td>`;
        const isNew = d.fecha === lastDate;
        return `<td class="mono">${fmt(d.valor, METRICS[m].dec)}
          <div style="margin-top:3px;">
            <span class="badge ${d.origen==='Partido'?'partido':'entreno'}">${d.detalle||''}</span>
            ${isNew?'<span class="badge new">NUEVO</span>':''}
          </div>
        </td>`;
      }).join('')}
    </tr>`;
  }).join('');
  const table = document.getElementById('recTable');
  table.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  table.querySelectorAll('tbody tr').forEach(el=>{
    el.addEventListener('click',()=>selectPlayer(el.dataset.p));
  });
}
