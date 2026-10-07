function buildMicrocycleTable(){
  const box = document.getElementById('microcycleTable');
  if(!box) return;
  const {cycles, byDate, lastCycleWasClosed} = computeMicrocycles(categoryFilteredEvents());
  if(!cycles.length){ box.innerHTML=''; return; }
  const lastMatch = getLastMatchInfo(categoryFilteredEvents()); // mismo filtro de categoría que el resto de la tabla y que el KPI "Intensidad sesión actual", para que ambos números coincidan
  const last4 = cycles; // todos los microciclos disponibles (la tabla ya tiene scroll vertical propio)
  const bodyHtml = last4.map((datesArr, i)=>{
    // Buscamos el partido de este ciclo para poder contar los días hacia/desde él (MD-5, MD-4... MD, MD+1...)
    let matchDate = datesArr.find(d=> (byDate[d]||[]).some(e=>e.tipo==='Partido'));
    let matchIsManual = false;
    // Si es el ciclo actual y quedó GENUINAMENTE abierto (sin partido ni día libre que lo cierre),
    // recién ahí usamos la fecha que cargaste manualmente. Un ciclo ya cerrado por un día libre
    // no debe "engancharse" al próximo partido — eso generaba el bug de MD-11, MD-10...
    if(!matchDate && i===last4.length-1 && NEXT_MATCH_DATE && !lastCycleWasClosed){
      matchDate = NEXT_MATCH_DATE;
      matchIsManual = true;
    }
    const dayDiff = (a,b)=> Math.round((new Date(a+'T00:00:00') - new Date(b+'T00:00:00')) / 86400000);
    let cycleTotal = 0, hsrTotal = 0, plTotal = 0, rhieTotal = 0; // suma de los promedios diarios: se corta y arranca de nuevo en cada microciclo
    const intensityValues = [];
    const dayRows = datesArr.map(d=>{
      const dayEvents = byDate[d]||[];
      const isRest = dayEvents.some(isRestDayEvent);
      const match = dayEvents.find(e=>e.tipo==='Partido');
      const distAvg = avgField(dayEvents,'dist');
      const hsrAvg = avgField(dayEvents,'hsr');
      const plAvg = avgField(dayEvents,'pl');
      const rhieAvg = avgField(dayEvents,'rhie');
      const mminAvg = avgMPerMin(dayEvents);
      if(distAvg!==null) cycleTotal += distAvg;
      if(hsrAvg!==null) hsrTotal += hsrAvg;
      if(plAvg!==null) plTotal += plAvg;
      if(rhieAvg!==null) rhieTotal += rhieAvg;

      // Intensidad compuesta: promedio de los % de cada métrica disponible ese día, contra el último partido jugado.
      // Mismas 4 métricas que el KPI "Intensidad sesión actual" (dist, HSR, PL y m/min), para que ambos números coincidan.
      const pcts = [];
      if(distAvg!==null && lastMatch && lastMatch.avgDist) pcts.push(distAvg/lastMatch.avgDist*100);
      if(hsrAvg!==null && lastMatch && lastMatch.avgHsr) pcts.push(hsrAvg/lastMatch.avgHsr*100);
      if(plAvg!==null && lastMatch && lastMatch.avgPl) pcts.push(plAvg/lastMatch.avgPl*100);
      if(mminAvg!==null && lastMatch && lastMatch.avgMMin) pcts.push(mminAvg/lastMatch.avgMMin*100);
      const intensityPct = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length) : null;
      if(intensityPct!==null) intensityValues.push(intensityPct);
      const intensityColor = intensityPct===null ? '' : (intensityPct>100 ? 'color:var(--bad);' : intensityPct>=70 ? 'color:var(--gold-bright);' : 'color:var(--mist);');

      const nombre = isRest ? t('diaLibreMin') : (match ? tf('partidoVs', {r:match.detalle}) : (dayEvents[0]?.detalle || dayEvents[0]?.tipo || '—'));
      const rowClass = isRest ? 'mc-rest' : (match ? 'mc-match' : '');
      const dateStr = d.split('-').reverse().join('/');
      let mdLabel = '—';
      if(matchDate && !isRest){
        const diff = dayDiff(matchDate, d); // días QUE FALTAN respecto a esta fila (positivo = antes del partido)
        mdLabel = diff===0 ? 'MD' : (diff>0 ? `MD-${diff}` : `MD+${Math.abs(diff)}`);
      }
      // Borra TODO lo cargado ese día (todo el plantel, no un jugador puntual) — pensado para el caso de
      // una sesión que se subió mal/duplicada por error. Solo admin/owner, y solo si hay algo real que
      // borrar ese día (no tiene sentido en un día libre, ahí no hay datos).
      const esAdminOOwner = myProfile && (myProfile.role==='admin' || myProfile.role==='owner');
      const deleteBtnHtml = (esAdminOOwner && !isRest && dayEvents.length)
        ? `<td><button type="button" class="session-delete-btn mc-day-delete-btn" data-fecha="${d}" data-nombre="${(nombre||'').replace(/"/g,'&quot;')}" title="${t('eliminarDiaCompleto')}">🗑</button></td>`
        : '<td></td>';
      return `<tr class="${rowClass}">
        <td class="mono">${dateStr}</td>
        <td class="mono" style="font-weight:700;${match?'color:var(--gold-bright);':''}">${mdLabel}</td>
        <td>${nombre}</td>
        <td class="mono">${isRest || distAvg===null ? '—' : fmt(Math.round(distAvg))}</td>
        <td class="mono">${isRest || hsrAvg===null ? '—' : fmt(Math.round(hsrAvg))}</td>
        <td class="mono">${isRest || plAvg===null ? '—' : fmt(Math.round(plAvg))}</td>
        <td class="mono">${isRest || rhieAvg===null ? '—' : fmt(Math.round(rhieAvg))}</td>
        <td class="mono" style="${intensityColor}">${intensityPct===null ? '—' : intensityPct+'%'}</td>
        ${deleteBtnHtml}
      </tr>`;
    }).join('');
    let cycleLabel;
    if(matchDate && byDate[matchDate] && byDate[matchDate].some(e=>e.tipo==='Partido')){
      cycleLabel = tf('cicloVs', {r:byDate[matchDate].find(e=>e.tipo==='Partido').detalle, d:matchDate.split('-').reverse().join('/')});
    } else if(matchIsManual){
      cycleLabel = tf('cicloProximoPartido', {d:matchDate.split('-').reverse().join('/')});
    } else {
      cycleLabel = t('bloqueSinPartido');
    }
    const avgIntensity = intensityValues.length ? Math.round(intensityValues.reduce((a,b)=>a+b,0)/intensityValues.length) : null;
    // Si el ciclo no tiene ningún dato real (por ejemplo, es solo un día libre suelto sin entrenos ni partido),
    // no tiene sentido mostrar la fila de total con puros guiones — se omite directamente.
    const tieneDatos = cycleTotal>0 || hsrTotal>0 || plTotal>0 || (matchDate && byDate[matchDate] && byDate[matchDate].some(e=>e.tipo==='Partido'));
    if(!tieneDatos) return dayRows;
    // Botón de informe solo en ciclos que ya tienen algo de datos reales (sin sentido en un bloque vacío),
    // visible para cualquiera — el informe es de lectura, no una acción destructiva como el borrado de día.
    const reportBtnHtml = `<button type="button" class="mc-report-btn-row" data-cycle-idx="${i}" title="${t('generarInforme')}">📄</button>`;
    return `${dayRows}<tr class="mc-total"><td colspan="3">${cycleLabel} · ${t('totalMicrociclo')}</td><td class="mono">${cycleTotal>0 ? fmt(Math.round(cycleTotal))+' m' : '—'}</td><td class="mono">${hsrTotal>0 ? fmt(Math.round(hsrTotal))+' m' : '—'}</td><td class="mono">${plTotal>0 ? fmt(Math.round(plTotal)) : '—'}</td><td class="mono">${rhieTotal>0 ? fmt(Math.round(rhieTotal)) : '—'}</td><td class="mono">${avgIntensity===null ? '—' : avgIntensity+'% '+t('promAbrev')}</td><td>${reportBtnHtml}</td></tr>`;
  }).join('');
  box.innerHTML = `<table class="mc-table">
    <thead><tr><th>${t('colFecha')}</th><th>${t('colMD')}</th><th>${t('colSesion')}</th><th>${t('colDistProm')}</th><th>${t('colHsrProm')}</th><th>${t('colPlProm')}</th><th>${t('colRhieProm')}</th><th>${t('colIntensidad')}</th><th></th></tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>`;
  box.querySelectorAll('.mc-report-btn-row').forEach(btn=>{
    btn.onclick = (e)=>{ e.stopPropagation(); generateMicrocycleReportPDF(Number(btn.dataset.cycleIdx)); };
  });
  box.querySelectorAll('.mc-day-delete-btn').forEach(btn=>{
    btn.onclick = async ()=>{
      const fecha = btn.dataset.fecha;
      const fechaLegible = fecha.split('-').reverse().join('/');
      if(!confirm(tf('confirmarEliminarDiaCompleto', {d: fechaLegible, n: btn.dataset.nombre}))) return;
      btn.disabled = true;
      try{
        // Se borra TODO lo cargado ese día, de todos los jugadores — no un jugador puntual.
        const eventosFinales = ACTIVE_EVENTS.filter(e=> e.fecha!==fecha);
        await saveRemoteData(eventosFinales, ACTIVE_TEAMTOTALS);
        ACTIVE_EVENTS = eventosFinales;
        deriveAll(ACTIVE_EVENTS);
        renderAll(state.player);
      }catch(err){
        console.error('Error eliminando el día completo:', err);
        alert(tf('noSePudoGuardar',{e:err.message}));
        btn.disabled = false;
      }
    };
  });
  // Arranca mostrando lo más reciente (abajo del todo) en vez del inicio del historial — mismo criterio
  // que ya usan los gráficos de ACWR con su scroll horizontal.
  const scrollBox = box.closest('.rec-scroll');
  requestAnimationFrame(()=>{ if(scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight; });
}

