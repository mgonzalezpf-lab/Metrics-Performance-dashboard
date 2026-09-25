// ---------- Arqueros: datos separados de los jugadores de campo (tabla gk_data en Supabase) ----------
function withGkDerivedFields(e){
  return {...e};
}

let GK_EVENTS = [];
let gkPlayers=[], gkByPlayer={}, gkPlayerAvg={}, gkSquadMax={}, gkSquadAvg={}, gkRecordByPlayer={};
function deriveGkData(){
  const gkFiltered = GK_EVENTS.filter(e=> matchesCurrentCategory(e.jugador));
  gkPlayers = [...new Set(gkFiltered.map(e=>e.jugador))].sort();
  gkByPlayer = {};
  gkPlayers.forEach(p=>{ gkByPlayer[p] = gkFiltered.filter(e=>e.jugador===p).sort((a,b)=>a.fecha.localeCompare(b.fecha)); });

  gkPlayerAvg = {};
  gkPlayers.forEach(p=>{
    const evs = lastN(gkByPlayer[p],5);
    gkPlayerAvg[p] = {};
    GK_METRIC_ORDER.forEach(m=> gkPlayerAvg[p][m] = avg(evs,m));
  });

  gkSquadMax = {}; gkSquadAvg = {};
  GK_METRIC_ORDER.forEach(m=>{
    gkSquadMax[m] = Math.max(...gkFiltered.map(e=>e[m]||0), 1);
    gkSquadAvg[m] = avg(gkFiltered,m);
  });

  const gkRecords = computeRecordsFromEvents(gkFiltered, GK_METRIC_ORDER);
  gkRecordByPlayer = {};
  gkRecords.forEach(r=> gkRecordByPlayer[r.jugador]=r);
}

async function saveGkData(gkEvents){
  const rows = gkEvents.map(e=>({
    club: CURRENT_CLUB, fecha:e.fecha, jugador:e.jugador, tipo:e.tipo, detalle:e.detalle,
    dist:e.dist, impact_left:e.impact_left, impact_right:e.impact_right, impact_total:e.impact_total, dives_left:e.dives_left, dives_right:e.dives_right,
    pl:e.pl, min:e.min, vel:e.vel, acc:e.acc, dece:e.dece,
    updated_at: new Date().toISOString()
  }));
  const {error} = await supabaseClient.from('gk_data').upsert(rows, {onConflict:'club,fecha,jugador,tipo'});
  if(error){ console.error('Error guardando datos de arqueros:', error); throw error; }
  GK_EVENTS = gkEvents.map(withGkDerivedFields);
  deriveGkData();
}
async function loadGkData(){
  try{
    const {data, error} = await supabaseClient.from('gk_data').select('*').eq('club', CURRENT_CLUB);
    if(error) throw error;
    GK_EVENTS = (data||[]).map(r=> withGkDerivedFields({fecha:r.fecha, jugador:r.jugador, tipo:r.tipo, detalle:r.detalle,
      dist:r.dist, impact_left:r.impact_left, impact_right:r.impact_right, impact_total:r.impact_total, dives_left:r.dives_left, dives_right:r.dives_right,
      pl:r.pl, min:r.min, vel:r.vel, acc:r.acc, dece:r.dece}));
  }catch(e){ console.warn('No se pudieron cargar los datos de arqueros:', e); GK_EVENTS = []; }
  deriveGkData();
}
let pendingCatapultData = null; // datos parseados del CSV, en espera de que confirmes rival/fecha/tipo en el modal

