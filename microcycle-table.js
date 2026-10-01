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

  // ---- tarjetas de totales del ciclo ----
  const cards = [
    {label:t('colDistProm').replace(' (M)',''), value: cycleTotal>0?`${fmt(Math.round(cycleTotal))} m`:'—', color:[21,63,99]},
    {label:t('colHsrProm').replace(' (M)',''), value: hsrTotal>0?`${fmt(Math.round(hsrTotal))} m`:'—', color:[108,52,131]},
    {label:t('colPlProm'), value: plTotal>0?fmt(Math.round(plTotal)):'—', color:[18,33,59]},
    {label:t('colRhieProm'), value: rhieTotal>0?fmt(Math.round(rhieTotal)):'—', color:[14,90,78]},
    {label:t('colIntensidad'), value: avgIntensity===null?'—':`${avgIntensity}%`, color:[164,41,31]},
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
  y += cardH + 10;

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
  y += 3;
  doc.setDrawColor(220,220,220); doc.line(marginX, y, pageW-marginX, y);
  y += 6;

  // ---- resumen corto ----
  ensureSpace(14);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.6); doc.setTextColor(90,90,90);
  const resumen = tf('informeMicrocicloResumen', {dias: datesArr.length, entrenos: diasConDatos, libres: diasLibres});
  doc.text(doc.splitTextToSize(resumen, pageW-marginX*2), marginX, y);

  const fname = `Microciclo_${cycleLabel.replace(/[^a-zA-Z0-9]+/g,'_')}.pdf`;
  doc.save(fname);
}
