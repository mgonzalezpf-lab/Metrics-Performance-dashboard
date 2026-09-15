// ---------- match comparison ----------
function fatigaLabel(v){
  if(v<=-8) return t('caidaMarcada');
  if(v<=-4) return t('caidaModerada');
  if(v<0) return t('caidaLeve');
  return t('sinCaida');
}
function diffBadge(diff){
  if(diff===null || diff===undefined || isNaN(diff)) return '';
  const color = diff<=-8 ? 'var(--bad)' : diff<=-4 ? 'var(--warn)' : diff<0 ? 'var(--mist)' : 'var(--good)';
  const arrow = diff<0 ? '▼' : '▲';
  return ` <span style="font-size:11px;color:${color};font-weight:600;">${arrow}${Math.abs(diff).toFixed(0)}% 2T</span>`;
}
function buildMatchGrid(){
  const box = document.getElementById('matchGrid');
  const entries = Object.entries(ACTIVE_TEAMTOTALS)
    .filter(([name,row]) => !CURRENT_CATEGORY || !row.categoria || row.categoria===CURRENT_CATEGORY)
    .sort((a,b)=> (b[1].fecha||'').localeCompare(a[1].fecha||''));
  box.innerHTML = entries.map(([name,row])=>{
    const h = row.halves || {};
    return `
    <div class="match-card">
      <h4>${name}<button type="button" class="mc-report-btn" data-match="${name.replace(/"/g,'&quot;')}" title="${t('generarInforme')}">📄 ${t('generarInforme')}</button></h4>
      <div class="dt">${row.fecha.split('-').reverse().join('/')}</div>
      <div class="mm-row"><span class="k">${t('mmDistTotal')}</span><span class="v">${fmt(row.dist)} m${diffBadge(h.dist && h.dist.diff)}</span></div>
      <div class="mm-row"><span class="k">${t('mmHsr')}</span><span class="v">${fmt(row.hsr)} m${diffBadge(h.hsr && h.hsr.diff)}</span></div>
      <div class="mm-row"><span class="k">${t('mmSprintDist')}</span><span class="v">${fmt(row.sprint_dist)} m${diffBadge(h.sprint && h.sprint.diff)}</span></div>
      <div class="mm-row"><span class="k">${t('mmSprintCount')}</span><span class="v">${fmt(row.sprint_count)}${diffBadge(h.sprint_count && h.sprint_count.diff)}</span></div>
      <div class="mm-row"><span class="k">${t('mmAccB23')}</span><span class="v">${fmt(row.acc)}${diffBadge(h.acc && h.acc.diff)}</span></div>
      <div class="mm-row"><span class="k">${t('mmDesaB23')}</span><span class="v">${fmt(row.desa)}${diffBadge(h.desa && h.desa.diff)}</span></div>
      <div class="mm-row"><span class="k">${t('mmRhie')}</span><span class="v">${fmt(row.rhie)}${diffBadge(h.rhie && h.rhie.diff)}</span></div>
      <div class="mm-row"><span class="k">${t('mmPlayerLoad')}</span><span class="v">${fmt(row.pl)}${diffBadge(h.pl && h.pl.diff)}</span></div>
      ${row.fatiga!==undefined && row.fatiga!==null ? `<div class="mm-row"><span class="k">${t('mmIndiceFatiga')}</span><span class="v" style="color:${row.fatiga<=-8?'var(--bad)':row.fatiga<=-4?'var(--warn)':'var(--good)'};">${row.fatiga>0?'+':''}${fmt(row.fatiga,1)}% <span style="font-size:10.5px;font-weight:400;opacity:.85;">(${fatigaLabel(row.fatiga)})</span></span></div>` : ''}
    </div>`;
  }).join('');
  box.querySelectorAll('.mc-report-btn').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      const original = btn.textContent;
      btn.disabled = true; btn.textContent = '⏳ ' + t('generando');
      setTimeout(()=>{ // pequeño delay para que se vea el estado "generando" antes de que el navegador arme el PDF
        try{ generateMatchReportPDF(btn.dataset.match); }
        catch(err){ console.error('Error generando informe PDF:', err); alert(t('noSePudoPdf')); }
        finally{ btn.disabled = false; btn.textContent = original; }
      }, 50);
    });
  });
}