async function handleFile(file){
  if(!file) return;
  if(file.name.toLowerCase().endsWith('.csv')){
    return handleCatapultCSV(file);
  }
  showStatus('Leyendo '+file.name+'…','');
  try{
    if(typeof XLSX === 'undefined') throw new Error('No se pudo cargar la librería de lectura de Excel (sin conexión).');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array', cellDates:true});
    const events = [];
    if(wb.SheetNames.includes('Session')){
      const rows = XLSX.utils.sheet_to_json(wb.Sheets['Session'], {header:1, raw:true, defval:null});
      for(let i=1;i<rows.length;i++){
        const r = rows[i]; if(!r || !r[1] || !r[0]) continue;
        events.push({ fecha:toISO(r[0]), jugador:String(r[1]).trim(), tipo:'Entreno', detalle:r[2]||'',
          dist:num(r[3]), hsr:num(r[4]), vel:num(r[5]), acc:num(r[6]), desa:num(r[7]), pl:num(r[8]),
          alta_int:num(r[16]), sprint:num(r[17]), sprint_count:num(r[18]), rhie:num(r[19]), min:null });
      }
    }
    if(wb.SheetNames.includes('Partidos')){
      const rows = XLSX.utils.sheet_to_json(wb.Sheets['Partidos'], {header:1, raw:true, defval:null});
      for(let i=1;i<rows.length;i++){
        const r = rows[i]; if(!r || !r[2] || !r[0]) continue;
        events.push({ fecha:toISO(r[0]), jugador:String(r[2]).trim(), tipo:'Partido', detalle:r[1]||'',
          dist:num(r[4]), hsr:num(r[5]), vel:num(r[6]), acc:num(r[7]), desa:num(r[8]), pl:num(r[9]),
          alta_int:num(r[17]), sprint:num(r[18]), sprint_count:num(r[19]), rhie:num(r[20]), min:num(r[3]) });
      }
    }
    if(!events.length) throw new Error('No se encontraron filas en las hojas "Session" ni "Partidos".');

    let teamTotals = ACTIVE_TEAMTOTALS;
    try{
      if(wb.SheetNames.includes('Comparativo GPS')) teamTotals = parseComparativoSheet(wb.Sheets['Comparativo GPS']);
    }catch(err){ console.warn('Comparativo GPS no se pudo leer, se mantienen los totales de partido previos.', err); }

    // Hoja "Porteros" (opcional): datos completamente separados de los jugadores de campo.
    let gkEvents = [];
    if(wb.SheetNames.includes('Porteros')){
      const rows = XLSX.utils.sheet_to_json(wb.Sheets['Porteros'], {header:1, raw:true, defval:null});
      for(let i=1;i<rows.length;i++){
        const r = rows[i]; if(!r || !r[1] || !r[0]) continue;
        gkEvents.push({ fecha:toISO(r[0]), jugador:String(r[1]).trim(), tipo:r[2]||'Entreno', detalle:r[3]||'',
          dist:num(r[4]), impact_left:num(r[5]), impact_right:num(r[6]), dives_left:num(r[7]), dives_right:num(r[8]),
          pl:num(r[9]), min:num(r[10]), vel:num(r[11]), acc:num(r[12]), dece:num(r[13]) });
      }
      if(gkEvents.length) await saveGkData(gkEvents);
    }

    const prevPlayer = state.player;
    ACTIVE_EVENTS = events;
    ACTIVE_TEAMTOTALS = teamTotals;
    await saveRemoteData(ACTIVE_EVENTS, ACTIVE_TEAMTOTALS);
    saveData(ACTIVE_EVENTS, ACTIVE_TEAMTOTALS);
    deriveAll(ACTIVE_EVENTS);
    renderAll(prevPlayer);
    const lastDate = [...new Set(events.map(e=>e.fecha))].sort().pop();
    const gkMsg = gkEvents.length ? ` · ${gkEvents.length} registros de arqueros` : '';
    showStatus(`Datos actualizados ✓ ${events.length} registros · ${players.length} jugadores · última fecha ${lastDate.split('-').reverse().join('/')}${gkMsg}`, 'ok');
  }catch(err){
    console.error(err);
    showStatus('No se pudo leer el archivo: '+err.message, 'error');
  }
}

async function handleCatapultCSV(file){
  showStatus('Leyendo '+file.name+'…','');
  try{
    const text = await file.text();
    const provider = detectCsvProvider(text);
    const parsed = provider === 'playertek' ? parsePlayerTekCSV(text) : parseCatapultCSV(text);
    if(!parsed || !parsed.bySession || !parsed.bySession.length){
      throw new Error('No se encontraron filas de partido/sesión completa en el archivo.');
    }
    pendingCatapultData = parsed;
    document.getElementById('csvImportCount').textContent = parsed.bySession.length;
    document.getElementById('csvImportFecha').value = parsed.fecha || '';
    document.getElementById('csvImportTipo').value = parsed.rivalSugerido ? 'Partido' : 'Entreno';
    const catEl = document.getElementById('csvImportCategoria');
    if(catEl) catEl.value = CURRENT_CATEGORY || ''; // si hay una categoría puntual seleccionada, se propone de entrada
    document.getElementById('csvImportRival').value = parsed.rivalSugerido || '';
    document.getElementById('csvImportDetalle').value = '';
    document.getElementById('csvImportStatus').textContent = '';
    syncCsvImportFields();
    const warnBox = document.getElementById('csvImportWarnings');
    if(parsed.columnasNoEncontradas && parsed.columnasNoEncontradas.length){
      warnBox.style.display = 'block';
      warnBox.innerHTML = `⚠️ Este archivo no trae estas columnas — van a quedar vacías para esta carga:<br>${parsed.columnasNoEncontradas.map(c=>`• ${c}`).join('<br>')}`;
    } else {
      warnBox.style.display = 'none';
      warnBox.innerHTML = '';
    }
    document.getElementById('csvImportModal').style.display = 'flex';
    showStatus('', '');
  }catch(err){
    console.error(err);
    showStatus('No se pudo leer el CSV: '+err.message, 'error');
  }
}

