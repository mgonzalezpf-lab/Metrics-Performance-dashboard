// ---------- Vista individual del arquero: mismo lenguaje visual que jugadores de campo, otras métricas ----------
function drawGkRadar(player){
  const svg = document.getElementById('gkRadarSvg');
  if(!svg) return;
  const cx=170, cy=175, R=118;
  const n = GK_METRIC_ORDER.length;
  let parts = [];

  [0.25,0.5,0.75,1].forEach(f=>{
    const pts = polygonPoints(Array(n).fill(f), cx,cy,R);
    parts.push(`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="rgba(231,231,251,.14)" stroke-width="1"/>`);
  });
  GK_METRIC_ORDER.forEach((m,i)=>{
    const angle = -Math.PI/2 + i*(2*Math.PI/n);
    const x2 = cx + R*Math.cos(angle), y2 = cy + R*Math.sin(angle);
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="rgba(231,231,251,.10)" stroke-width="1"/>`);
    const lx = cx + (R+26)*Math.cos(angle), ly = cy + (R+26)*Math.sin(angle);
    parts.push(`<text x="${lx}" y="${ly}" fill="#9797C9" font-size="10.5" font-family="IBM Plex Mono" text-anchor="middle" dominant-baseline="middle">${GK_METRICS[m].label.toUpperCase()}</text>`);
  });

  const pAvg = gkPlayerAvg[player] || {};
  const normPlayer = GK_METRIC_ORDER.map(m=> gkSquadMax[m]? Math.min(1,(pAvg[m]||0)/gkSquadMax[m]) : 0);
  const normSquad = GK_METRIC_ORDER.map(m=> gkSquadMax[m]? (gkSquadAvg[m]||0)/gkSquadMax[m] : 0);

  const squadPts = polygonPoints(normSquad,cx,cy,R);
  parts.push(`<polygon points="${squadPts.map(p=>p.join(',')).join(' ')}" fill="rgba(151,151,201,.08)" stroke="#9797C9" stroke-width="1.4" stroke-dasharray="4,3"/>`);

  const playerPts = polygonPoints(normPlayer,cx,cy,R);
  parts.push(`<polygon points="${playerPts.map(p=>p.join(',')).join(' ')}" fill="rgba(34,211,238,.22)" stroke="#22D3EE" stroke-width="2"/>`);
  playerPts.forEach(p=>{ parts.push(`<circle cx="${p[0]}" cy="${p[1]}" r="3.4" fill="#67E8F9"/>`); });

  const rec = gkRecordByPlayer[player];
  if(rec){
    const normRec = GK_METRIC_ORDER.map(m=> gkSquadMax[m]? Math.min(1,(rec[m]?.valor||0)/gkSquadMax[m]) : 0);
    const recPts = polygonPoints(normRec,cx,cy,R);
    recPts.forEach(p=>{ parts.push(`<rect x="${p[0]-3}" y="${p[1]-3}" width="6" height="6" fill="#FB923C" transform="rotate(45 ${p[0]} ${p[1]})"/>`); });
    GK_METRIC_ORDER.forEach((m,i)=>{
      const rv = rec[m] ? rec[m].valor : null;
      if(rv===null || rv===undefined) return;
      const angle = -Math.PI/2 + i*(2*Math.PI/n);
      const p = recPts[i];
      const labelR = Math.hypot(p[0]-cx, p[1]-cy) + 13;
      const lx = cx + labelR*Math.cos(angle), ly = cy + labelR*Math.sin(angle);
      const unit = GK_METRICS[m].unit;
      const text = `${fmt(rv, GK_METRICS[m].dec)}${unit?(' '+unit):''}`;
      parts.push(`<text x="${lx}" y="${ly}" fill="#FDBA74" font-size="9.5" font-weight="700" font-family="IBM Plex Mono" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#14143A" stroke-width="3">${text}</text>`);
    });
  }

  parts.push(`<circle cx="${cx}" cy="${cy}" r="2" fill="#E7E7FB"/>`);
  svg.innerHTML = parts.join('');

  const side = document.getElementById('gkRadarSide');
  if(side){
    side.innerHTML = `
      <div class="rs-item gold"><div class="k">${t('gkPromedioUlt5')}</div><div class="v">${fmt(Math.round(pAvg.dist||0))}<span>m dist.</span></div></div>
      <div class="rs-item gold"><div class="k">${t('playerLoadProm')}</div><div class="v">${fmt(Math.round(pAvg.pl||0))}</div></div>
      <div class="rs-item mist"><div class="k">${t('gkPromedioArqueros')}</div><div class="v">${fmt(Math.round(gkSquadAvg.dist||0))}<span>m dist.</span></div></div>
    `;
  }
}