// ---------- informe PDF automático de partido (genera en el navegador, sin backend) ----------
const MATCH_REPORT_METRICS = [
  {key:'dist', label:()=>t('mmDistTotal'), unit:' m'},
  {key:'hsr', label:()=>t('mmHsr'), unit:' m'},
  {key:'sprint_dist', label:()=>t('mmSprintDist'), unit:' m'},
  {key:'sprint_count', label:()=>t('mmSprintCount'), unit:''},
  {key:'acc', label:()=>t('mmAccB23'), unit:''},
  {key:'desa', label:()=>t('mmDesaB23'), unit:''},
  {key:'rhie', label:()=>t('mmRhie'), unit:''},
  {key:'pl', label:()=>t('mmPlayerLoad'), unit:''},
];
function getSortedMatchEntries(){
  return Object.entries(ACTIVE_TEAMTOTALS)
    .filter(([,row]) => !CURRENT_CATEGORY || !row.categoria || row.categoria===CURRENT_CATEGORY)
    .sort((a,b)=> (a[1].fecha||'').localeCompare(b[1].fecha||''));
}
// Los nombres de partido en ACTIVE_TEAMTOTALS ya vienen como "vs Rival" (así se muestran las tarjetas de
// la pestaña Partidos) — si no se limpia ese prefijo antes de armar "vs {rival}" en el informe, queda
// duplicado como "vs vs Rival".
function cleanRivalName(name){
  return String(name||'').replace(/^\s*vs\.?\s+/i, '').trim();
}
// Cruza la fecha del partido contra RECORDS (mejor marca histórica de cada jugador por métrica, con la
// fecha en que la logró — el mismo dato detrás del KPI "Récords logrados hoy"). Si ese día coincide con
// la fecha del partido, esa fue su mejor marca EN ese partido — no hace falta recalcular nada aparte.
function getPlayerRecordsForDate(fecha){
  const recs = (typeof RECORDS !== 'undefined' && RECORDS) ? RECORDS : [];
  const out = [];
  recs.forEach(r=>{
    const metrics = METRIC_ORDER
      .filter(m=> r[m] && r[m].fecha===fecha)
      .map(m=>({
        key:m,
        label: (typeof METRICS!=='undefined' && METRICS[m] && METRICS[m].label) || m,
        unit: (typeof METRICS!=='undefined' && METRICS[m] && METRICS[m].unit) || '',
        dec: (typeof METRICS!=='undefined' && METRICS[m] && METRICS[m].dec) || 0,
        valor: r[m].valor,
      }));
    if(metrics.length) out.push({ jugador: r.jugador, metrics });
  });
  return out.sort((a,b)=> a.jugador.localeCompare(b.jugador));
}
function generateMatchReportPDF(matchName){
  if(typeof window.jspdf === 'undefined'){ alert(t('noSePudoPdf')); return; }
  const entries = getSortedMatchEntries();
  const idx = entries.findIndex(([name])=> name===matchName);
  if(idx===-1) return;
  const [rivalRaw, row] = entries[idx];
  const rival = cleanRivalName(rivalRaw);
  const prevEntries = entries.slice(Math.max(0, idx-5), idx); // hasta 5 partidos anteriores como referencia
  const hayReferencia = prevEntries.length>0;
  const lastEntry = idx>0 ? entries[idx-1] : null; // el partido inmediatamente anterior (no el promedio)

  const baseline = {};
  const rango = {}; // {min,max} de cada métrica dentro de prevEntries, para dar contexto de "dónde cae" este partido
  const stdev = {};
  const zscore = {};
  MATCH_REPORT_METRICS.forEach(m=>{
    const vals = prevEntries.map(([,r])=>r[m.key]).filter(v=>v!==null && v!==undefined && !isNaN(v));
    baseline[m.key] = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    rango[m.key] = vals.length ? {min:Math.min(...vals), max:Math.max(...vals)} : null;
    stdev[m.key] = vals.length>=2 ? computeStdev(vals, baseline[m.key]) : null;
    zscore[m.key] = computeZScore(row[m.key], baseline[m.key], stdev[m.key]);
  });
  const diffPct = {};
  const diffPctLast = {};
  MATCH_REPORT_METRICS.forEach(m=>{
    const base = baseline[m.key], val = row[m.key];
    diffPct[m.key] = (base && val!==null && val!==undefined) ? ((val-base)/base*100) : null;
    const lastVal = lastEntry ? lastEntry[1][m.key] : null;
    diffPctLast[m.key] = (lastVal && val!==null && val!==undefined) ? ((val-lastVal)/lastVal*100) : null;
  });

  // ---- métricas derivadas: perfil de intensidad, no solo números sueltos ----
  const derived = computeMatchDerivedMetrics(row);
  const derivedBase = computeMatchDerivedMetricsAvg(prevEntries);
  const derivedDiff = {};
  Object.keys(derived).forEach(k=>{
    const b = derivedBase[k];
    derivedDiff[k] = (b && derived[k]!==null) ? ((derived[k]-b)/b*100) : null;
  });

  // ---- tendencia lineal (regresión simple) de las métricas clave a lo largo de los partidos recientes,
  // incluyendo el actual — para saber si el equipo viene en alza/baja sostenida, no solo este partido vs. el promedio ----
  const trendKeys = ['hsr','sprint_dist','sprint_count','pl'];
  const trendSeries = [...prevEntries, [rivalRaw, row]];
  const trends = {};
  trendKeys.forEach(k=>{
    const vals = trendSeries.map(([,r])=>r[k]).filter(v=>v!==null && v!==undefined && !isNaN(v));
    trends[k] = computeLinearTrend(vals);
  });

  // ---- 1T vs 2T por métrica (solo si esta carga vino del CSV crudo de Catapult, que trae ese detalle) ----
  const halvesKeys = ['dist','hsr','acc','desa','pl','sprint_dist','sprint_count','rhie'];
  const halvesMap = { dist:'dist', hsr:'hsr', acc:'acc', desa:'desa', pl:'pl', sprint_dist:'sprint', sprint_count:'sprint_count', rhie:'rhie' };
  const hasHalves = !!(row.halves && halvesKeys.some(k=>{ const h = row.halves[halvesMap[k]]; return h && h.t1!==null && h.t1!==undefined && h.t2!==null && h.t2!==undefined; }));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4'});
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 16;
  let y = 20;
  const ensureSpace = (needed)=>{ if(y + needed > 282){ doc.addPage(); y = 20; } };

  // ---- encabezado ----
  doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.setTextColor(18,33,59);
  doc.text(`${CURRENT_CLUB} — ${t('informeDePartido')}`, marginX, y);
  y += 7;
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(90,90,90);
  const fechaTxt = (row.fecha||'').split('-').reverse().join('/');
  const subt = hayReferencia
    ? tf('informeSubtituloConRef', {r:rival, d:fechaTxt, n:prevEntries.length})
    : tf('informeSubtituloSinRef', {r:rival, d:fechaTxt});
  doc.text(doc.splitTextToSize(subt, pageW-marginX*2), marginX, y);
  y += 10;
  doc.setDrawColor(220,220,220); doc.line(marginX, y, pageW-marginX, y);
  y += 8;

  // ---- resumen ejecutivo (texto corrido, sintetiza el partido antes de entrar a los cuadros) ----
  const resumenTxt = buildMatchReportSummary(row, diffPct, diffPctLast, hayReferencia, !!lastEntry, rival, zscore);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informeResumenIntro'), marginX, y);
  y += 5.5;
  doc.setFont('helvetica','normal'); doc.setFontSize(9.3); doc.setTextColor(60,60,60);
  const resumenLines = doc.splitTextToSize(resumenTxt, pageW-marginX*2);
  doc.text(resumenLines, marginX, y);
  y += resumenLines.length*4.4 + 6;

  // ---- resumen alta intensidad (si hay referencia) ----
  if(hayReferencia){
    ensureSpace(36);
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
    doc.text(t('informeAltaIntensidad'), marginX, y);
    y += 5;
    const hiKeys = ['hsr','sprint_dist','sprint_count'];
    const boxColors = [[192,87,15],[108,52,131],[164,41,31]];
    const boxW = (pageW - marginX*2 - 8)/3;
    const boxH = 30;
    hiKeys.forEach((k,i)=>{
      const m = MATCH_REPORT_METRICS.find(mm=>mm.key===k);
      const x = marginX + i*(boxW+4);
      const [r,g,b] = boxColors[i];
      doc.setFillColor(r,g,b);
      doc.roundedRect(x, y, boxW, boxH, 2, 2, 'F');
      doc.setTextColor(255,255,255);
      const pct = diffPct[k];
      doc.setFont('helvetica','bold'); doc.setFontSize(15);
      doc.text(pct===null ? '—' : `${pct>=0?'+':''}${pct.toFixed(1)}%`, x+boxW/2, y+10, {align:'center'});
      doc.setFont('helvetica','normal'); doc.setFontSize(7.2);
      doc.text(doc.splitTextToSize(m.label().toUpperCase(), boxW-6), x+boxW/2, y+15, {align:'center'});
      doc.setFontSize(6.6);
      doc.text(`${fmt(row[k])}${m.unit} vs ${fmt(Math.round(baseline[k]))}${m.unit} prom.`, x+boxW/2, y+20.5, {align:'center'});
      const z = zscore[k];
      if(z!==null && z!==undefined){
        doc.text(tf('informeZScore', {z: `${z>=0?'+':''}${z.toFixed(1)}`}), x+boxW/2, y+25.5, {align:'center'});
      } else {
        const rg = rango[k];
        if(rg) doc.text(tf('informeRangoReciente', {n:prevEntries.length, min:fmt(Math.round(rg.min)), max:fmt(Math.round(rg.max)), u:m.unit}), x+boxW/2, y+25.5, {align:'center'});
      }
    });
    y += boxH + 6;
  }

  // ---- tabla de métricas: vs promedio Y vs último partido ----
  ensureSpace(12 + MATCH_REPORT_METRICS.length*7);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informeDetalleMetrica'), marginX, y);
  y += 6;
  const tableW = pageW-marginX*2;
  const colX = [marginX, marginX+48, marginX+80, marginX+112, marginX+145];
  const rowH = 7;
  doc.setFillColor(18,33,59);
  doc.rect(marginX, y, tableW, rowH, 'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text(t('colMetrica'), colX[0]+2, y+4.8);
  doc.text(t('informeEstePartido'), colX[1], y+4.8);
  doc.text(hayReferencia ? t('informePromedioAnterior') : t('sinDatosTooltip'), colX[2], y+4.8);
  doc.text(t('colDiferencia'), colX[3], y+4.8);
  doc.text(t('informeVsUltimo'), colX[4], y+4.8);
  y += rowH;
  MATCH_REPORT_METRICS.forEach((m,i)=>{
    if(i%2===1){ doc.setFillColor(242,245,250); doc.rect(marginX, y, tableW, rowH, 'F'); }
    doc.setFont('helvetica','bold'); doc.setFontSize(8.2); doc.setTextColor(30,30,30);
    doc.text(m.label(), colX[0]+2, y+4.8);
    doc.setFont('helvetica','normal');
    doc.text(row[m.key]!==null && row[m.key]!==undefined ? `${fmt(row[m.key])}${m.unit}` : '—', colX[1], y+4.8);
    doc.text(baseline[m.key]!==null ? `${fmt(Math.round(baseline[m.key]))}${m.unit}` : '—', colX[2], y+4.8);
    const pct = diffPct[m.key];
    doc.setTextColor(30,30,30); doc.setFont('helvetica','normal');
    if(pct!==null){ doc.setTextColor(pct>=0?46:194, pct>=0?139:57, pct>=0?87:47); doc.setFont('helvetica','bold'); }
    doc.text(pct!==null ? `${pct>=0?'+':''}${pct.toFixed(1)}%` : '—', colX[3], y+4.8);
    const pctL = diffPctLast[m.key];
    doc.setTextColor(30,30,30); doc.setFont('helvetica','normal');
    if(pctL!==null){ doc.setTextColor(pctL>=0?46:194, pctL>=0?139:57, pctL>=0?87:47); doc.setFont('helvetica','bold'); }
    doc.text(pctL!==null ? `${pctL>=0?'+':''}${pctL.toFixed(1)}%` : '—', colX[4], y+4.8);
    y += rowH;
  });
  doc.setDrawColor(220,220,220); doc.rect(marginX, y-rowH*MATCH_REPORT_METRICS.length, tableW, rowH*MATCH_REPORT_METRICS.length);
  y += 9;

  // ---- perfil de intensidad: métricas derivadas, no solo las crudas ----
  ensureSpace(10 + 6*7);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informePerfilIntensidad'), marginX, y);
  y += 6;
  const derivedRows = [
    {key:'hsrShare', label:t('metricaHsrPctDist'), unit:'%', dec:1},
    {key:'sprintLen', label:t('metricaSprintProm'), unit:' m', dec:0},
    {key:'accDesaTotal', label:t('metricaAccDesaTotal'), unit:'', dec:0},
    {key:'plPerKm', label:t('metricaPlPerKm'), unit:'', dec:0},
    {key:'rhieDensity', label:t('metricaRhieDensity'), unit:'', dec:1},
    {key:'accDecRatio', label:t('metricaAccDecRatio'), unit:'', dec:2},
  ];
  const colX2 = [marginX, marginX+75, marginX+118, marginX+150];
  doc.setFillColor(18,33,59); doc.rect(marginX, y, tableW, rowH, 'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text(t('colMetrica'), colX2[0]+2, y+4.8);
  doc.text(t('informeEstePartido'), colX2[1], y+4.8);
  doc.text(hayReferencia ? t('informePromedio') : t('sinDatosTooltip'), colX2[2], y+4.8);
  doc.text(t('colDiferencia'), colX2[3], y+4.8);
  y += rowH;
  derivedRows.forEach((dr,i)=>{
    if(i%2===1){ doc.setFillColor(242,245,250); doc.rect(marginX, y, tableW, rowH, 'F'); }
    doc.setFont('helvetica','bold'); doc.setFontSize(8.2); doc.setTextColor(30,30,30);
    doc.text(dr.label, colX2[0]+2, y+4.8);
    doc.setFont('helvetica','normal');
    const val = derived[dr.key];
    doc.text(val!==null && val!==undefined ? `${fmt(val,dr.dec)}${dr.unit}` : '—', colX2[1], y+4.8);
    const bv = derivedBase[dr.key];
    doc.text(bv!==null && bv!==undefined ? `${fmt(bv,dr.dec)}${dr.unit}` : '—', colX2[2], y+4.8);
    const dpct = derivedDiff[dr.key];
    doc.setTextColor(30,30,30); doc.setFont('helvetica','normal');
    if(dpct!==null){ doc.setTextColor(dpct>=0?46:194, dpct>=0?139:57, dpct>=0?87:47); doc.setFont('helvetica','bold'); }
    doc.text(dpct!==null ? `${dpct>=0?'+':''}${dpct.toFixed(1)}%` : '—', colX2[3], y+4.8);
    y += rowH;
  });
  doc.setDrawColor(220,220,220); doc.rect(marginX, y-rowH*derivedRows.length, tableW, rowH*derivedRows.length);
  y += 4;
  doc.setFont('helvetica','normal'); doc.setFontSize(7.3); doc.setTextColor(130,130,130);
  const notaPerfil = doc.splitTextToSize(t('informeNotaPerfil'), tableW);
  doc.text(notaPerfil, marginX, y);
  y += notaPerfil.length*3.6 + 6;

  // ---- tendencia reciente: regresión lineal simple sobre los últimos partidos (incluye el actual) ----
  ensureSpace(10 + 5*7);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informeTendenciaReciente'), marginX, y);
  y += 6;
  const anyTrend = trendKeys.some(k=>trends[k]);
  if(anyTrend){
    const trColX = [marginX, marginX+70, marginX+120];
    doc.setFillColor(18,33,59); doc.rect(marginX, y, tableW, rowH, 'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.text(t('colMetrica'), trColX[0]+2, y+4.8);
    doc.text(t('informeTendenciaCol'), trColX[1], y+4.8);
    doc.text(t('informePendienteCol'), trColX[2], y+4.8);
    y += rowH;
    trendKeys.forEach((k,i)=>{
      const m = MATCH_REPORT_METRICS.find(mm=>mm.key===k);
      const tr = trends[k];
      if(i%2===1){ doc.setFillColor(242,245,250); doc.rect(marginX, y, tableW, rowH, 'F'); }
      doc.setFont('helvetica','bold'); doc.setFontSize(8.2); doc.setTextColor(30,30,30);
      doc.text(m.label(), trColX[0]+2, y+4.8);
      doc.setFont('helvetica','normal');
      if(tr && tr.slopePct!==null){
        const dir = tr.slopePct>=3 ? t('tendenciaAscendente') : tr.slopePct<=-3 ? t('tendenciaDescendente') : t('tendenciaEstable');
        const color = tr.slopePct>=3 ? [46,139,87] : tr.slopePct<=-3 ? [194,57,47] : [90,90,90];
        doc.setTextColor(...color); doc.setFont('helvetica','bold');
        doc.text(dir, trColX[1], y+4.8);
        doc.setTextColor(30,30,30); doc.setFont('helvetica','normal');
        doc.text(`${tr.slopePct>=0?'+':''}${tr.slopePct.toFixed(1)}%/partido`, trColX[2], y+4.8);
      } else {
        doc.text('—', trColX[1], y+4.8);
        doc.text('—', trColX[2], y+4.8);
      }
      y += rowH;
    });
    doc.setDrawColor(220,220,220); doc.rect(marginX, y-rowH*trendKeys.length, tableW, rowH*trendKeys.length);
    y += 4;
    doc.setFont('helvetica','normal'); doc.setFontSize(7.3); doc.setTextColor(130,130,130);
    const notaTrend = doc.splitTextToSize(tf('informeNotaTendencia', {n:trendSeries.length}), tableW);
    doc.text(notaTrend, marginX, y);
    y += notaTrend.length*3.6 + 6;
  } else {
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(120,120,120);
    const lines = doc.splitTextToSize(t('informeSinTendenciaNota'), tableW);
    doc.text(lines, marginX, y);
    y += lines.length*4.4 + 6;
  }

  // ---- 1T vs 2T por métrica ----
  ensureSpace(10 + (hasHalves ? halvesKeys.length*7 : 10));
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informePrimerVsSegundo'), marginX, y);
  y += 6;
  if(hasHalves){
    const hColX = [marginX, marginX+70, marginX+105, marginX+140];
    doc.setFillColor(18,33,59); doc.rect(marginX, y, tableW, rowH, 'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.text(t('colMetrica'), hColX[0]+2, y+4.8);
    doc.text(t('col1T'), hColX[1], y+4.8);
    doc.text(t('col2T'), hColX[2], y+4.8);
    doc.text(t('colDiferencia'), hColX[3], y+4.8);
    y += rowH;
    halvesKeys.forEach((k,i)=>{
      const m = MATCH_REPORT_METRICS.find(mm=>mm.key===k);
      const h = row.halves[halvesMap[k]];
      if(i%2===1){ doc.setFillColor(242,245,250); doc.rect(marginX, y, tableW, rowH, 'F'); }
      doc.setFont('helvetica','bold'); doc.setFontSize(8.2); doc.setTextColor(30,30,30);
      doc.text(m.label(), hColX[0]+2, y+4.8);
      doc.setFont('helvetica','normal');
      const t1 = h ? h.t1 : null, t2 = h ? h.t2 : null, hd = h ? h.diff : null;
      doc.text(t1!==null && t1!==undefined ? `${fmt(t1)}${m.unit}` : '—', hColX[1], y+4.8);
      doc.text(t2!==null && t2!==undefined ? `${fmt(t2)}${m.unit}` : '—', hColX[2], y+4.8);
      doc.setTextColor(30,30,30); doc.setFont('helvetica','normal');
      if(hd!==null && hd!==undefined){ doc.setTextColor(hd>=0?46:194, hd>=0?139:57, hd>=0?87:47); doc.setFont('helvetica','bold'); }
      doc.text(hd!==null && hd!==undefined ? `${hd>=0?'+':''}${hd.toFixed(1)}%` : '—', hColX[3], y+4.8);
      y += rowH;
    });
    doc.setDrawColor(220,220,220); doc.rect(marginX, y-rowH*halvesKeys.length, tableW, rowH*halvesKeys.length);
    y += 8;
  } else {
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(120,120,120);
    const lines = doc.splitTextToSize(t('informeSinHalvesNota'), tableW);
    doc.text(lines, marginX, y);
    y += lines.length*4.4 + 3;
    if(row.fatiga!==undefined && row.fatiga!==null){
      doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(50,50,50);
      doc.text(`${t('mmIndiceFatiga')}: ${row.fatiga>0?'+':''}${fmt(row.fatiga,1)}% (${fatigaLabel(row.fatiga)})`, marginX, y);
      y += 7;
    }
  }
  y += 2;

  // ---- récords individuales: jugadores que marcaron su mejor marca histórica en alguna métrica justo
  // este día (cruza la fecha del partido contra RECORDS, que ya trackea el mejor valor de cada jugador
  // en cada métrica junto con la fecha en que lo logró — mismo dato que usa el KPI "Récords logrados hoy") ----
  // Las métricas de alta velocidad/aceleración (HSR, sprint, acc, desa, RHIE) implican pico de esfuerzo
  // neuromuscular con alta carga excéntrica — el escenario clásico de mayor riesgo de lesión muscular
  // (isquiotibiales en particular) según la literatura de carga externa GPS. Un récord en esas métricas
  // puntuales marca al jugador para atención de recuperación; un récord en distancia/PL (más volumen que
  // pico) no necesariamente amerita la misma alerta.
  const HIGH_MECH_STRESS_KEYS = ['hsr','vel','sprint','sprint_count','acc','desa','rhie'];
  const playerRecords = getPlayerRecordsForDate(row.fecha);
  const flaggedPlayers = playerRecords.filter(p=> p.metrics.some(m=> HIGH_MECH_STRESS_KEYS.includes(m.key)));
  ensureSpace(10);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informeRecordsIndividuales'), marginX, y);
  y += 6;
  if(playerRecords.length){
    doc.setFontSize(9);
    playerRecords.forEach(p=>{
      const detalle = p.metrics.map(m=> `${m.label} ${fmt(m.valor, m.dec)}${m.unit}`).join(' · ');
      const isFlagged = p.metrics.some(m=> HIGH_MECH_STRESS_KEYS.includes(m.key));
      const lines = doc.splitTextToSize(`•  ${p.jugador} — ${detalle}`, tableW-2);
      ensureSpace(lines.length*4.6 + (isFlagged?4.6:0));
      doc.setFont('helvetica','bold'); doc.setTextColor(50,50,50);
      doc.text(lines, marginX+1, y);
      y += lines.length*4.6;
      if(isFlagged){
        doc.setFont('helvetica','bold'); doc.setFontSize(7.8); doc.setTextColor(194,57,47);
        doc.text(`   ${t('informePrioridadRecuperacion')}`, marginX+1, y);
        doc.setFontSize(9);
        y += 4.4;
      }
      y += 2;
    });
    y += 3;
  } else {
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(120,120,120);
    const lines = doc.splitTextToSize(t('informeSinRecordsIndividuales'), tableW);
    doc.text(lines, marginX, y);
    y += lines.length*4.4 + 6;
  }

  // ---- consideraciones de recuperación: no alcanza con marcar quién quedó marcado — se explica el porqué
  // fisiológico/técnico, para que la alerta sea accionable y no un dato suelto ----
  if(flaggedPlayers.length){
    ensureSpace(10);
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
    doc.text(t('informeConsideracionesRecuperacion'), marginX, y);
    y += 6;
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(50,50,50);
    const nombres = flaggedPlayers.map(p=>p.jugador).join(', ');
    const lineaJugadores = doc.splitTextToSize(nombres, tableW);
    doc.text(lineaJugadores, marginX, y);
    y += lineaJugadores.length*4.6 + 3;
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(60,60,60);
    [t('recuperacionArgFisiologico'), t('recuperacionArgLesion'), t('recuperacionArgAccion')].forEach(txt=>{
      const lines = doc.splitTextToSize(`•  ${txt}`, tableW-2);
      ensureSpace(lines.length*4.6);
      doc.text(lines, marginX+1, y);
      y += lines.length*4.6 + 2.5;
    });
    y += 3;
  }

  // ---- puntos a tener en cuenta: lectura en texto, no solo los cuadros de números ----
  const insights = buildMatchReportInsights(row, diffPct, hayReferencia, derived, derivedDiff, hasHalves, zscore, trends);
  if(insights.length){
    ensureSpace(10);
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
    doc.text(t('informePuntosATener'), marginX, y);
    y += 6;
    doc.setFontSize(9);
    insights.forEach(txt=>{
      const lines = doc.splitTextToSize(`•  ${txt}`, tableW-2);
      ensureSpace(lines.length*4.6);
      doc.setFont('helvetica','normal'); doc.setTextColor(50,50,50);
      doc.text(lines, marginX+1, y);
      y += lines.length*4.6 + 2.5;
    });
    y += 2;
  }

  // ---- fuentes: solo se muestran si el informe efectivamente citó alguna [N] en el texto — no tiene
  // sentido imprimir la bibliografía si este partido en particular no tuvo insights de recuperación ----
  const usedRefs = new Set();
  const textosParaRefs = [...insights];
  if(flaggedPlayers.length) textosParaRefs.push(t('recuperacionArgFisiologico'), t('recuperacionArgLesion'));
  textosParaRefs.forEach(txt=>{
    const m = String(txt).match(/\[([\d,]+)\]/g);
    if(m) m.forEach(grp=> grp.replace(/[\[\]]/g,'').split(',').forEach(n=> usedRefs.add(n.trim())));
  });
  if(usedRefs.size){
    ensureSpace(10 + usedRefs.size*7);
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(90,90,90);
    doc.text(t('informeFuentes'), marginX, y);
    y += 5;
    doc.setFont('helvetica','normal'); doc.setFontSize(7);
    [...usedRefs].sort((a,b)=>a-b).forEach(n=>{
      const refKey = `ref${n}`;
      const lines = doc.splitTextToSize(t(refKey), tableW);
      doc.text(lines, marginX, y);
      y += lines.length*3.4 + 1.5;
    });
    y += 3;
  }

  // ---- pie ----
  ensureSpace(12);
  doc.setDrawColor(220,220,220); doc.line(marginX, y, pageW-marginX, y);
  y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(140,140,140);
  doc.text(tf('informePie', {c:CURRENT_CLUB, f:new Date().toLocaleDateString('es-AR')}), marginX, y);

  doc.save(`Informe_${CURRENT_CLUB.replace(/\s+/g,'_')}_vs_${rival.replace(/\s+/g,'_')}_${row.fecha}.pdf`);
}

// Métricas derivadas de un partido puntual: no son datos crudos del CSV, se calculan a partir de ellos
// para dar una lectura de "perfil" (qué tan explosivo/largo fue el esfuerzo) y de eficiencia mecánica
// (cuánto "costó" en Player Load/RHIE cada km recorrido) — estándares habituales en la literatura de carga
// externa GPS, no solo el volumen total.
function computeMatchDerivedMetrics(row){
  const hsrShare = (row.hsr!==null && row.hsr!==undefined && row.dist) ? (row.hsr/row.dist*100) : null;
  const sprintLen = (row.sprint_dist!==null && row.sprint_dist!==undefined && row.sprint_count) ? (row.sprint_dist/row.sprint_count) : null;
  const accDesaTotal = (row.acc!==null && row.acc!==undefined && row.desa!==null && row.desa!==undefined) ? (row.acc+row.desa) : null;
  const plPerKm = (row.pl!==null && row.pl!==undefined && row.dist) ? (row.pl/row.dist*1000) : null;
  const rhieDensity = (row.rhie!==null && row.rhie!==undefined && row.dist) ? (row.rhie/row.dist*1000) : null;
  const accDecRatio = (row.acc!==null && row.acc!==undefined && row.desa) ? (row.acc/row.desa) : null;
  return {hsrShare, sprintLen, accDesaTotal, plPerKm, rhieDensity, accDecRatio};
}
function computeMatchDerivedMetricsAvg(entriesArr){
  const list = entriesArr.map(([,r])=>computeMatchDerivedMetrics(r));
  const avgOf = (key)=>{ const vals = list.map(d=>d[key]).filter(v=>v!==null && v!==undefined && !isNaN(v)); return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null; };
  return { hsrShare:avgOf('hsrShare'), sprintLen:avgOf('sprintLen'), accDesaTotal:avgOf('accDesaTotal'),
    plPerKm:avgOf('plPerKm'), rhieDensity:avgOf('rhieDensity'), accDecRatio:avgOf('accDecRatio') };
}

// ---- utilidades estadísticas: desvío estándar, z-score y tendencia lineal (regresión simple) ----
// No son cosmética — dan una lectura más rigurosa que "más/menos que el promedio": el z-score dice CUÁNTOS
// desvíos estándar se alejó este partido de lo habitual (>|2| es estadísticamente atípico), y la tendencia
// lineal muestra si el equipo viene en alza/baja en esa métrica partido a partido, no solo partido vs partido.
function computeStdev(vals, mean){
  if(!vals.length) return null;
  const variance = vals.reduce((a,v)=>a+Math.pow(v-mean,2),0)/vals.length;
  return Math.sqrt(variance);
}
function computeZScore(val, mean, sd){
  if(val===null || val===undefined || mean===null || !sd) return null;
  return (val-mean)/sd;
}
// Regresión lineal simple (mínimos cuadrados) sobre una serie cronológica de valores — devuelve la
// pendiente por partido y la pendiente como % del promedio de la serie (para que sea comparable entre
// métricas de escalas muy distintas, ej. metros vs. cantidad de sprints).
function computeLinearTrend(vals){
  const n = vals.length;
  if(n<3) return null; // con 1-2 puntos una "tendencia" no dice nada real
  const xs = vals.map((_,i)=>i);
  const xMean = xs.reduce((a,b)=>a+b,0)/n;
  const yMean = vals.reduce((a,b)=>a+b,0)/n;
  let num = 0, den = 0;
  for(let i=0;i<n;i++){ num += (xs[i]-xMean)*(vals[i]-yMean); den += Math.pow(xs[i]-xMean,2); }
  const slope = den ? num/den : 0;
  const slopePct = yMean ? (slope/yMean*100) : null;
  return { slope, slopePct };
}


// Arma el párrafo de "resumen del partido" que abre el informe, sintetizando intensidad + volumen +
// fatiga + comparación con el último partido en 3-4 oraciones concretas, no una lista de números sueltos.
function buildMatchReportSummary(row, diffPct, diffPctLast, hayReferencia, hayUltimo, rival, zscore){
  if(!hayReferencia) return t('insightSinHistorial');
  const partes = [];
  const hsrUp = diffPct.hsr!==null && diffPct.hsr>=15;
  const sprintUp = (diffPct.sprint_dist!==null && diffPct.sprint_dist>=15) || (diffPct.sprint_count!==null && diffPct.sprint_count>=15);
  const distFlat = diffPct.dist===null || Math.abs(diffPct.dist)<=5;
  if(hsrUp || sprintUp){
    const zHsr = zscore && zscore.hsr;
    const zTxt = (zHsr!==null && zHsr!==undefined) ? tf('resumenZScoreExtra', {z:`${zHsr>=0?'+':''}${zHsr.toFixed(1)}`}) : '';
    partes.push(tf('resumenAltaIntensidad', {r:rival, hsr: diffPct.hsr!==null? `${diffPct.hsr>=0?'+':''}${diffPct.hsr.toFixed(1)}%` : '—'}) + zTxt);
    if(distFlat) partes.push(t('resumenVolumenSimilar'));
  } else if(diffPct.dist!==null && diffPct.dist<=-10){
    partes.push(t('resumenVolumenBajo'));
  } else {
    partes.push(t('resumenParametrosHabituales'));
  }
  if(row.fatiga!==undefined && row.fatiga!==null){
    partes.push(tf('resumenFatiga', {v:`${row.fatiga>0?'+':''}${fmt(row.fatiga,1)}%`, l:fatigaLabel(row.fatiga).toLowerCase()}));
  }
  if(hayUltimo && diffPctLast.pl!==null){
    partes.push(tf('resumenVsUltimo', {v:`${diffPctLast.pl>=0?'+':''}${diffPctLast.pl.toFixed(1)}%`}));
  }
  return partes.join(' ');
}

// Traduce los números del informe en 3-9 frases concretas de "qué mirar", no solo el cuadro con los datos.
// Reglas simples basadas en umbrales y en z-score — no reemplaza el criterio del cuerpo técnico, es una
// primera lectura estadísticamente informada.
function buildMatchReportInsights(row, diffPct, hayReferencia, derived, derivedDiff, hasHalves, zscore, trends){
  const out = [];
  if(!hayReferencia){
    out.push(t('insightSinHistorial'));
  } else {
    const hsrUp = diffPct.hsr!==null && diffPct.hsr>=15;
    const sprintUp = (diffPct.sprint_dist!==null && diffPct.sprint_dist>=15) || (diffPct.sprint_count!==null && diffPct.sprint_count>=15);
    if(hsrUp || sprintUp){
      out.push(t('insightHighIntensity'));
      const distFlat = diffPct.dist===null || diffPct.dist<=5;
      if(distFlat) out.push(t('insightVolumenFlat'));
    }
    if(diffPct.rhie!==null && diffPct.rhie<=-20) out.push(t('insightRhieBajo'));
    if(diffPct.pl!==null && diffPct.pl<=-15) out.push(t('insightCargaBaja'));
    else if(diffPct.pl!==null && diffPct.pl>=15 && !hsrUp && !sprintUp) out.push(t('insightCargaAlta'));
    if(derivedDiff && derivedDiff.sprintLen!==null){
      if(derivedDiff.sprintLen<=-15) out.push(t('insightSprintCortos'));
      else if(derivedDiff.sprintLen>=15) out.push(t('insightSprintLargos'));
    }
    // ---- lecturas basadas en z-score: valores |z|>=2 son estadísticamente atípicos, no solo "altos" ----
    if(zscore){
      ['hsr','sprint_dist','sprint_count'].forEach(k=>{
        const z = zscore[k];
        if(z!==null && z!==undefined && Math.abs(z)>=2){
          const m = MATCH_REPORT_METRICS.find(mm=>mm.key===k);
          out.push(tf('insightZScoreAtipico', {m: m.label(), z: `${z>=0?'+':''}${z.toFixed(1)}`}));
        }
      });
    }
    // ---- eficiencia mecánica: mucho Player Load por km sin más HSR/sprints sugiere trabajo multidireccional
    // (giros, duelos, presión) más que carrera en línea recta — una lectura que el volumen solo no muestra ----
    if(derivedDiff && derivedDiff.plPerKm!==null && derivedDiff.plPerKm>=15 && !hsrUp && !sprintUp){
      out.push(t('insightPlPerKmAlto'));
    }
    if(derived && derived.accDecRatio!==null && derivedDiff && derivedDiff.accDecRatio!==null && Math.abs(derivedDiff.accDecRatio)>=20){
      out.push(derivedDiff.accDecRatio>0 ? t('insightMasAcelQueDesacel') : t('insightMasDesacelQueAcel'));
    }
    // ---- tendencia sostenida: si la pendiente de varios partidos seguidos ya viene marcada, es un patrón,
    // no un evento aislado de este partido ----
    if(trends){
      const hsrTrend = trends.hsr, plTrend = trends.pl;
      if(hsrTrend && hsrTrend.slopePct!==null && hsrTrend.slopePct>=5) out.push(t('insightTendenciaHsrAlza'));
      if(plTrend && plTrend.slopePct!==null && plTrend.slopePct<=-5) out.push(t('insightTendenciaPlBaja'));
    }
  }
  if(row.fatiga!==undefined && row.fatiga!==null){
    if(row.fatiga<=-8) out.push(t('insightFatigaAlta'));
    else if(row.fatiga<=-4) out.push(t('insightFatigaModerada'));
    else out.push(t('insightFatigaOk'));
  }
  if(hasHalves && row.halves){
    const hsrH = row.halves.hsr, sprintCountH = row.halves.sprint_count;
    if(hsrH && hsrH.diff!==null && hsrH.diff<=-20) out.push(t('insightCaidaConcentradaHsr'));
    if(sprintCountH && sprintCountH.diff!==null && sprintCountH.diff<=-25) out.push(t('insightCaidaConcentradaSprint'));
  }
  if(hayReferencia && !out.length) out.push(t('insightTodoNormal'));
  return out.slice(0,9);
}