function syncCsvImportFields(){
  const tipoSelect = document.getElementById('csvImportTipo');
  const rivalWrap = document.getElementById('csvImportRivalWrap');
  const detalleWrap = document.getElementById('csvImportDetalleWrap');
  if(!tipoSelect || !rivalWrap || !detalleWrap) return;
  const esPartido = tipoSelect.value === 'Partido';
  rivalWrap.style.display = esPartido ? '' : 'none';
  detalleWrap.style.display = esPartido ? 'none' : '';
}
function setupCsvImportModal(){
  const modal = document.getElementById('csvImportModal');
  const tipoSelect = document.getElementById('csvImportTipo');
  const rivalWrap = document.getElementById('csvImportRivalWrap');
  const detalleWrap = document.getElementById('csvImportDetalleWrap');
  const cancelBtn = document.getElementById('csvImportCancel');
  const confirmBtn = document.getElementById('csvImportConfirm');
  if(!modal || !tipoSelect || !rivalWrap || !detalleWrap || !cancelBtn || !confirmBtn) return; // resguardo: si falta algo, no rompe el resto del arranque
  syncCsvImportFields(); // sincroniza los campos visibles con el valor real del selector (por si el default cambió)
  tipoSelect.onchange = syncCsvImportFields;
  cancelBtn.onclick = ()=>{
    modal.style.display = 'none';
    pendingCatapultData = null;
  };
  confirmBtn.onclick = confirmCatapultImport;
}