let gkTimelineChart;
function clampGkTlOffset(total){
  const maxOffset = Math.max(0, total - TIMELINE_WINDOW);
  state.gkTlOffset = Math.min(Math.max(0, state.gkTlOffset), maxOffset);
  return maxOffset;
}
function buildGkTimeline(player, metric, resetToLatest){
  if(hayModalDeImportacionAbierto()) return;
  const allEvs = gkByPlayer[player]||[];
  const maxOffset = Math.max(0, allEvs.length - TIMELINE_WINDOW);
  if(resetToLatest) state.gkTlOffset = maxOffset;
  clampGkTlOffset(allEvs.length);

  const prevBtn = document.getElementById('gkTlPrev');
  const nextBtn = document.getElementById('gkTlNext');
  const slider = document.getElementById('gkTlSlider');
  if(slider){
    slider.max = maxOffset;
    slider.value = state.gkTlOffset;
    slider.oninput = (e)=>{ state.gkTlOffset = Number(e.target.value); buildGkTimeline(player, state.gkMetric); };
  }
  if(prevBtn) prevBtn.onclick = ()=>{ state.gkTlOffset = Math.max(0, state.gkTlOffset - TIMELINE_WINDOW); buildGkTimeline(player, state.gkMetric); };
  if(nextBtn) nextBtn.onclick = ()=>{ state.gkTlOffset = Math.min(maxOffset, state.gkTlOffset + TIMELINE_WINDOW); buildGkTimeline(player, state.gkMetric); };
  if(prevBtn) prevBtn.disabled = state.gkTlOffset<=0;
  if(nextBtn) nextBtn.disabled = state.gkTlOffset>=maxOffset;
  if(slider) slider.disabled = maxOffset<=0;

  const evs = allEvs.slice(state.gkTlOffset, state.gkTlOffset + TIMELINE_WINDOW);
  const tlLabelEl = document.getElementById('gkTlLabel');
  if(tlLabelEl){
    if(!allEvs.length){ tlLabelEl.innerHTML = t('sinSesionesCargadas'); }
    else{
      const from = state.gkTlOffset+1, to = Math.min(allEvs.length, state.gkTlOffset+TIMELINE_WINDOW);
      tlLabelEl.innerHTML = tf('sesionesXaYdeZ',{from,to,total:allEvs.length});
    }
  }

  const tag = document.getElementById('gkTimelinePlayerTag');
  if(tag) tag.textContent = player;

  if(typeof Chart === 'undefined'){
    const box = document.getElementById('gkTimelineChart')?.closest('.chart-box');
    if(box) box.innerHTML = `<div style="color:var(--mist);font-family:'IBM Plex Mono';font-size:12px;padding:20px;text-align:center;">${t('noSePudoChartjs')}</div>`;
    return;
  }
  const canvas = document.getElementById('gkTimelineChart');
  if(!canvas) return;
  const labels = evs.map(e=>{
    const dateStr = e.fecha.slice(5).split('-').reverse().join('/');
    const sub = e.detalle ? (e.tipo==='Partido' ? ('vs '+e.detalle) : e.detalle) : '';
    return sub ? [dateStr, sub.length>16 ? sub.slice(0,15)+'…' : sub] : dateStr;
  });
  const data = evs.map(e=> isRestDayEvent(e) ? 0 : e[metric]);
  const pointColors = evs.map(e=> e.tipo==='Partido' ? '#7C5CFC' : '#22D3EE');
  const pointStyles = evs.map(e=> e.tipo==='Partido' ? 'rectRot' : 'circle');
  const ctx = canvas.getContext('2d');
  const cfg = {
    type:'line',
    data:{ labels, datasets:[{
      label: GK_METRICS[metric].label,
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
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#1E1E58', borderColor:'#22D3EE', borderWidth:1, titleColor:'#67E8F9', bodyColor:'#E7E7FB',
          callbacks:{
            label:(ctx)=>{ const e = evs[ctx.dataIndex]; return `${GK_METRICS[metric].label}: ${fmt(e[metric],GK_METRICS[metric].dec)} ${GK_METRICS[metric].unit} — ${e.tipo}: ${e.detalle}`; }
          }
        }
      },
      scales:{
        x:{ grid:{color:'rgba(231,231,251,.06)'}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:10}} },
        y:{ grace:'12%', grid:{color:'rgba(231,231,251,.06)'}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:10}} }
      }
    }
  };
  if(gkTimelineChart){ gkTimelineChart.data = cfg.data; gkTimelineChart.options = cfg.options; gkTimelineChart.update(); }
  else{ gkTimelineChart = new Chart(ctx, cfg); requestAnimationFrame(()=>{ if(gkTimelineChart) gkTimelineChart.resize(); }); }
}

