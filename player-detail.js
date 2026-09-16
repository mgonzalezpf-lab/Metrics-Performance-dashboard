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

// ---------- Sesiones del jugador: log partido a partido / entreno a entreno de UN jugador puntual,
// con sus métricas de GPS + RPE/minutos juntas — a diferencia del Microciclo (que promedia todo el
// plantel), esto es la bitácora individual completa, con selector de qué tipo de sesión incluir. ----------
function buildSessionLogFilterTabs(){
  const box = document.getElementById('sessionLogFilterTabs');
  if(!box) return;
  const opts = [
    {key:'todo', label:t('sessionLogTodo')},
    {key:'partidos', label:t('sessionLogSoloPartidos')},
    {key:'entrenos', label:t('sessionLogSoloEntrenos')},
  ];
  box.innerHTML = opts.map(o=>`<button class="mtab ${(state.sessionLogFilter||'todo')===o.key?'active':''}" data-f="${o.key}">${o.label}</button>`).join('');
  box.querySelectorAll('.mtab').forEach(btn=>{
    btn.onclick = ()=>{ state.sessionLogFilter = btn.dataset.f; buildPlayerSessionLog(); };
  });
}
// Corta el nombre de la sesión (rival del partido, o tipo de entreno) para que entre en la columna —
// el nombre completo queda igual en el atributo title, para verlo entero al pasar el mouse.
function abbrevDetalle(txt, max=16){
  const s = String(txt||'').trim();
  if(!s) return '—';
  return s.length>max ? s.slice(0,max-1)+'…' : s;
}
function getPlayerSessionRows(){
  if(!state.player) return [];
  const filter = state.sessionLogFilter || 'todo';
  let evs = categoryFilteredEvents().filter(e=> normalizeNameKey(e.jugador)===normalizeNameKey(state.player));
  if(filter==='partidos') evs = evs.filter(e=> e.tipo==='Partido');
  else if(filter==='entrenos') evs = evs.filter(e=> e.tipo!=='Partido');
  return [...evs].sort((a,b)=> a.fecha.localeCompare(b.fecha)); // del más antiguo al más nuevo, como el Microciclo
}
function buildPlayerSessionLog(){
  buildSessionLogFilterTabs();
  const table = document.getElementById('sessionLogTable');
  const tag = document.getElementById('sessionLogCountTag');
  const playerTag = document.getElementById('sessionLogPlayerTag');
  const reportBtn = document.getElementById('sessionLogReportBtn');
  if(reportBtn) reportBtn.onclick = generatePlayerSessionsPDF;
  if(playerTag) playerTag.textContent = state.player ? `· ${state.player}` : '';
  if(!table || !state.player) return;
  const evs = getPlayerSessionRows();
  if(tag) tag.textContent = tf('sessionLogCantidad', {n: evs.length});
  if(!evs.length){
    table.innerHTML = `<tbody><tr><td style="padding:16px;color:var(--mist);">${t('sessionLogSinSesiones')}</td></tr></tbody>`;
    return;
  }
  const esAdminOOwner = myProfile && (myProfile.role==='admin' || myProfile.role==='owner');
  const head = `<tr>
    <th>${t('colFecha')}</th><th>${t('colTipo')}</th>
    <th>${METRICS.dist.label}</th><th>${METRICS.hsr.label}</th><th>${METRICS.vel.label}</th>
    <th>${METRICS.sprint.label}</th><th>${METRICS.sprint_count.label}</th>
    <th>${METRICS.acc.label}</th><th>${METRICS.desa.label}</th>
    <th>${METRICS.pl.label}</th>${esAdminOOwner?'<th></th>':''}
  </tr>`;
  // Badge de % al lado de cada valor, comparando contra la sesión anterior en esta misma lista (respeta
  // el filtro activo: en "Solo partidos" compara contra el partido anterior; en "Todo", contra la sesión
  // anterior sea cual sea). Solo para la tabla en pantalla — el PDF se mantiene limpio, sin esto.
  const pctBadge = (curr, prev)=>{
    if(prev===null || prev===undefined || prev===0 || curr===null || curr===undefined) return '';
    const pct = (curr-prev)/prev*100;
    const color = pct>0 ? 'var(--good)' : pct<0 ? 'var(--bad)' : 'var(--mist)';
    return ` <span style="color:${color};font-size:10.5px;font-weight:600;">${pct>=0?'+':''}${fmt(pct,1)}%</span>`;
  };
  const body = evs.map((e,i)=>{
    const esPartido = e.tipo==='Partido';
    const prev = i>0 ? evs[i-1] : null;
    return `<tr class="${esPartido?'session-row-match':''}">
      <td>${e.fecha.split('-').reverse().join('/')}<br><span class="session-detalle" title="${String(e.detalle||'').replace(/"/g,'')}">${abbrevDetalle(e.detalle)}</span></td>
      <td><span class="badge ${esPartido?'partido':'entreno'}">${esPartido?t('tipoPartido'):t('tipoEntreno')}</span></td>
      <td class="mono">${fmt(e.dist, METRICS.dist.dec)}${prev?pctBadge(e.dist, prev.dist):''}</td>
      <td class="mono">${fmt(e.hsr, METRICS.hsr.dec)}${prev?pctBadge(e.hsr, prev.hsr):''}</td>
      <td class="mono">${fmt(e.vel, METRICS.vel.dec)}${prev?pctBadge(e.vel, prev.vel):''}</td>
      <td class="mono">${fmt(e.sprint, METRICS.sprint.dec)}${prev?pctBadge(e.sprint, prev.sprint):''}</td>
      <td class="mono">${fmt(e.sprint_count, METRICS.sprint_count.dec)}${prev?pctBadge(e.sprint_count, prev.sprint_count):''}</td>
      <td class="mono">${fmt(e.acc, METRICS.acc.dec)}${prev?pctBadge(e.acc, prev.acc):''}</td>
      <td class="mono">${fmt(e.desa, METRICS.desa.dec)}${prev?pctBadge(e.desa, prev.desa):''}</td>
      <td class="mono">${fmt(e.pl, METRICS.pl.dec)}${prev?pctBadge(e.pl, prev.pl):''}</td>${esAdminOOwner?`<td><button type="button" class="session-delete-btn" data-idx="${i}" title="${t('eliminarSesion')}">🗑</button></td>`:''}</tr>`;
  }).join('');
  table.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  if(esAdminOOwner){
    table.querySelectorAll('.session-delete-btn').forEach(btn=>{
      btn.onclick = async ()=>{
        const evento = evs[Number(btn.dataset.idx)];
        if(!evento) return;
        const detalleTxt = `${evento.fecha.split('-').reverse().join('/')} · ${abbrevDetalle(evento.detalle,30)}`;
        if(!confirm(tf('confirmarEliminarSesion', {d: detalleTxt}))) return;
        btn.disabled = true;
        try{
          // Se borra por REFERENCIA exacta al objeto (no por fecha/tipo), justo para el caso de dos
          // sesiones idénticas en fecha y nombre pero con valores distintos — así se elimina solo la fila
          // que se tocó, nunca la otra por error.
          const eventosFinales = ACTIVE_EVENTS.filter(e=> e!==evento);
          await saveRemoteData(eventosFinales, ACTIVE_TEAMTOTALS);
          ACTIVE_EVENTS = eventosFinales;
          deriveAll(ACTIVE_EVENTS);
          renderAll(state.player);
        }catch(err){
          console.error('Error eliminando la sesión:', err);
          alert(tf('noSePudoGuardar',{e:err.message}));
          btn.disabled = false;
        }
      };
    });
  }
}

