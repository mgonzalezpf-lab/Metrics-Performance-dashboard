// ---------- Arqueros: tabla admin con sus 7 métricas propias ----------
// ---------- Ranking de arqueros: mismo componente que Ranking del plantel, con sus propias métricas ----------
function buildGkLbMetricTabs(){
  const box = document.getElementById('gkLbMetricTabs');
  if(!box) return;
  box.innerHTML = GK_METRIC_ORDER.map(m=>`<div class="mtab ${m===state.gkLbMetric?'active':''}" data-m="${m}">${GK_METRICS[m].label}</div>`).join('');
  box.querySelectorAll('.mtab').forEach(el=>{
    el.addEventListener('click',()=>{
      state.gkLbMetric = el.dataset.m;
      box.querySelectorAll('.mtab').forEach(x=>x.classList.remove('active'));
      el.classList.add('active');
      buildGkLeaderboard();
    });
  });
}
function buildGkLeaderboard(){
  const box = document.getElementById('gkLeaderboard');
  const tagEl = document.getElementById('gkLbMetricTag');
  if(!box) return;
  const m = state.gkLbMetric;
  if(tagEl) tagEl.textContent = `${GK_METRICS[m].label} · ${t('gkOrdenMayorMenor')}`;
  if(!gkPlayers.length){ box.innerHTML = `<p style="padding:14px 18px;color:var(--mist);font-size:12.5px;">${t('gkSinArqueros')}</p>`; return; }

  const rows = gkPlayers.map(p=>{
    const evs = gkByPlayer[p]||[];
    let last = null;
    for(let i=evs.length-1; i>=0; i--){
      if(evs[i][m]!==null && evs[i][m]!==undefined && !isNaN(evs[i][m])){ last = evs[i]; break; }
    }
    const lastVal = last ? last[m] : null;
    const rec = gkRecordByPlayer[p];
    const recVal = rec && rec[m] ? rec[m].valor : null;
    const hasData = lastVal!==null && lastVal!==undefined && !isNaN(lastVal) && recVal;
    const pct = hasData ? (lastVal/recVal*100) : null;
    const isRecordNow = hasData && last && rec[m].fecha===last.fecha;
    return {p, lastVal, recVal, pct, isRecordNow};
  }).sort((a,b)=>{
    const av = (a.lastVal===null||a.lastVal===undefined) ? -Infinity : a.lastVal;
    const bv = (b.lastVal===null||b.lastVal===undefined) ? -Infinity : b.lastVal;
    return bv - av;
  });

  box.innerHTML = rows.map((r,i)=>{
    const barPct = r.pct===null ? 0 : Math.max(3, Math.min(100, r.pct));
    const pctLabel = r.pct===null ? t('sinRecordRef') : tf('pctDelRecordTope',{pct:fmt(r.pct,0), v:fmt(r.recVal,GK_METRICS[m].dec)});
    return `
    <div class="lb-row" data-p="${r.p}" style="cursor:pointer;">
      <div class="rk">${i+1<10?'0':''}${i+1}</div>
      <div class="nm">${r.p}${r.isRecordNow?`<span class="lb-record-tag">${t('recordTag')}</span>`:''}</div>
      <div class="lb-bar-track"><div class="lb-bar-fill ${r.isRecordNow?'is-record':''}" style="width:${barPct}%"></div></div>
      <div class="num">${r.lastVal!==null&&r.lastVal!==undefined? fmt(r.lastVal, GK_METRICS[m].dec):'—'}<span class="pct ${r.isRecordNow?'is-record':''}">${pctLabel}</span></div>
    </div>`;
  }).join('');
  box.querySelectorAll('.lb-row').forEach(el=>{
    el.addEventListener('click',()=>{
      startPlayerPreview(el.dataset.p);
    });
  });
}

