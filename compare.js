// ---------- compare (head-to-head) ----------
function drawCompareRadar(pA,pB){
  const svg = document.getElementById('compareRadarSvg');
  if(!svg) return;
  const cx=200, cy=205, R=140;
  const n = METRIC_ORDER.length;
  let parts = [];
  [0.25,0.5,0.75,1].forEach(f=>{
    const pts = polygonPoints(Array(n).fill(f), cx,cy,R);
    parts.push(`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="rgba(231,231,251,.14)" stroke-width="1"/>`);
  });
  METRIC_ORDER.forEach((m,i)=>{
    const angle = -Math.PI/2 + i*(2*Math.PI/n);
    const x2 = cx + R*Math.cos(angle), y2 = cy + R*Math.sin(angle);
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="rgba(231,231,251,.10)" stroke-width="1"/>`);
    const lx = cx + (R+31)*Math.cos(angle), ly = cy + (R+31)*Math.sin(angle);
    parts.push(`<text x="${lx}" y="${ly}" fill="#9797C9" font-size="12.5" font-family="IBM Plex Mono" text-anchor="middle" dominant-baseline="middle">${METRICS[m].label.toUpperCase()}</text>`);
  });
  if(players.includes(pA) && players.includes(pB)){
    const normA = METRIC_ORDER.map(m=> squadMax[m]? radarBoost(Math.min(1,(playerAvg[pA][m]||0)/squadMax[m])):0);
    const normB = METRIC_ORDER.map(m=> squadMax[m]? radarBoost(Math.min(1,(playerAvg[pB][m]||0)/squadMax[m])):0);
    const ptsB = polygonPoints(normB,cx,cy,R);
    parts.push(`<polygon points="${ptsB.map(p=>p.join(',')).join(' ')}" fill="rgba(244,114,182,.16)" stroke="#F472B6" stroke-width="2"/>`);
    ptsB.forEach(p=>parts.push(`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#F472B6" stroke="#14143A" stroke-width="1.3"/>`));
    const ptsA = polygonPoints(normA,cx,cy,R);
    parts.push(`<polygon points="${ptsA.map(p=>p.join(',')).join(' ')}" fill="rgba(34,211,238,.20)" stroke="#22D3EE" stroke-width="2"/>`);
    ptsA.forEach(p=>parts.push(`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#67E8F9" stroke="#14143A" stroke-width="1.3"/>`));
  }
  parts.push(`<circle cx="${cx}" cy="${cy}" r="2" fill="#E7E7FB"/>`);
  svg.innerHTML = parts.join('');
}
function buildCompare(){
  const selA = document.getElementById('compareA');
  const selB = document.getElementById('compareB');
  if(!selA || !selB) return;
  const pA = selA.value, pB = selB.value;
  drawCompareRadar(pA,pB);
  const legend = document.getElementById('compareLegend');
  const table = document.getElementById('compareTable');
  if(!pA || !pB || !playerAvg[pA] || !playerAvg[pB]){
    if(legend) legend.innerHTML = '';
    if(table) table.innerHTML = `<tbody><tr><td style="padding:14px 0;color:var(--mist);font-size:12.5px;" colspan="3">${t('sinJugadoresComparar')}</td></tr></tbody>`;
    return;
  }
  if(legend) legend.innerHTML = `
    <span><span class="dot" style="background:var(--gold);"></span>${pA}</span>
    <span><span class="dot" style="background:var(--teal);"></span>${pB}</span>`;
  if(!table) return;
  const modeSel = document.getElementById('compareModeSelect');
  const mode = modeSel ? modeSel.value : 'avg5';
  // Según el modo, saca el valor de cada métrica de una fuente distinta: promedio de las últimas 5 sesiones,
  // la sesión más reciente cargada, o el récord personal histórico de esa métrica.
  const valorDe = (p, m) => {
    if(mode==='last'){
      const evs = byPlayer[p];
      if(!evs || !evs.length) return null;
      const partidos = evs.filter(e=>e.tipo==='Partido');
      if(!partidos.length) return null;
      const v = partidos[partidos.length-1][m]; // ya vienen ordenados por fecha ascendente, así que el último es el más reciente
      return (v===null || v===undefined) ? null : v;
    }
    if(mode==='record'){
      const rec = recordByPlayer[p];
      return (rec && rec[m]) ? rec[m].valor : null;
    }
    return playerAvg[p][m] || 0;
  };
  const sinDatosLabel = mode==='last' ? t('cmpSinUltimaSesion') : (mode==='record' ? t('cmpSinRecord') : null);
  const rows = METRIC_ORDER.map(m=>{
    const rawA = valorDe(pA, m), rawB = valorDe(pB, m);
    const vA = rawA || 0, vB = rawB || 0;
    return `<tr>
      <td class="metric-name">${METRICS[m].label}</td>
      <td class="${vA>vB?'lead':''}">${(rawA===null && sinDatosLabel) ? sinDatosLabel : fmt(vA,METRICS[m].dec)}</td>
      <td class="${vB>vA?'leadB':''}">${(rawB===null && sinDatosLabel) ? sinDatosLabel : fmt(vB,METRICS[m].dec)}</td>
    </tr>`;
  }).join('');
  const headerKey = mode==='last' ? 'cmpColMetricaUltimaSesion' : (mode==='record' ? 'cmpColMetricaRecord' : 'cmpColMetricaProm5');
  table.innerHTML = `<thead><tr><th>${t(headerKey)}</th><th>${pA}</th><th>${pB}</th></tr></thead><tbody>${rows}</tbody>`;
}
function populateCompareSelects(){
  const a = document.getElementById('compareA');
  const b = document.getElementById('compareB');
  if(!a || !b) return;
  const opts = players.map(p=>`<option value="${p}">${p}</option>`).join('');
  const prevA = a.value, prevB = b.value;
  a.innerHTML = opts;
  b.innerHTML = opts;
  a.value = players.includes(prevA) ? prevA : players[0];
  b.value = players.includes(prevB) ? prevB : (players[1]||players[0]);
  a.onchange = buildCompare;
  b.onchange = buildCompare;
  const modeSel = document.getElementById('compareModeSelect');
  if(modeSel) modeSel.onchange = buildCompare;
}