// Informe en PDF de las sesiones del jugador — misma identidad visual que el informe de partido, pero en
// formato horizontal (apaisado) porque acá el contenido central es una tabla ancha, no texto corrido.
function generatePlayerSessionsPDF(){
  if(typeof window.jspdf === 'undefined'){ alert(t('noSePudoPdf')); return; }
  if(!state.player) return;
  const evs = getPlayerSessionRows();
  if(!evs.length){ alert(t('sessionLogSinSesiones')); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4', orientation:'landscape'});
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let y = 18;
  const ensureSpace = (needed)=>{ if(y + needed > 195){ doc.addPage(); addBrandLogoTopRight(doc, pageW, marginX); y = 18; } };

  // ---- encabezado ----
  addBrandLogoTopRight(doc, pageW, marginX);
  doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(18,33,59);
  doc.text(`${CURRENT_CLUB} — ${t('informeSesionesJugador')}`, marginX, y);
  y += 7;
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(90,90,90);
  const filterLabel = {todo:t('sessionLogTodo'), partidos:t('sessionLogSoloPartidos'), entrenos:t('sessionLogSoloEntrenos')}[state.sessionLogFilter||'todo'];
  const rango = `${evs[0].fecha.split('-').reverse().join('/')} – ${evs[evs.length-1].fecha.split('-').reverse().join('/')}`;
  doc.text(`${state.player} · ${filterLabel} · ${tf('sessionLogCantidad',{n:evs.length})} · ${rango}`, marginX, y);
  y += 8;
  doc.setDrawColor(220,220,220); doc.line(marginX, y, pageW-marginX, y);
  y += 8;

  // ---- estadísticas de base para el resumen, las tarjetas y los insights ----
  const nPartidos = evs.filter(e=>e.tipo==='Partido').length;
  const nEntrenos = evs.length - nPartidos;
  const avgOf = (key)=>{ const vals = evs.map(e=>e[key]).filter(v=>v!==null && v!==undefined && !isNaN(v)); return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null; };
  const avgDist = avgOf('dist'), avgHsr = avgOf('hsr'), avgPl = avgOf('pl');
  const plTrend = evs.length>=3 ? computeLinearTrend(evs.map(e=>e.pl).filter(v=>v!==null && v!==undefined)) : null;
  const hsrTrend = evs.length>=3 ? computeLinearTrend(evs.map(e=>e.hsr).filter(v=>v!==null && v!==undefined)) : null;
  // z-score de cada sesión contra el propio promedio de ESTE período — para detectar picos que se destacan
  // dentro de la ventana que se está mirando, no contra el historial completo del jugador.
  const outlierKeys = ['dist','hsr','sprint','pl'];
  const statsByKey = {};
  outlierKeys.forEach(k=>{
    const vals = evs.map(e=>e[k]).filter(v=>v!==null && v!==undefined && !isNaN(v));
    const mean = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    statsByKey[k] = { mean, sd: vals.length>=2 ? computeStdev(vals, mean) : null };
  });
  const outliers = [];
  if(evs.length>=4){
    evs.forEach(e=>{
      outlierKeys.forEach(k=>{
        const {mean, sd} = statsByKey[k];
        const z = computeZScore(e[k], mean, sd);
        if(z!==null && z>=2) outliers.push({e, k, z});
      });
    });
  }
  const usedRefs = new Set();

  // ---- récords del período: el valor más alto alcanzado por el jugador DENTRO de las sesiones que se
  // están mostrando (respeta el filtro activo), no el récord histórico de toda su carrera — para que el
  // informe hable siempre del mismo recorte de datos que el resto del PDF. ----
  const findRecord = (key)=>{
    let best = null;
    evs.forEach(e=>{ if(e[key]!==null && e[key]!==undefined && (best===null || e[key]>best.val)) best = {val:e[key], e}; });
    return best;
  };
  const recDist = findRecord('dist'), recHsr = findRecord('hsr'), recSprintCount = findRecord('sprint_count'), recVel = findRecord('vel'), recAcc = findRecord('acc'), recDesa = findRecord('desa');
  ensureSpace(36);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informeRecordsPeriodo'), marginX, y);
  y += 5;
  const recCards = [
    {label:METRICS.dist.label, val: recDist?`${fmt(Math.round(recDist.val))} m`:'—', fecha: recDist?recDist.e.fecha:null, det: recDist?recDist.e.detalle:null},
    {label:METRICS.hsr.label, val: recHsr?`${fmt(Math.round(recHsr.val))} m`:'—', fecha: recHsr?recHsr.e.fecha:null, det: recHsr?recHsr.e.detalle:null},
    {label:METRICS.sprint_count.label, val: recSprintCount?fmt(recSprintCount.val):'—', fecha: recSprintCount?recSprintCount.e.fecha:null, det: recSprintCount?recSprintCount.e.detalle:null},
    {label:METRICS.vel.label, val: recVel?`${fmt(recVel.val,1)} km/h`:'—', fecha: recVel?recVel.e.fecha:null, det: recVel?recVel.e.detalle:null},
    {label:`${METRICS.acc.label} / ${METRICS.desa.label}`,
      val: `${recAcc?fmt(recAcc.val):'—'} / ${recDesa?fmt(recDesa.val):'—'}`,
      // Acc y Desa pueden haber marcado su pico en partidos distintos — solo se muestra fecha/detalle si
      // coincide en ambos; si no, mejor no mostrar nada que sugerir un partido equivocado para el otro.
      fecha: (recAcc && recDesa && recAcc.e.fecha===recDesa.e.fecha) ? recAcc.e.fecha : null,
      det: (recAcc && recDesa && recAcc.e.fecha===recDesa.e.fecha) ? recAcc.e.detalle : null},
  ];
  // Dorado/trofeo — a propósito bien distinto de los tonos navy/violeta/teal de más abajo, para que estas
  // 5 tarjetas de RÉCORD salten a la vista de inmediato como lo más destacado del informe, no se pierdan
  // entre el resto del contenido.
  const recBoxW = (pageW - marginX*2 - 4*4)/5, recBoxH = 26;
  recCards.forEach((c,i)=>{
    const x = marginX + i*(recBoxW+4);
    doc.setFillColor(151,128,74);
    doc.roundedRect(x, y, recBoxW, recBoxH, 2, 2, 'F');
    doc.setDrawColor(198,180,140); doc.setLineWidth(.5);
    doc.roundedRect(x, y, recBoxW, recBoxH, 2, 2, 'D');
    // Orden de lectura: nombre de la métrica (chico, arriba) → número (grande, lo primero que se destaca)
    // → sesión/rival (blanco, se lee fuerte) → fecha al final (chica, mismo color que el nombre de la
    // métrica — es el dato de referencia, no el protagonista de la tarjeta).
    doc.setFont('helvetica','normal'); doc.setFontSize(6.4); doc.setTextColor(232,221,196);
    doc.text(c.label.toUpperCase(), x+recBoxW/2, y+5, {align:'center'});
    doc.setTextColor(18,33,59);
    doc.setFont('helvetica','bold'); doc.setFontSize(13.5);
    doc.text(c.val, x+recBoxW/2, y+13.5, {align:'center'});
    if(c.fecha){
      if(c.det){
        doc.setFont('helvetica','bold'); doc.setFontSize(7.4); doc.setTextColor(255,255,255);
        doc.text(abbrevDetalle(c.det, 20), x+recBoxW/2, y+18.7, {align:'center'});
      }
      doc.setFont('helvetica','normal'); doc.setFontSize(5.6); doc.setTextColor(232,221,196);
      doc.text(c.fecha.split('-').reverse().join('/'), x+recBoxW/2, y+23.4, {align:'center'});
    }
  });
  y += recBoxH + 8;

  // ---- tarjetas de resumen (mismo lenguaje visual que las cajas de "alta intensidad" del informe de partido) ----
  ensureSpace(34);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informePromediosPeriodo'), marginX, y);
  y += 5;
  const kpis = [
    {label:t('informeKpiDistProm'), val: avgDist!==null?`${fmt(Math.round(avgDist))} m`:'—'},
    {label:t('informeKpiPlProm'), val: avgPl!==null?fmt(Math.round(avgPl)):'—'},
    {label:t('informeKpiTendenciaPl'), val: plTrend && plTrend.slopePct!==null
      ? (plTrend.slopePct>=3 ? t('tendenciaAscendente') : plTrend.slopePct<=-3 ? t('tendenciaDescendente') : t('tendenciaEstable'))
      : '—'},
  ];
  const boxColors = [[18,33,59],[76,29,149],[15,90,90]];
  const boxW = (pageW - marginX*2 - 8)/3, boxH = 22;
  kpis.forEach((k,i)=>{
    const x = marginX + i*(boxW+4);
    const [r,g,b] = boxColors[i];
    doc.setFillColor(r,g,b); doc.roundedRect(x, y, boxW, boxH, 2, 2, 'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text(k.val, x+boxW/2, y+11, {align:'center'});
    doc.setFont('helvetica','normal'); doc.setFontSize(7);
    doc.text(k.label.toUpperCase(), x+boxW/2, y+17, {align:'center'});
  });
  y += boxH + 8;

  // ---- resumen narrativo del período: caja con tinte de color para que no quede como texto plano
  // sobre blanco — mismo tono navy de la marca, pero bien suave para no competir con las tarjetas ----
  const partes = [];
  partes.push(tf('sesionesResumenIntro', {p:state.player, nP:nPartidos, nE:nEntrenos, d1:evs[0].fecha.split('-').reverse().join('/'), d2:evs[evs.length-1].fecha.split('-').reverse().join('/')}));
  if(avgDist!==null && avgPl!==null) partes.push(tf('sesionesResumenPromedios', {d:fmt(Math.round(avgDist)), pl:fmt(Math.round(avgPl))}));
  if(plTrend && plTrend.slopePct!==null && Math.abs(plTrend.slopePct)>=3){
    partes.push(tf('sesionesResumenTendencia', {dir:(plTrend.slopePct>=0?t('tendenciaAscendente'):t('tendenciaDescendente')).toLowerCase(), pct:`${plTrend.slopePct>=0?'+':''}${plTrend.slopePct.toFixed(1)}%`}));
    usedRefs.add('2');
  }
  if(outliers.length){
    const top = outliers.sort((a,b)=>b.z-a.z)[0];
    const mLabel = METRICS[top.k].label;
    partes.push(tf('sesionesResumenPico', {f:top.e.fecha.split('-').reverse().join('/'), det:abbrevDetalle(top.e.detalle,24), m:mLabel, z:`${top.z>=0?'+':''}${top.z.toFixed(1)}`}));
    usedRefs.add('8');
  }
  doc.setFont('helvetica','normal'); doc.setFontSize(9.3);
  const resumenLines = doc.splitTextToSize(partes.join(' '), pageW-marginX*2-10);
  const resumenBoxH = 9 + resumenLines.length*4.4 + 5;
  ensureSpace(resumenBoxH + 4);
  doc.setDrawColor(210,218,232); doc.setFillColor(237,241,248);
  doc.roundedRect(marginX, y, pageW-marginX*2, resumenBoxH, 2, 2, 'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('sesionesResumenIntroTitulo'), marginX+5, y+7);
  doc.setFont('helvetica','normal'); doc.setFontSize(9.3); doc.setTextColor(60,60,60);
  doc.text(resumenLines, marginX+5, y+13);
  y += resumenBoxH + 8;

  // ---- tabla ----
  const cols = [
    {label:t('colFecha'), w:30},
    {label:METRICS.dist.label, w:24, key:'dist', dec:METRICS.dist.dec},
    {label:METRICS.hsr.label, w:22, key:'hsr', dec:METRICS.hsr.dec},
    {label:METRICS.vel.label, w:22, key:'vel', dec:METRICS.vel.dec},
    {label:METRICS.sprint.label, w:28, key:'sprint', dec:METRICS.sprint.dec},
    {label:METRICS.sprint_count.label, w:26, key:'sprint_count', dec:METRICS.sprint_count.dec},
    {label:METRICS.acc.label, w:20, key:'acc', dec:METRICS.acc.dec},
    {label:METRICS.desa.label, w:20, key:'desa', dec:METRICS.desa.dec},
    {label:METRICS.pl.label, w:24, key:'pl', dec:METRICS.pl.dec},
  ];
  const tableW = cols.reduce((a,c)=>a+c.w,0);
  const rowH = 8;
  const drawHeader = ()=>{
    doc.setFillColor(18,33,59); doc.rect(marginX, y, tableW, rowH, 'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(7.6);
    let x = marginX;
    cols.forEach(c=>{ doc.text(c.label, x+2, y+5.4); x += c.w; });
    y += rowH;
  };
  ensureSpace(rowH*2);
  drawHeader();
  evs.forEach((e,i)=>{
    ensureSpace(rowH*2);
    if(y===18) drawHeader(); // se repite el encabezado si saltó de página recién
    const esPartido = e.tipo==='Partido';
    // Fila de partido resaltada en violeta/lila — mismo criterio que la tabla en pantalla, para que el
    // ojo distinga de un vistazo los días de partido entre todos los entrenos cuando se ve "Todo" junto.
    if(esPartido) doc.setFillColor(237,231,250);
    else if(i%2===1) doc.setFillColor(244,245,250);
    else doc.setFillColor(255,255,255);
    doc.rect(marginX, y, tableW, rowH, 'F');
    let x = marginX;
    doc.setFont('helvetica','bold'); doc.setFontSize(7.4); doc.setTextColor(30,30,30);
    doc.text(e.fecha.split('-').reverse().join('/'), x+2, y+3.6);
    doc.setFont('helvetica','normal'); doc.setFontSize(6.3); doc.setTextColor(esPartido?108:120, esPartido?52:120, esPartido?131:120);
    doc.text(abbrevDetalle(e.detalle, 20), x+2, y+6.8);
    x += cols[0].w;
    doc.setFont('helvetica','normal'); doc.setFontSize(7.6); doc.setTextColor(40,40,40);
    cols.slice(1).forEach(c=>{
      doc.text(fmt(e[c.key], c.dec), x+2, y+5.4);
      x += c.w;
    });
    y += rowH;
  });
  y += 8;

  // ---- puntos a tener en cuenta ----
  const insights = [];
  if(plTrend && plTrend.slopePct!==null && plTrend.slopePct>=5){
    insights.push(tf('sesionesInsightTendenciaPlAlza', {pct:`+${plTrend.slopePct.toFixed(1)}%`}));
    usedRefs.add('2');
  } else if(plTrend && plTrend.slopePct!==null && plTrend.slopePct<=-5){
    insights.push(tf('sesionesInsightTendenciaPlBaja', {pct:`${plTrend.slopePct.toFixed(1)}%`}));
    usedRefs.add('2');
  }
  if(hsrTrend && hsrTrend.slopePct!==null && hsrTrend.slopePct>=5){
    insights.push(tf('sesionesInsightTendenciaHsrAlza', {pct:`+${hsrTrend.slopePct.toFixed(1)}%`}));
    usedRefs.add('2');
  }
  outliers.sort((a,b)=>b.z-a.z).slice(0,2).forEach(o=>{
    insights.push(tf('sesionesInsightOutlier', {f:o.e.fecha.split('-').reverse().join('/'), det:abbrevDetalle(o.e.detalle,24), m:METRICS[o.k].label, z:`${o.z>=0?'+':''}${o.z.toFixed(1)}`}));
    usedRefs.add('8');
  });
  if(!insights.length) insights.push(t('sesionesInsightTodoNormal'));

  ensureSpace(14 + insights.length*7);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informePuntosATener'), marginX, y);
  y += 2.5;
  doc.setDrawColor(151,128,74); doc.setLineWidth(1);
  doc.line(marginX, y, marginX+18, y);
  y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(60,60,60);
  insights.forEach(txt=>{
    const lines = doc.splitTextToSize(txt, pageW-marginX*2-7);
    ensureSpace(lines.length*4.6);
    doc.setFillColor(76,29,149); doc.rect(marginX+1, y-2.6, 2.2, 2.2, 'F');
    doc.text(lines, marginX+6, y);
    y += lines.length*4.6 + 2.5;
  });
  y += 2;

  // ---- fuentes: solo las que efectivamente se citaron arriba ----
  if(usedRefs.size){
    ensureSpace(10 + usedRefs.size*7);
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(90,90,90);
    doc.text(t('informeFuentes'), marginX, y);
    y += 5;
    doc.setFont('helvetica','normal'); doc.setFontSize(7);
    [...usedRefs].sort((a,b)=>a-b).forEach(n=>{
      const lines = doc.splitTextToSize(t(`ref${n}`), pageW-marginX*2);
      doc.text(lines, marginX, y);
      y += lines.length*3.4 + 1.5;
    });
    y += 3;
  }

  // ---- pie ----
  ensureSpace(12);
  y += 4;
  doc.setDrawColor(220,220,220); doc.line(marginX, y, pageW-marginX, y);
  y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(140,140,140);
  doc.text(tf('informePie', {c:CURRENT_CLUB, f:new Date().toLocaleDateString('es-AR')}), marginX, y);

  doc.save(`Sesiones_${state.player.replace(/\s+/g,'_')}_${CURRENT_CLUB.replace(/\s+/g,'_')}.pdf`);
}