// ---------- ACWR de arqueros: misma lógica y umbrales que jugadores de campo (computeACWR es genérica) ----------
// ---------- Evolución de arqueros (equipo): promedio diario de los 4 arqueros, mismo componente que Evolución del plantel ----------
let gkTeamDailySeries = [];
function computeGkTeamDailySeries(){
  const map = {};
  GK_EVENTS.forEach(e=>{
    if(!map[e.fecha]) map[e.fecha] = { fecha:e.fecha, tipos:new Set(), dist:[], impact_left:[], impact_right:[], impact_total:[], dives_left:[], dives_right:[], pl:[], vel:[], acc:[], dece:[], detalles:{} };
    const rec = map[e.fecha];
    rec.tipos.add(e.tipo);
    GK_METRIC_ORDER.forEach(k=>{
      if(e[k]!==null && e[k]!==undefined && !isNaN(e[k])) rec[k].push(e[k]);
    });
    if(e.detalle){ const key=String(e.detalle).trim(); if(key) rec.detalles[key]=(rec.detalles[key]||0)+1; }
  });
  const avgArr = (arr)=> arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const topDetalle = (detalles)=>{
    const keys = Object.keys(detalles);
    if(!keys.length) return '';
    return keys.reduce((a,b)=> detalles[a]>=detalles[b] ? a : b);
  };
  gkTeamDailySeries = Object.keys(map).sort().map(d=>{
    const rec = map[d];
    const row = { fecha: d, tipo: rec.tipos.size>1 ? 'Mixto' : [...rec.tipos][0], detalle: topDetalle(rec.detalles) };
    GK_METRIC_ORDER.forEach(k=> row[k] = avgArr(rec[k]));
    return row;
  });
}

let gkTeamTimelineChart;
function buildGkTeamMetricTabs(){
  const box = document.getElementById('gkTeamMetricTabs');
  if(!box) return;
  box.innerHTML = GK_METRIC_ORDER.map(k=>`<button class="mtab ${k===state.gkTtMetric?'active':''}" data-m="${k}">${GK_METRICS[k].label}</button>`).join('');
  box.querySelectorAll('.mtab').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.gkTtMetric = el.dataset.m;
      buildGkTeamMetricTabs();
      buildGkTeamTimeline();
    });
  });
}
function buildGkTeamTimeline(resetToLatest){
  if(hayModalDeImportacionAbierto()) return;
  computeGkTeamDailySeries();
  const allEvs = gkTeamDailySeries;
  const maxOffset = Math.max(0, allEvs.length - TIMELINE_WINDOW);
  if(resetToLatest) state.gkTtOffset = maxOffset;
  state.gkTtOffset = Math.min(Math.max(0, state.gkTtOffset||0), maxOffset);

  const prevBtn = document.getElementById('gkTtPrev');
  const nextBtn = document.getElementById('gkTtNext');
  const slider = document.getElementById('gkTtSlider');
  if(slider){
    slider.max = maxOffset; slider.value = state.gkTtOffset;
    slider.oninput = (e)=>{ state.gkTtOffset = Number(e.target.value); buildGkTeamTimeline(); };
  }
  if(prevBtn) prevBtn.onclick = ()=>{ state.gkTtOffset = Math.max(0, state.gkTtOffset - TIMELINE_WINDOW); buildGkTeamTimeline(); };
  if(nextBtn) nextBtn.onclick = ()=>{ state.gkTtOffset = Math.min(maxOffset, state.gkTtOffset + TIMELINE_WINDOW); buildGkTeamTimeline(); };
  if(prevBtn) prevBtn.disabled = state.gkTtOffset<=0;
  if(nextBtn) nextBtn.disabled = state.gkTtOffset>=maxOffset;
  if(slider) slider.disabled = maxOffset<=0;

  const evs = allEvs.slice(state.gkTtOffset, state.gkTtOffset + TIMELINE_WINDOW);
  const label = document.getElementById('gkTtLabel');
  if(label){
    if(!allEvs.length) label.innerHTML = t('sinSesionesCargadas');
    else{
      const from = state.gkTtOffset+1, to = Math.min(allEvs.length, state.gkTtOffset+TIMELINE_WINDOW);
      label.innerHTML = tf('sesionesXaYdeZ',{from,to,total:allEvs.length});
    }
  }
  const tag = document.getElementById('gkTeamTimelineTag');
  if(tag) tag.textContent = `${GK_METRICS[state.gkTtMetric].label} · ${t('gkEvolucionTag')}`;

  const canvas = document.getElementById('gkTeamTimelineChart');
  if(!canvas) return;
  if(typeof Chart === 'undefined'){
    canvas.parentElement.innerHTML = `<div style="color:var(--mist);font-family:'IBM Plex Mono';font-size:12px;padding:20px;text-align:center;">${t('noSePudoChartjs')}</div>`;
    return;
  }
  const m = state.gkTtMetric;
  const labels = evs.map(e=>{
    const dateStr = e.fecha.slice(5).split('-').reverse().join('/');
    const sub = e.detalle ? (e.tipo==='Partido' ? ('vs '+e.detalle) : e.detalle) : '';
    return sub ? [dateStr, sub.length>16 ? sub.slice(0,15)+'…' : sub] : dateStr;
  });
  const data = evs.map(e=>e[m]);
  const pointColors = evs.map(e=> e.tipo==='Partido' ? '#7C5CFC' : e.tipo==='Mixto' ? '#9797C9' : '#22D3EE');
  const pointStyles = evs.map(e=> e.tipo==='Partido' ? 'rectRot' : 'circle');
  const ctx = canvas.getContext('2d');
  const cfg = {
    type:'line',
    data:{ labels, datasets:[{
      label: GK_METRICS[m].label,
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
            label:(ctx)=> ctx.raw===null||ctx.raw===undefined ? t('sinDatosTooltip') : `${GK_METRICS[m].label}: ${fmt(ctx.raw, GK_METRICS[m].dec)}${GK_METRICS[m].unit?(' '+GK_METRICS[m].unit):''}`
          }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:9.5}} },
        y:{ grace:'12%', grid:{color:'rgba(231,231,251,.06)'}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:10}} }
      }
    }
  };
  if(gkTeamTimelineChart){ gkTeamTimelineChart.data = cfg.data; gkTeamTimelineChart.options = cfg.options; gkTeamTimelineChart.update(); }
  else{ gkTeamTimelineChart = new Chart(ctx, cfg); requestAnimationFrame(()=>{ if(gkTeamTimelineChart) gkTeamTimelineChart.resize(); }); }
}

