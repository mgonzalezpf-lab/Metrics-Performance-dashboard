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
    return `${dayRows}<tr class="mc-total"><td colspan="3">${cycleLabel} · ${t('totalMicrociclo')}</td><td class="mono">${cycleTotal>0 ? fmt(Math.round(cycleTotal))+' m' : '—'}</td><td class="mono">${hsrTotal>0 ? fmt(Math.round(hsrTotal))+' m' : '—'}</td><td class="mono">${plTotal>0 ? fmt(Math.round(plTotal)) : '—'}</td><td class="mono">${rhieTotal>0 ? fmt(Math.round(rhieTotal)) : '—'}</td><td class="mono">${avgIntensity===null ? '—' : avgIntensity+'% '+t('promAbrev')}</td><td></td></tr>`;
  }).join('');
  box.innerHTML = `<table class="mc-table">
    <thead><tr><th>${t('colFecha')}</th><th>${t('colMD')}</th><th>${t('colSesion')}</th><th>${t('colDistProm')}</th><th>${t('colHsrProm')}</th><th>${t('colPlProm')}</th><th>${t('colRhieProm')}</th><th>${t('colIntensidad')}</th><th></th></tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>`;
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