function buildGkMetricTabs(player){
  const box = document.getElementById('gkMetricTabs');
  if(!box) return;
  box.innerHTML = GK_METRIC_ORDER.map(m=>`<div class="mtab ${m===state.gkMetric?'active':''}" data-m="${m}">${GK_METRICS[m].label}</div>`).join('');
  box.querySelectorAll('.mtab').forEach(el=>{
    el.addEventListener('click',()=>{
      state.gkMetric = el.dataset.m;
      box.querySelectorAll('.mtab').forEach(x=>x.classList.remove('active'));
      el.classList.add('active');
      buildGkTimeline(player, state.gkMetric);
    });
  });
}

function buildGkPlayerView(playerName){
  const kpiBox = document.getElementById('gkKpiStrip');
  const tableBox = document.getElementById('gkPlayerTable');
  const radarTitle = document.getElementById('gkRadarTitle');
  if(!kpiBox || !tableBox) return;
  if(radarTitle) radarTitle.textContent = `${t('gkRadarVuelo')} · ${playerName}`;
  drawGkRadar(playerName);
  buildGkMetricTabs(playerName);
  buildGkTimeline(playerName, state.gkMetric, true);
  const mySessions = GK_EVENTS.filter(e=>normalizeNameKey(e.jugador)===normalizeNameKey(playerName)).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  if(!mySessions.length){
    kpiBox.innerHTML = '';
    tableBox.innerHTML = `<p style="padding:14px 18px;color:var(--mist);font-size:12.5px;">${t('gkSinSesiones')}</p>`;
    return;
  }
  const last = [...mySessions].reverse().find(e=>e.dist!==null && e.dist!==undefined && !isNaN(e.dist)) || mySessions[mySessions.length-1];
  const kpis = [
    {lbl:t('gkDistUltimaSesion'), val:last.dist!==null?fmt(Math.round(last.dist)):'—', unit:'m'},
    {lbl:GK_METRICS.impact_left.label, val:last.impact_left!==null?fmt(last.impact_left):'—', unit:''},
    {lbl:GK_METRICS.impact_right.label, val:last.impact_right!==null?fmt(last.impact_right):'—', unit:''},
    {lbl:GK_METRICS.dives_left.label, val:last.dives_left!==null?fmt(last.dives_left):'—', unit:''},
    {lbl:GK_METRICS.dives_right.label, val:last.dives_right!==null?fmt(last.dives_right):'—', unit:''},
    {lbl:GK_METRICS.pl.label, val:last.pl!==null?fmt(Math.round(last.pl)):'—', unit:''},
    {lbl:GK_METRICS.vel.label, val:last.vel!==null?last.vel.toFixed(1):'—', unit:'km/h'},
    {lbl:GK_METRICS.acc.label, val:last.acc!==null?fmt(last.acc):'—', unit:''},
    {lbl:GK_METRICS.dece.label, val:last.dece!==null?fmt(last.dece):'—', unit:''},
  ];
  kpiBox.innerHTML = kpis.map(k=>`
    <div class="kpi">
      <div class="lbl">${k.lbl}</div>
      <div class="val">${k.val}${k.unit?`<small>${k.unit}</small>`:''}</div>
      <div class="sub">${last.fecha.split('-').reverse().join('/')} · ${last.detalle||last.tipo}</div>
    </div>`).join('');

  const rows = [...mySessions].map(e=>{
    const rowClass = e.tipo==='Partido' ? 'mc-match' : '';
    return `<tr class="${rowClass}">
      <td class="mono">${e.fecha.split('-').reverse().join('/')}</td>
      <td>${e.detalle||e.tipo}</td>
      <td class="mono">${e.dist!==null?fmt(Math.round(e.dist)):'—'}</td>
      <td class="mono">${e.impact_left!==null?fmt(e.impact_left):'—'}</td>
      <td class="mono">${e.impact_right!==null?fmt(e.impact_right):'—'}</td>
      <td class="mono">${e.dives_left!==null?fmt(e.dives_left):'—'}</td>
      <td class="mono">${e.dives_right!==null?fmt(e.dives_right):'—'}</td>
      <td class="mono">${e.pl!==null?fmt(Math.round(e.pl)):'—'}</td>
      <td class="mono">${e.vel!==null?e.vel.toFixed(1):'—'}</td>
      <td class="mono">${e.acc!==null?e.acc:'—'}</td>
      <td class="mono">${e.dece!==null?e.dece:'—'}</td>
    </tr>`;
  }).join('');
  tableBox.innerHTML = `<table class="mc-table">
    <thead><tr><th>${t('gkColFecha')}</th><th>${t('gkColSesion')}</th><th>${t('gkColDist')}</th><th>${GK_METRICS.impact_left.label}</th><th>${GK_METRICS.impact_right.label}</th><th>${GK_METRICS.dives_left.label}</th><th>${GK_METRICS.dives_right.label}</th><th>PL</th><th>${t('gkColVelMax2')}</th><th>${GK_METRICS.acc.label}</th><th>${GK_METRICS.dece.label}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