function buildGkACWR(){
  const box = document.getElementById('gkAcwrList');
  if(!box) return;
  if(!gkPlayers.length){ box.innerHTML = `<p style="padding:14px 18px;color:var(--mist);font-size:12.5px;">${t('gkSinArqueros')}</p>`; return; }
  const dates = [...new Set(GK_EVENTS.map(e=>e.fecha))].sort();
  const refDate = dates[dates.length-1];
  const order = {high:0, caution:1, optimal:2, low:3, insuf:4};
  const rows = gkPlayers.map(p=>({p, ...computeACWR(gkByPlayer[p], refDate)}))
    .sort((a,b)=> (order[a.status]-order[b.status]) || ((b.ratio||0)-(a.ratio||0)));
  box.innerHTML = rows.map((r,i)=>{
    const pct = r.ratio!==null ? Math.min(100, r.ratio/2*100) : null;
    return `<div class="acwr-row" data-p="${r.p}" style="cursor:pointer;">
      <div class="rk">${i+1<10?'0':''}${i+1}</div>
      <div class="nm">${r.p}</div>
      <div class="acwr-track">${pct!==null?`<div class="acwr-marker" style="left:${pct}%"></div>`:''}</div>
      <div class="acwr-ratio">${r.ratio!==null? r.ratio.toFixed(2) : '—'}</div>
      <div><span class="acwr-badge" style="background:var(${ACWR_VAR[r.status]});color:#14143A;">${acwrLabel(r.status)}</span></div>
    </div>`;
  }).join('');
  box.querySelectorAll('.acwr-row').forEach(el=>{
    el.addEventListener('click',()=>{
      startPlayerPreview(el.dataset.p);
    });
  });
}

function buildGkTable(){
  const box = document.getElementById('gkTable');
  if(!box) return;
  if(!GK_EVENTS.length){ box.innerHTML = `<p style="padding:14px 18px;color:var(--mist);font-size:12.5px;">${t('gkSinDatos')}</p>`; return; }
  const sorted = [...GK_EVENTS].sort((a,b)=> a.jugador===b.jugador ? a.fecha.localeCompare(b.fecha) : a.jugador.localeCompare(b.jugador));
  const rows = sorted.map(e=>{
    const dateStr = e.fecha.split('-').reverse().join('/');
    const rowClass = e.tipo==='Partido' ? 'mc-match' : '';
    return `<tr class="${rowClass}">
      <td>${e.jugador}</td>
      <td class="mono">${dateStr}</td>
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
  box.innerHTML = `<table class="mc-table">
    <thead><tr><th>${t('gkColJugador')}</th><th>${t('gkColFecha')}</th><th>${t('gkColSesion')}</th><th>${t('gkColDist')}</th><th>${GK_METRICS.impact_left.label}</th><th>${GK_METRICS.impact_right.label}</th><th>${GK_METRICS.dives_left.label}</th><th>${GK_METRICS.dives_right.label}</th><th>PL</th><th>${t('gkColVelMax')}</th><th>${GK_METRICS.acc.label}</th><th>${GK_METRICS.dece.label}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