// ---------- Informe en PDF de UN microciclo ya armado (entre partido y partido, o hasta el próximo) ----------
// Mismo estilo visual que el informe de partido (logo, paleta, tipografía) para que se sientan parte de
// la misma familia de documentos — pero acá el foco es el bloque completo de días, no un partido puntual.
function generateMicrocycleReportPDF(cycleIndex){
  if(typeof window.jspdf === 'undefined'){ alert(t('noSePudoPdf')); return; }
  const {cycles, byDate, lastCycleWasClosed} = computeMicrocycles(categoryFilteredEvents());
  const datesArr = cycles[cycleIndex];
  if(!datesArr) return;
  const lastMatch = getLastMatchInfo(categoryFilteredEvents());

  // Mismo cálculo exacto que en pantalla (buildMicrocycleTable), para que el PDF y la tabla jamás
  // muestren números distintos para el mismo ciclo.
  let matchDate = datesArr.find(d=> (byDate[d]||[]).some(e=>e.tipo==='Partido'));
  let matchIsManual = false;
  if(!matchDate && cycleIndex===cycles.length-1 && NEXT_MATCH_DATE && !lastCycleWasClosed){
    matchDate = NEXT_MATCH_DATE;
    matchIsManual = true;
  }
  const dayDiff = (a,b)=> Math.round((new Date(a+'T00:00:00') - new Date(b+'T00:00:00')) / 86400000);
  let cycleTotal=0, hsrTotal=0, plTotal=0, rhieTotal=0;
  const intensityValues = [];
  const dayRows = datesArr.map(d=>{
    const dayEvents = byDate[d]||[];
    const isRest = dayEvents.some(isRestDayEvent);
    const match = dayEvents.find(e=>e.tipo==='Partido');
    const distAvg = avgField(dayEvents,'dist'), hsrAvg = avgField(dayEvents,'hsr');
    const plAvg = avgField(dayEvents,'pl'), rhieAvg = avgField(dayEvents,'rhie');
    const mminAvg = avgMPerMin(dayEvents);
    if(distAvg!==null) cycleTotal+=distAvg;
    if(hsrAvg!==null) hsrTotal+=hsrAvg;
    if(plAvg!==null) plTotal+=plAvg;
    if(rhieAvg!==null) rhieTotal+=rhieAvg;
    const pcts = [];
    if(distAvg!==null && lastMatch && lastMatch.avgDist) pcts.push(distAvg/lastMatch.avgDist*100);
    if(hsrAvg!==null && lastMatch && lastMatch.avgHsr) pcts.push(hsrAvg/lastMatch.avgHsr*100);
    if(plAvg!==null && lastMatch && lastMatch.avgPl) pcts.push(plAvg/lastMatch.avgPl*100);
    if(mminAvg!==null && lastMatch && lastMatch.avgMMin) pcts.push(mminAvg/lastMatch.avgMMin*100);
    const intensityPct = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length) : null;
    if(intensityPct!==null) intensityValues.push(intensityPct);
    const nombre = isRest ? t('diaLibreMin') : (match ? tf('partidoVs', {r:match.detalle}) : (dayEvents[0]?.detalle || dayEvents[0]?.tipo || '—'));
    let mdLabel = '—';
    if(matchDate && !isRest){
      const diff = dayDiff(matchDate, d);
      mdLabel = diff===0 ? 'MD' : (diff>0 ? `MD-${diff}` : `MD+${Math.abs(diff)}`);
    }
    return {fecha:d, md:mdLabel, nombre, isRest, match:!!match,
      dist: isRest||distAvg===null ? null : Math.round(distAvg),
      hsr: isRest||hsrAvg===null ? null : Math.round(hsrAvg),
      pl: isRest||plAvg===null ? null : Math.round(plAvg),
      rhie: isRest||rhieAvg===null ? null : Math.round(rhieAvg),
      intensidad: intensityPct};
  });
  let cycleLabel;
  if(matchDate && byDate[matchDate] && byDate[matchDate].some(e=>e.tipo==='Partido')){
    cycleLabel = tf('cicloVs', {r:byDate[matchDate].find(e=>e.tipo==='Partido').detalle, d:matchDate.split('-').reverse().join('/')});
  } else if(matchIsManual){
    cycleLabel = tf('cicloProximoPartido', {d:matchDate.split('-').reverse().join('/')});
  } else {
    cycleLabel = t('bloqueSinPartido');
  }
  const avgIntensity = intensityValues.length ? Math.round(intensityValues.reduce((a,b)=>a+b,0)/intensityValues.length) : null;
  const diasConDatos = dayRows.filter(r=>!r.isRest && (r.dist!==null)).length;
  const diasLibres = dayRows.filter(r=>r.isRest).length;

  // ---- comparación contra el ciclo anterior (mismo concepto de "línea base" que ya usa el panel de
  // Objetivo de microciclo: promedio diario de carga, no el total crudo, porque un ciclo más corto no es
  // comparable en bruto contra uno más largo) ----
  const prevArr = cycles[cycleIndex-1];
  let prevComparison = null;
  if(prevArr && prevArr.length){
    let prevTotal=0, prevDiasConDatos=0;
    prevArr.forEach(d=>{
      const dayEvents = byDate[d]||[];
      if(dayEvents.some(isRestDayEvent)) return;
      const distAvg = avgField(dayEvents,'dist');
      if(distAvg!==null){ prevTotal += distAvg; prevDiasConDatos++; }
    });
    if(prevDiasConDatos>0 && diasConDatos>0){
      const prevPorDia = prevTotal/prevDiasConDatos, actualPorDia = cycleTotal/diasConDatos;
      prevComparison = { pct: ((actualPorDia-prevPorDia)/prevPorDia*100) };
    }
  }

  // ---- jugadores con más carga (Player Load acumulado) dentro de este ciclo puntual — ayuda a detectar
  // a quién le tocó más laburo real en estos días, más allá del promedio general del plantel ----
  const TOP_N = 5;
  const rankingCargaDe = (arr)=> players.map(p=>{
    const evsCiclo = (byPlayer[p]||[]).filter(e=> arr.includes(e.fecha) && e.pl!==null && e.pl!==undefined && !isNaN(e.pl));
    if(!evsCiclo.length) return null;
    const plSum = evsCiclo.reduce((a,e)=>a+e.pl,0);
    return {jugador:p, pl:Math.round(plSum), sesiones:evsCiclo.length};
  }).filter(Boolean).sort((a,b)=>b.pl-a.pl);
  const topCarga = rankingCargaDe(datesArr).slice(0,TOP_N);

  // Racha: en cuántos ciclos SEGUIDOS (contando este) el jugador estuvo entre los TOP_N de más carga.
  // Se saltean los bloques que son solo días libres (no tienen carga que rankear).
  const cicloTieneDatos = (arr)=> arr.some(d=> (byDate[d]||[]).some(e=> !isRestDayEvent(e)));
  const ciclosPrevios = cycles.slice(0, cycleIndex).filter(cicloTieneDatos).reverse(); // del más reciente al más viejo
  const topsPrevios = ciclosPrevios.map(arr=> new Set(rankingCargaDe(arr).slice(0,TOP_N).map(r=>r.jugador)));
  const fechaRefAcwr = [...datesArr].reverse().find(d=> (byDate[d]||[]).some(e=> !isRestDayEvent(e))) || datesArr[datesArr.length-1];
  topCarga.forEach(r=>{
    let racha = 1;
    for(const s of topsPrevios){ if(s.has(r.jugador)) racha++; else break; }
    r.racha = racha;
    r.acwr = computeACWR(byPlayer[r.jugador], fechaRefAcwr);
  });

  // ---- récords personales alcanzados DURANTE este ciclo (no en general, solo los que caen en estas
  // fechas puntuales) — mismo criterio que el 🔥 de la lista de Plantel, pero mirando todo el ciclo en
  // vez de un solo día ----
  const recordsDelCiclo = [];
  players.forEach(p=>{
    const rec = recordByPlayer[p];
    if(!rec) return;
    METRIC_ORDER.forEach(m=>{
      if(rec[m] && datesArr.includes(rec[m].fecha)){
        recordsDelCiclo.push({jugador:p, metrica:m, valor:rec[m].valor, fecha:rec[m].fecha, tipo:rec[m].origen, detalle:rec[m].detalle});
      }
    });
  });

  // ---- día de mayor y menor carga del ciclo (solo días con sesión real, no libres) ----
  const diasConCarga = dayRows.filter(r=>!r.isRest && r.pl!==null);
  const diaMasCargado = diasConCarga.length ? diasConCarga.reduce((a,b)=> b.pl>a.pl?b:a) : null;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm', format:'a4'});
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 16;
  let y = 20;
  const ensureSpace = (needed)=>{ if(y + needed > 282){ doc.addPage(); addBrandLogoTopRight(doc, pageW, marginX); y = 20; } };

  addBrandLogoTopRight(doc, pageW, marginX);
  doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.setTextColor(18,33,59);
  doc.text(`${CURRENT_CLUB} — ${t('informeDeMicrociclo')}`, marginX, y);
  y += 7;
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(90,90,90);
  const rango = `${datesArr[0].split('-').reverse().join('/')} – ${datesArr[datesArr.length-1].split('-').reverse().join('/')}`;
  doc.text(doc.splitTextToSize(`${cycleLabel} · ${tf('informeMicrocicloRango',{r:rango, n:diasConDatos})}`, pageW-marginX*2), marginX, y);
  y += 10;
  doc.setDrawColor(220,220,220); doc.line(marginX, y, pageW-marginX, y);
  y += 8;

  // ---- resumen narrativo: sintetiza el ciclo en texto antes de entrar a los números sueltos ----
  ensureSpace(20);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informeMicrocicloResumenTitulo'), marginX, y);
  y += 5.5;
  const partesResumen = [];
  partesResumen.push(tf('informeMicrocicloResumen', {dias: datesArr.length, entrenos: diasConDatos, libres: diasLibres}));
  if(prevComparison){
    partesResumen.push(tf(prevComparison.pct>=0 ? 'informeMicrocicloVsAnteriorSube' : 'informeMicrocicloVsAnteriorBaja', {pct: Math.abs(prevComparison.pct).toFixed(1)}));
  }
  if(diaMasCargado){
    partesResumen.push(tf('informeMicrocicloDiaPico', {d: diaMasCargado.fecha.split('-').reverse().join('/'), n: diaMasCargado.nombre, pl: fmt(diaMasCargado.pl)}));
  }
  if(recordsDelCiclo.length){
    partesResumen.push(tf('informeMicrocicloConRecords', {n: recordsDelCiclo.length}));
  }
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(60,60,60);
  const resumenLines = doc.splitTextToSize(partesResumen.join(' '), pageW-marginX*2);
  doc.text(resumenLines, marginX, y);
  y += resumenLines.length*4.3 + 7;

  // ---- tarjetas de totales del ciclo (paleta propia de la marca, coherente — nada de rojo "alarma" acá,
  // esto es un resumen de carga, no una alerta de riesgo) ----
  ensureSpace(30);
  const cards = [
    {label:t('colDistProm').replace(' (M)',''), value: cycleTotal>0?`${fmt(Math.round(cycleTotal))} m`:'—', color:[15,76,117]},
    {label:t('colHsrProm').replace(' (M)',''), value: hsrTotal>0?`${fmt(Math.round(hsrTotal))} m`:'—', color:[88,61,145]},
    {label:t('colPlProm'), value: plTotal>0?fmt(Math.round(plTotal)):'—', color:[18,33,59]},
    {label:t('colRhieProm'), value: rhieTotal>0?fmt(Math.round(rhieTotal)):'—', color:[14,98,94]},
    {label:t('colIntensidad'), value: avgIntensity===null?'—':`${avgIntensity}%`, color: avgIntensity!==null && avgIntensity>100 ? [164,41,31] : [15,76,117]},
  ];
  const cardW = (pageW - marginX*2 - 4*4)/5, cardH = 24;
  cards.forEach((c,i)=>{
    const x = marginX + i*(cardW+4);
    doc.setFillColor(...c.color);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold'); doc.setFontSize(12.5);
    doc.text(c.value, x+cardW/2, y+11, {align:'center'});
    doc.setFont('helvetica','normal'); doc.setFontSize(6.6);
    doc.text(doc.splitTextToSize(c.label.toUpperCase(), cardW-4), x+cardW/2, y+17, {align:'center'});
  });
  y += cardH + 6;

  // ---- comparación contra el ciclo anterior (tarjeta chica, solo si hay con qué comparar) ----
  if(prevComparison){
    ensureSpace(14);
    const pct = prevComparison.pct;
    const color = pct>20 ? [164,41,31] : pct<-20 ? [192,87,15] : [14,98,94];
    doc.setFillColor(...color);
    doc.roundedRect(marginX, y, pageW-marginX*2, 10, 2, 2, 'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text(`${t('informeMicrocicloVsAnteriorTitulo')}: ${pct>=0?'+':''}${pct.toFixed(1)}%`, marginX+4, y+6.5);
    y += 14;
  }
  y += 4;

  // ---- tabla día por día (mismo contenido que en pantalla) ----
  ensureSpace(14);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informeMicrocicloDiaADia'), marginX, y);
  y += 6;
  const colW = [18,11,52,16,16,14,14,16]; // suma 157mm, con margen cómodo dentro de los 178mm de A4
  const headers = [t('colFecha'),t('colMD'),t('colSesion'),t('informeMicrocicloColDist'),t('informeMicrocicloColHsr'),t('colPlProm').replace(' Prom.',''),t('colRhieProm').replace(' Prom.',''),t('informeMicrocicloColInt')];
  const drawHeader = ()=>{
    doc.setFillColor(18,33,59);
    doc.rect(marginX, y, colW.reduce((a,b)=>a+b,0), 7, 'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(7);
    let cx = marginX;
    headers.forEach((h,i)=>{ const txt = doc.splitTextToSize(h, colW[i]-2)[0] || ''; doc.text(txt, cx+2, y+4.8); cx += colW[i]; });
    y += 7;
  };
  drawHeader();
  dayRows.forEach((r,i)=>{
    ensureSpace(7);
    if(y===20) drawHeader(); // si saltó de página, repite el encabezado
    if(i%2===1 && !r.isRest && !r.match){ doc.setFillColor(245,246,250); doc.rect(marginX, y, colW.reduce((a,b)=>a+b,0), 6.2, 'F'); }
    if(r.match){ doc.setFillColor(230,238,250); doc.rect(marginX, y, colW.reduce((a,b)=>a+b,0), 6.2, 'F'); }
    doc.setFont('helvetica', r.match?'bold':'normal'); doc.setFontSize(7.4);
    doc.setTextColor(r.isRest ? 150 : 40, r.isRest?150:40, r.isRest?150:40);
    let cx = marginX;
    const vals = [r.fecha.split('-').reverse().join('/'), r.md, r.nombre,
      r.dist===null?'—':fmt(r.dist), r.hsr===null?'—':fmt(r.hsr), r.pl===null?'—':fmt(r.pl),
      r.rhie===null?'—':fmt(r.rhie), r.intensidad===null?'—':r.intensidad+'%'];
    vals.forEach((v,ci)=>{
      const txt = doc.splitTextToSize(String(v), colW[ci]-3)[0] || '';
      doc.text(txt, cx+2, y+4.3);
      cx += colW[ci];
    });
    y += 6.2;
  });
  y += 8;

  // ---- gráfico de barras: intensidad de cada día del ciclo (% vs. promedio de los últimos 3 partidos) ----
  ensureSpace(72);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
  doc.text(t('informeMicrocicloIntensidadTitulo'), marginX, y);
  y += 5;
  {
    const chartX = marginX + 10, chartW = pageW - marginX*2 - 10, chartH = 42;
    const top = y + 6, base = top + chartH;
    const vals = dayRows.map(r=> r.intensidad);
    const maxVal = Math.max(110, ...vals.filter(v=>v!==null).map(v=>v+10));
    const yMax = Math.ceil(maxVal/20)*20;
    const yOf = (v)=> base - (v/yMax)*chartH;
    // grilla y eje
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(140,140,150);
    for(let g=0; g<=yMax; g+=(yMax>140?40:20)){
      doc.setDrawColor(232,234,240); doc.setLineWidth(0.2);
      doc.line(chartX, yOf(g), chartX+chartW, yOf(g));
      doc.text(`${g}%`, chartX-2, yOf(g)+1.2, {align:'right'});
    }
    // línea de referencia: 100% = carga de un partido
    doc.setDrawColor(164,41,31); doc.setLineWidth(0.35); doc.setLineDashPattern([1.2,1],0);
    doc.line(chartX, yOf(100), chartX+chartW, yOf(100));
    doc.setLineDashPattern([],0);
    doc.setFontSize(6.3); doc.setTextColor(164,41,31);
    doc.text(t('informeMicrocicloRefPartido'), chartX+1, yOf(100)-1.2); // a la izquierda: a la derecha se pisaba con el valor de la barra del partido
    // barras
    const slot = chartW / dayRows.length;
    const barW = Math.min(slot*0.58, 16);
    dayRows.forEach((r,i)=>{
      const cx = chartX + slot*i + slot/2;
      if(r.isRest || r.intensidad===null){
        doc.setFont('helvetica','italic'); doc.setFontSize(6.5); doc.setTextColor(160,160,170);
        doc.text(r.isRest ? t('diaLibreMin') : '—', cx, base-2, {align:'center'});
      } else {
        const v = r.intensidad;
        const col = r.match ? [124,92,252] : v>100 ? [220,38,38] : v>=70 ? [14,116,144] : [148,163,184];
        doc.setFillColor(...col);
        const h = Math.max(0.6, base - yOf(v));
        doc.roundedRect(cx-barW/2, base-h, barW, h, 0.8, 0.8, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...col);
        doc.text(`${v}%`, cx, base-h-1.5, {align:'center'});
      }
      doc.setFont('helvetica','bold'); doc.setFontSize(6.8); doc.setTextColor(18,33,59);
      doc.text(r.md, cx, base+4, {align:'center'});
      doc.setFont('helvetica','normal'); doc.setFontSize(6.2); doc.setTextColor(120,120,130);
      doc.text(r.fecha.slice(5).split('-').reverse().join('/'), cx, base+7.5, {align:'center'});
    });
    doc.setDrawColor(200,200,210); doc.setLineWidth(0.3);
    doc.line(chartX, base, chartX+chartW, base);
    // leyenda
    const ley = [[[124,92,252],t('informeMicrocicloLeyPartido')],[[220,38,38],'>100%'],[[14,116,144],'70–100%'],[[148,163,184],'<70%']];
    let lx = chartX; const ly = base + 12.5;
    doc.setFont('helvetica','normal'); doc.setFontSize(6.6);
    ley.forEach(([col,txt])=>{
      doc.setFillColor(...col); doc.rect(lx, ly-2.2, 2.6, 2.6, 'F');
      doc.setTextColor(90,90,100); doc.text(txt, lx+3.6, ly);
      lx += 6 + doc.getTextWidth(txt) + 4;
    });
    y = ly + 6;
  }
  doc.setDrawColor(220,220,220); doc.setLineWidth(0.2); doc.line(marginX, y, pageW-marginX, y);
  y += 8;

  // ---- jugadores con más carga acumulada en este ciclo puntual ----
  if(topCarga.length){
    ensureSpace(14 + topCarga.length*6);
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
    doc.text(t('informeMicrocicloTopCarga'), marginX, y);
    y += 5;
    doc.setFont('helvetica','bold'); doc.setFontSize(6.6); doc.setTextColor(130,130,140);
    doc.text(t('informeMicrocicloColJugador').toUpperCase(), marginX+10, y+2);
    doc.text(t('informeMicrocicloColSesiones').toUpperCase(), marginX+68, y+2);
    doc.text(t('informeMicrocicloColRacha').toUpperCase(), marginX+92, y+2);
    doc.text('ACWR', marginX+130, y+2);
    doc.text('PLAYER LOAD', pageW-marginX-4, y+2, {align:'right'});
    y += 4;
    const acwrCol = {high:[220,38,38], caution:[202,138,4], optimal:[22,163,74], low:[37,99,235], insuf:[140,140,150]};
    topCarga.forEach((r,i)=>{
      ensureSpace(6);
      if(i%2===1){ doc.setFillColor(245,246,250); doc.rect(marginX, y, pageW-marginX*2, 5.8, 'F'); }
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(18,33,59);
      doc.text(`${i+1}.`, marginX+2, y+4);
      doc.text(doc.splitTextToSize(r.jugador, 56)[0], marginX+10, y+4);
      doc.setFont('helvetica','normal'); doc.setTextColor(90,90,90);
      doc.text(String(r.sesiones), marginX+68, y+4);
      // racha: se resalta desde 2 ciclos seguidos, en rojo desde 3
      const rachaCol = r.racha>=3 ? [220,38,38] : r.racha===2 ? [202,138,4] : [90,90,90];
      doc.setFont('helvetica', r.racha>=2?'bold':'normal'); doc.setTextColor(...rachaCol);
      doc.text(r.racha>=2 ? tf('informeMicrocicloRachaN',{n:r.racha}) : t('informeMicrocicloRachaPrimera'), marginX+92, y+4);
      const st = (r.acwr && r.acwr.status) || 'insuf';
      doc.setFont('helvetica','bold'); doc.setTextColor(...(acwrCol[st]||acwrCol.insuf));
      doc.text(r.acwr && r.acwr.ratio!==null && r.acwr.ratio!==undefined ? `${r.acwr.ratio.toFixed(2)} · ${acwrLabel(st)}` : acwrLabel('insuf'), marginX+130, y+4);
      doc.setTextColor(14,98,94);
      doc.text(`${fmt(r.pl)}`, pageW-marginX-4, y+4, {align:'right'});
      y += 5.8;
    });
    y += 5;

    // ---- cuidados ante carga alta + aviso de jugadores que repiten ----
    const repetidos = topCarga.filter(r=> r.racha>=2);
    const bullets = [t('informeMicrocicloCuidado1'), t('informeMicrocicloCuidado2'), t('informeMicrocicloCuidado3'), t('informeMicrocicloCuidado4'), t('informeMicrocicloCuidado5')];
    const boxW = pageW - marginX*2, innerW = boxW - 10;
    doc.setFont('helvetica','normal'); doc.setFontSize(7.8);
    const riesgoLines = doc.splitTextToSize(t('informeMicrocicloRiesgosTexto'), innerW);
    const bulletLines = bullets.map(b=> doc.splitTextToSize(b, innerW-4));
    doc.setFont('helvetica', repetidos.length?'bold':'normal'); // se mide con la misma fuente con la que se dibuja (la negrita es más ancha)
    const repLines = repetidos.length
      ? repetidos.map(r=> doc.splitTextToSize(tf(r.racha>=3?'informeMicrocicloRepiteFuerte':'informeMicrocicloRepite',{j:r.jugador, n:r.racha}), innerW-4))
      : [doc.splitTextToSize(t('informeMicrocicloSinRepetidos'), innerW)];
    const lh = 3.6;
    const boxH = 8 + riesgoLines.length*lh + 4 + 5 + bulletLines.reduce((a,l)=>a+l.length*lh+0.8,0) + 4 + 5 + repLines.reduce((a,l)=>a+l.length*lh+0.8,0) + 3;
    ensureSpace(boxH+4);
    doc.setFillColor(255,247,237); doc.setDrawColor(234,179,8); doc.setLineWidth(0.4);
    doc.roundedRect(marginX, y, boxW, boxH, 2, 2, 'FD');
    let by = y + 6;
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(146,64,14);
    doc.text(t('informeMicrocicloCuidadosTitulo'), marginX+5, by); by += 5;
    doc.setFont('helvetica','normal'); doc.setFontSize(7.8); doc.setTextColor(70,60,50);
    doc.text(riesgoLines, marginX+5, by); by += riesgoLines.length*lh + 3;
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(146,64,14);
    doc.text(t('informeMicrocicloQueHacer'), marginX+5, by); by += 4.5;
    doc.setFont('helvetica','normal'); doc.setFontSize(7.8); doc.setTextColor(70,60,50);
    bulletLines.forEach(lines=>{
      doc.setFillColor(234,179,8); doc.circle(marginX+6.2, by-1.1, 0.7, 'F');
      doc.text(lines, marginX+9, by); by += lines.length*lh + 0.8;
    });
    by += 3;
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(146,64,14);
    doc.text(t('informeMicrocicloRepiteTitulo'), marginX+5, by); by += 4.5;
    doc.setFont('helvetica', repetidos.length?'bold':'normal'); doc.setFontSize(7.8);
    repLines.forEach((lines,idx)=>{
      const r = repetidos[idx];
      if(r){ doc.setTextColor(...(r.racha>=3?[185,28,28]:[161,98,7])); doc.setFillColor(...(r.racha>=3?[220,38,38]:[202,138,4])); doc.circle(marginX+6.2, by-1.1, 0.8, 'F'); doc.text(lines, marginX+9, by); }
      else { doc.setTextColor(70,60,50); doc.text(lines, marginX+5, by); }
      by += lines.length*lh + 0.8;
    });
    y += boxH + 4;
    doc.setFont('helvetica','italic'); doc.setFontSize(6.6); doc.setTextColor(140,140,150);
    doc.text(doc.splitTextToSize(t('informeMicrocicloCuidadosNota'), boxW), marginX, y);
    y += 8;
  }

  // ---- récords personales alcanzados durante este ciclo (si hubo alguno) ----
  if(recordsDelCiclo.length){
    recordsDelCiclo.sort((a,b)=> a.fecha.localeCompare(b.fecha) || a.jugador.localeCompare(b.jugador));
    ensureSpace(16);
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(18,33,59);
    doc.text(t('informeMicrocicloRecords'), marginX, y);
    y += 5;
    doc.setFont('helvetica','bold'); doc.setFontSize(6.6); doc.setTextColor(130,130,140);
    doc.text(t('informeMicrocicloColJugador').toUpperCase(), marginX+10, y+2);
    doc.text(t('informeMicrocicloColMetrica').toUpperCase(), marginX+58, y+2);
    doc.text(t('colFecha').toUpperCase(), marginX+88, y+2);
    doc.text(t('colSesion').toUpperCase(), marginX+107, y+2);
    doc.text(t('informeMicrocicloColValor').toUpperCase(), pageW-marginX-4, y+2, {align:'right'});
    y += 4;
    recordsDelCiclo.forEach((r,i)=>{
      ensureSpace(6);
      if(i%2===1){ doc.setFillColor(245,246,250); doc.rect(marginX, y, pageW-marginX*2, 5.6, 'F'); }
      // jsPDF con Helvetica no soporta emoji: círculo dibujado a mano en su lugar.
      doc.setFillColor(192,87,15);
      doc.circle(marginX+2.3, y+3, 1.3, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(7.8); doc.setTextColor(18,33,59);
      doc.text(doc.splitTextToSize(r.jugador, 46)[0], marginX+10, y+4);
      doc.setFont('helvetica','normal'); doc.setTextColor(90,90,90);
      const metLabel = (METRICS[r.metrica] && METRICS[r.metrica].label) ? METRICS[r.metrica].label : r.metrica;
      doc.text(doc.splitTextToSize(metLabel, 28)[0], marginX+58, y+4);
      doc.text(r.fecha.split('-').reverse().join('/'), marginX+88, y+4);
      const esPartido = r.tipo==='Partido';
      const sesionTxt = r.detalle ? (esPartido ? `vs ${r.detalle}` : r.detalle) : (r.tipo || '—');
      doc.setFont('helvetica', esPartido?'bold':'normal'); doc.setTextColor(...(esPartido?[108,52,131]:[90,90,90]));
      doc.text(doc.splitTextToSize(sesionTxt, pageW-marginX-4-16-(marginX+107))[0] || '', marginX+107, y+4);
      doc.setFont('helvetica','bold'); doc.setTextColor(18,33,59);
      const dec = (METRICS[r.metrica] && METRICS[r.metrica].dec) || 0;
      doc.text(dec ? Number(r.valor).toFixed(dec) : fmt(r.valor), pageW-marginX-4, y+4, {align:'right'});
      y += 5.6;
    });
    y += 4;
  }

  const fname = `Microciclo_${cycleLabel.replace(/[^a-zA-Z0-9]+/g,'_')}.pdf`;
  doc.save(fname);
}