async function confirmCatapultImport(){
  const status = document.getElementById('csvImportStatus');
  if(!pendingCatapultData){ status.textContent = t('noHayDatosParaCargar'); return; }
  const tipo = document.getElementById('csvImportTipo').value;
  const rival = document.getElementById('csvImportRival').value.trim();
  const detalle = document.getElementById('csvImportDetalle').value.trim();
  const fecha = document.getElementById('csvImportFecha').value;
  const categoriaEl = document.getElementById('csvImportCategoria');
  const categoriaSeleccionada = categoriaEl ? (categoriaEl.value || null) : null;
  if(!fecha){ status.textContent = t('faltaLaFecha'); return; }
  if(tipo==='Partido' && !rival){ status.textContent = t('faltaNombreRival'); return; }

  status.textContent = t('guardando');
  try{
    const detalleFinal = tipo==='Partido' ? rival : (detalle || 'Entreno');
    const nuevosEventos = pendingCatapultData.bySession
      .filter(r => !isGoalkeeper(r.jugador))   // los arqueros no van a Jugadores de Campo, quedan en gk_data
      .map(r=>({
        fecha, jugador:r.jugador, tipo, detalle:detalleFinal, categoria: categoriaSeleccionada,
        dist:r.dist, hsr:r.hsr, vel:r.vel, acc:r.acc, desa:r.desa, pl:r.pl, min:r.min,
        alta_int:r.hsr, sprint:r.sprint, sprint_count:r.sprint_count, rhie:r.rhie,
      }));

    // Arqueros del mismo CSV: se guardan aparte en gk_data. Impactos y buzos ya vienen del reporte completo de Catapult.
    const nuevosGkEventos = pendingCatapultData.bySession
      .filter(r => isGoalkeeper(r.jugador))
      .map(r=>({
        fecha, jugador:r.jugador, tipo, detalle:detalleFinal, categoria: categoriaSeleccionada,
        dist:r.dist, impact_left:r.impact_left, impact_right:r.impact_right,
        impact_total: (r.impact_left!==null && r.impact_right!==null) ? (r.impact_left + r.impact_right) : null,
        dives_left:r.dives_left, dives_right:r.dives_right,
        pl:r.pl, min:r.min, vel:r.vel, acc:r.acc, dece:r.desa,
      }));
    if(nuevosGkEventos.length){
      const gkKey = (e)=> `${e.jugador}|${e.fecha}|${e.tipo}`;
      const gkNuevasKeys = new Set(nuevosGkEventos.map(gkKey));
      const gkRestantes = GK_EVENTS.filter(e => !gkNuevasKeys.has(gkKey(e)));
      await saveGkData([...gkRestantes, ...nuevosGkEventos]);
    }

    // Merge: sacamos cualquier evento previo del mismo jugador+fecha+tipo (por si se sube el mismo partido 2 veces),
    // y agregamos los nuevos — a diferencia del Excel completo, un CSV de Catapult es UNA sola sesión, no la temporada entera.
    const key = (e)=> `${e.jugador}|${e.fecha}|${e.tipo}`;
    const nuevasKeys = new Set(nuevosEventos.map(key));
    const eventosRestantes = ACTIVE_EVENTS.filter(e => !nuevasKeys.has(key(e)));
    const eventosFinales = [...eventosRestantes, ...nuevosEventos];

    let teamTotalsFinal = ACTIVE_TEAMTOTALS;
    if(tipo==='Partido'){
      const totalsRow = computeCatapultTeamTotals(pendingCatapultData.bySession, pendingCatapultData.byHalf1, pendingCatapultData.byHalf2);
      // Antes esto se guardaba con clave "vs {rival}" tal cual se escribió en este momento — si al resubir
      // el mismo partido (ej. para agregar el 1T/2T) el nombre del rival se tipeaba apenas distinto al de
      // la carga original ("Wanderers" vs "vs Wanderers"), quedaban DOS tarjetas para el mismo partido en
      // vez de una sola actualizada. Por eso, antes de guardar el nuevo, se saca cualquier partido previo con
      // la MISMA FECHA (sea cual sea su nombre) — así una resubida siempre reemplaza, nunca duplica.
      // OJO: en un club con varias categorías, dos categorías distintas pueden jugar el mismo día contra el
      // mismo rival (ej. U18 y U20 vs Osorno el mismo sábado) — eso NO es una resubida del mismo partido,
      // son dos partidos distintos. Por eso la fecha sola no alcanza: solo se borra el previo si además
      // coincide la categoría (o si ninguno de los dos tiene categoría asignada, para clubes sin categorías).
      const teamTotalsSinDuplicado = Object.fromEntries(
        Object.entries(ACTIVE_TEAMTOTALS).filter(([, row]) =>
          !(row.fecha === fecha && (row.categoria || null) === (categoriaSeleccionada || null))
        )
      );
      teamTotalsFinal = {...teamTotalsSinDuplicado, [`vs ${rival}`]: {...totalsRow, fecha, categoria: categoriaSeleccionada}};
    }

    // Si se eligió una categoría para esta carga, se etiqueta también en roster_players — así los jugadores
    // detectados por GPS quedan clasificados automáticamente, sin tener que asignarlos a mano uno por uno.
    if(categoriaSeleccionada){
      const nombresDelArchivo = [...new Set(pendingCatapultData.bySession.map(r=>r.jugador))];
      const filasRoster = nombresDelArchivo.map(nombre => ({club:CURRENT_CLUB, player_name:nombre, categoria:categoriaSeleccionada}));
      await supabaseClient.from('roster_players').upsert(filasRoster, {onConflict:'club,player_name', ignoreDuplicates:false});
    }

    const prevPlayer = state.player;
    ACTIVE_EVENTS = eventosFinales;
    ACTIVE_TEAMTOTALS = teamTotalsFinal;
    await saveRemoteData(ACTIVE_EVENTS, ACTIVE_TEAMTOTALS);
    saveData(ACTIVE_EVENTS, ACTIVE_TEAMTOTALS);
    await getRosterExtraNames(); // refresca ROSTER_CATEGORIES con lo que acabamos de etiquetar
    deriveAll(ACTIVE_EVENTS);
    // El modal se cierra ANTES de renderAll a propósito: varios gráficos (ej. "Evolución del Plantel")
    // ahora se saltan su propia reconstrucción mientras este modal está abierto — una protección que
    // agregamos para que no se rompan si algo los toca por accidente mientras están tapados. Pero acá la
    // actualización SÍ es la legítima, la que tiene que pasar apenas se confirma la carga — así que hay
    // que cerrar el modal primero, para que esa protección no termine bloqueando esta actualización real.
    document.getElementById('csvImportModal').style.display = 'none';
    pendingCatapultData = null;
    renderAll(prevPlayer);
    const gkMsg = nuevosGkEventos.length ? ` · ${nuevosGkEventos.length} arquero(s) en su pestaña` : '';
    showStatus(`Datos de Catapult cargados ✓ ${nuevosEventos.length} jugadores${gkMsg} · ${fecha.split('-').reverse().join('/')}`, 'ok');
  }catch(err){
    console.error(err);
    status.textContent = tf('noSePudoGuardar',{e:err.message});
  }
}

