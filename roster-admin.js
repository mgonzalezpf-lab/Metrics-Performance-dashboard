// ---------- Admin: agregar jugador manualmente a la lista (antes de tener datos de GPS) ----------
async function getRosterExtraNames(){
  const {data,error} = await supabaseClient.from('roster_players').select('player_name,is_goalkeeper,categoria,activo').eq('club',CURRENT_CLUB);
  if(error) return [];
  // Los jugadores archivados (activo=false, "ya no están en el club") se sacan de todos lados donde se arma
  // el plantel activo — pero sin borrar nada de su historial de GPS/RPE/Wellness ya cargado.
  ARCHIVED_PLAYERS = new Set((data||[]).filter(r=>r.activo===false).map(r=>normalizeNameKey(r.player_name)));
  const activos = (data||[]).filter(r=>r.activo!==false);
  ROSTER_GK_NAMES = activos.filter(r=>r.is_goalkeeper).map(r=>r.player_name);
  activos.forEach(r=>{ if(r.categoria) ROSTER_CATEGORIES[normalizeNameKey(r.player_name)] = r.categoria; });
  const visibles = activos.filter(r => matchesCurrentCategory(r.player_name));
  return visibles.map(r=>r.player_name);
}
// Compara nombres ignorando tildes, mayúsculas y espacios de más — para que "Matías Cofré"
// y "Matias Cofre " (escritos distinto en el roster manual vs los datos de GPS) se traten
// como la misma persona en vez de aparecer duplicados en las tablas de RPE/Wellness.
function normalizeNameKey(name){
  return String(name||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim().replace(/\s+/g,' ')
    .toLowerCase();
}
function mergePlayerNames(conDatos, extra){
  const map = new Map();
  [...extra, ...conDatos].forEach(name=>{
    const key = normalizeNameKey(name);
    if(key) map.set(key, name); // último en escribir gana; lo pisamos abajo con la versión "oficial"
  });
  conDatos.forEach(name=>{
    const key = normalizeNameKey(name);
    if(key) map.set(key, name); // la versión de los datos de GPS siempre queda como la mostrada
  });
  return [...map.values()].sort();
}
// Botón de "Actualizar datos" — visible solo para admin/owner, Y solo si el club tiene GPS habilitado
// (si el club solo tiene RPE+Wellness contratado, no tiene sentido mostrarle el botón de subir CSV de GPS).
function setupUploadButtons(){
  const uploadBtn = document.getElementById('uploadBtn');
  const isAdminOrOwner = myProfile && (myProfile.role==='admin' || myProfile.role==='owner');
  if(uploadBtn) uploadBtn.style.display = (isAdminOrOwner && CLUB_FEATURES.gps) ? 'inline-block' : 'none';
}
// Selector de categoría (fútbol base con varias categorías, ej: U16/U18/U20, dentro del mismo club) —
// visible solo para admin/owner. Cambiar la categoría vuelve a calcular todo el dashboard filtrado a esa categoría.
function setupCategorySelector(){
  const wrap = document.getElementById('categorySelectorWrap');
  const select = document.getElementById('categorySelector');
  const isAdminOrOwner = myProfile && (myProfile.role==='admin' || myProfile.role==='owner');
  if(!wrap || !select) return;
  wrap.style.display = isAdminOrOwner ? 'inline-block' : 'none';
  select.value = CURRENT_CATEGORY || '';
  select.onchange = async ()=>{
    CURRENT_CATEGORY = select.value || null;
    const prevPlayer = state.player;
    await getRosterExtraNames(); // refresca ROSTER_CATEGORIES y filtra rosterExtra por la nueva categoría
    await loadGkData(); // vuelve a calcular deriveGkData ya filtrado
    deriveAll(ACTIVE_EVENTS);
    renderAll(prevPlayer);
    // Wellness se carga aparte (no forma parte de renderAll) — si está la pestaña abierta, hay que refrescarla a mano,
    // si no, se queda mostrando el filtro de categoría anterior hasta que se vuelva a abrir esa pestaña.
    if(typeof currentAdminTab!=='undefined' && currentAdminTab==='wellness'){ buildWellnessTeamList(document.getElementById('wellnessDatePicker')?.value); buildWellnessTrendChart(); }
    if(typeof currentAdminTab!=='undefined' && currentAdminTab==='eficiencia'){ buildEfficiencyRanking(); const dp=document.getElementById('eficienciaDetailPanel'); if(dp) dp.style.display='none'; }
  };
}
function setupManageRosterBar(){
  if(!(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'))) return;
  const wrap = document.getElementById('manageRosterWrap');
  if(wrap) wrap.style.display = 'inline-block';
  const btn = document.getElementById('manageRosterBtn');
  const modal = document.getElementById('manageRosterModal');
  const closeBtn = document.getElementById('manageRosterClose');
  if(btn) btn.onclick = ()=>{ modal.style.display='flex'; buildManageRosterList(); buildCategoryVisibilityToggles(); buildMergePlayersPanel(); };
  if(closeBtn) closeBtn.onclick = ()=>{ modal.style.display='none'; };
  if(modal) modal.onclick = (e)=>{ if(e.target===modal) modal.style.display='none'; };
}
// Segundo nivel de "ocultar números a jugadores" — por categoría puntual. A diferencia del interruptor
// general (que sigue siendo exclusivo del Owner, en la pantalla Clubes), este lo maneja el propio Admin
// del club, sin depender de que el Owner entre a tocarlo. Las categorías son las mismas 3 fijas que ya usa
// el selector de arriba (U16/U18/U20) — si en algún momento las categorías dejan de ser un set fijo, esto
// hay que revisarlo.
function buildCategoryVisibilityToggles(){
  const panel = document.getElementById('categoryVisibilityPanel');
  const box = document.getElementById('categoryVisibilityToggles');
  if(!panel || !box) return;
  if(!(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'))){ panel.style.display='none'; return; }
  panel.style.display='';
  const categorias = ['U16','U18','U20'];
  box.innerHTML = categorias.map(cat=>{
    const oculto = !!(CATEGORY_VISIBILITY && CATEGORY_VISIBILITY[cat]);
    const visible = !oculto;
    return `<button type="button" class="category-visibility-toggle" data-cat="${cat}"
      style="padding:5px 10px;border-radius:7px;font:700 11px 'IBM Plex Mono';cursor:pointer;
      border:1px solid ${visible?'var(--good)':'var(--line-strong)'};
      background:${visible?'rgba(52,211,153,.15)':'transparent'};
      color:${visible?'var(--good)':'var(--mist)'};">${visible?'✓':'✗'} ${cat}</button>`;
  }).join('');
  box.querySelectorAll('.category-visibility-toggle').forEach(btn=>{
    btn.onclick = async ()=>{
      const cat = btn.dataset.cat;
      const nuevoOculto = !(CATEGORY_VISIBILITY && CATEGORY_VISIBILITY[cat]); // invierte: si estaba visible, ahora se oculta
      btn.disabled = true;
      try{
        CATEGORY_VISIBILITY = await saveCategoryVisibility(CURRENT_CLUB, cat, nuevoOculto);
        buildCategoryVisibilityToggles();
        applyPlayerModeUI(); // por si se está previsualizando como un jugador de esa categoría ahora mismo
      }catch(err){
        alert(tf('noSePudoGuardar',{e:err.message}));
        btn.disabled = false;
      }
    };
  });
}
async function buildManageRosterList(){
  const listEl = document.getElementById('manageRosterList');
  if(!listEl) return;
  listEl.innerHTML = `<div style="color:var(--mist);font-size:12px;padding:10px 0;">${t('cargando')}</div>`;
  const {data, error} = await supabaseClient.from('roster_players').select('player_name,is_goalkeeper,categoria,activo').eq('club', CURRENT_CLUB);
  if(error){ listEl.innerHTML = `<div style="color:var(--bad);font-size:12px;">${tf('noSePudoGuardar',{e:error.message})}</div>`; return; }
  const rosterMap = new Map();
  (data||[]).forEach(r=> rosterMap.set(normalizeNameKey(r.player_name), {name:r.player_name, is_goalkeeper:!!r.is_goalkeeper, categoria:r.categoria||'', activo:r.activo!==false}));
  // Nombres que solo existen en el GPS todavía (nunca se agregaron a mano ni se etiquetaron) — también
  // tienen que poder editarse/archivarse acá, aunque no tengan fila propia en roster_players todavía.
  (ACTIVE_EVENTS||[]).forEach(e=>{
    const key = normalizeNameKey(e.jugador);
    if(key && !rosterMap.has(key)) rosterMap.set(key, {name:e.jugador, is_goalkeeper:false, categoria:'', activo:true});
  });
  const rows = [...rosterMap.values()].sort((a,b)=> a.name.localeCompare(b.name));
  if(!rows.length){ listEl.innerHTML = `<div style="color:var(--mist);font-size:12px;padding:10px 0;">${t('sinJugadoresTodavia')}</div>`; return; }
  listEl.innerHTML = rows.map(r=>{
    return `<div class="manage-roster-row" data-original-name="${r.name.replace(/"/g,'&quot;')}" style="display:flex;gap:6px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);opacity:${r.activo?'1':'.5'};flex-wrap:wrap;">
      <input type="text" class="mr-name" value="${r.name.replace(/"/g,'&quot;')}" style="flex:2;min-width:130px;padding:6px 8px;border-radius:6px;border:1px solid var(--line-strong);background:var(--pitch-950);color:var(--bone);font:12.5px 'IBM Plex Sans';">
      <select class="mr-categoria" style="padding:6px 6px;border-radius:6px;border:1px solid var(--line-strong);background:var(--pitch-950);color:var(--bone);font:11.5px 'IBM Plex Sans';">
        <option value="" ${!r.categoria?'selected':''}>${t('sinCategoria')}</option>
        <option value="U16" ${r.categoria==='U16'?'selected':''}>U16</option>
        <option value="U18" ${r.categoria==='U18'?'selected':''}>U18</option>
        <option value="U20" ${r.categoria==='U20'?'selected':''}>U20</option>
      </select>
      <label style="font-size:11px;color:var(--mist);display:flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap;">
        <input type="checkbox" class="mr-gk" ${r.is_goalkeeper?'checked':''} style="width:13px;height:13px;cursor:pointer;"> 🧤
      </label>
      <button class="upload-btn mr-save" title="${t('guardar')}" style="padding:5px 9px;font-size:11px;">💾</button>
      <button class="upload-btn mr-toggle" style="padding:5px 9px;font-size:11px;white-space:nowrap;${r.activo?'':'border-color:var(--good);color:var(--good);'}">${r.activo ? '🗑️ '+t('archivar') : '↩️ '+t('reactivar')}</button>
      <span class="mr-status" style="font-size:10.5px;color:var(--mist);width:100%;"></span>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.manage-roster-row').forEach(row=>{
    const originalName = row.dataset.originalName;
    const statusEl = row.querySelector('.mr-status');
    const refreshEverything = async ()=>{
      await getRosterExtraNames();
      deriveAll(ACTIVE_EVENTS);
      renderAll(state.player);
    };
    row.querySelector('.mr-save').onclick = async ()=>{
      const newName = row.querySelector('.mr-name').value.trim();
      const categoria = row.querySelector('.mr-categoria').value || null;
      const isGk = row.querySelector('.mr-gk').checked;
      if(!newName){ statusEl.textContent = t('escribeUnNombre'); return; }
      statusEl.textContent = t('guardando');
      // "upsert" (en vez de update-y-si-no-existe-insert) evita depender de si la fila ya existía o no —
      // antes, para un jugador que solo venía del GPS (sin fila propia en roster_players), el UPDATE no
      // encontraba nada, y el INSERT de respaldo chocaba con la restricción de nombre único si la fila
      // SÍ existía mientras tanto (esto es lo que le pasaba a los usuarios: "duplicate key value...").
      const {error:upsertError} = await supabaseClient.from('roster_players')
        .upsert({club:CURRENT_CLUB, player_name:originalName, categoria, is_goalkeeper:isGk}, {onConflict:'club,player_name'});
      let saveError = upsertError;
      // Si además cambiaron el nombre, se renombra en un segundo paso (el upsert de arriba ya guardó categoría/arquero).
      if(!saveError && newName !== originalName){
        const ren = await supabaseClient.from('roster_players').update({player_name:newName}).eq('club',CURRENT_CLUB).eq('player_name', originalName);
        saveError = ren.error;
      }
      if(saveError){ statusEl.textContent = saveError.code==='23505' ? t('nombreYaEnLista') : tf('noSePudoGuardar',{e:saveError.message}); return; }
      statusEl.textContent = t('guardadoCheck');
      row.dataset.originalName = newName;
      await refreshEverything();
    };
    row.querySelector('.mr-toggle').onclick = async ()=>{
      const nuevoActivo = row.querySelector('.mr-toggle').textContent.includes(t('reactivar'));
      statusEl.textContent = nuevoActivo ? t('reactivando') : t('archivando');
      const {error:saveError} = await supabaseClient.from('roster_players')
        .upsert({club:CURRENT_CLUB, player_name:originalName, activo:nuevoActivo}, {onConflict:'club,player_name'});
      if(saveError){ statusEl.textContent = tf('noSePudoGuardar',{e:saveError.message}); return; }
      statusEl.textContent = nuevoActivo ? t('reactivadoCheck') : t('archivadoCheck');
      await refreshEverything();
      setTimeout(()=>{ buildManageRosterList(); }, 1100); // deja tiempo para leer el mensaje antes de refrescar la lista entera
    };
  });
}
function setupAddPlayerBar(){
  if(!(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'))) return;
  const wrap = document.getElementById('addPlayerWrap');
  wrap.style.display = 'inline-block';
  const btn = document.getElementById('addPlayerBtn');
  const form = document.getElementById('addPlayerForm');
  const input = document.getElementById('addPlayerInput');
  const isGkCheckbox = document.getElementById('addPlayerIsGk');
  const categoriaSelect = document.getElementById('addPlayerCategoria');
  const status = document.getElementById('addPlayerStatus');
  btn.onclick = ()=>{ form.style.display = form.style.display==='block' ? 'none' : 'block'; };
  document.getElementById('addPlayerSubmit').onclick = async ()=>{
    const name = input.value.trim();
    if(!name){ status.textContent='Escribe un nombre.'; return; }
    status.textContent = 'Agregando…';
    const {error} = await supabaseClient.from('roster_players').insert({club:CURRENT_CLUB, player_name:name, is_goalkeeper:isGkCheckbox.checked, categoria: categoriaSelect.value || null});
    if(error){
      status.textContent = error.code==='23505' ? t('nombreYaEnLista') : tf('noSePudoGuardar',{e:error.message});
      return;
    }
    status.textContent = tf('nombreAgregado', {n:name});
    input.value='';
    isGkCheckbox.checked = false;
    categoriaSelect.value = '';
  };
  document.addEventListener('click',(e)=>{ if(!wrap.contains(e.target)) form.style.display='none'; });
}

// ---------- Admin: fijar manualmente la fecha del próximo partido (para el conteo MD del microciclo) ----------
function setupNextMatchBar(){
  if(!(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'))) return;
  const wrap = document.getElementById('nextMatchWrap');
  wrap.style.display = 'flex';
  const btn = document.getElementById('nextMatchBtn');
  const form = document.getElementById('nextMatchForm');
  const input = document.getElementById('nextMatchInput');
  const status = document.getElementById('nextMatchStatus');
  const label = document.getElementById('nextMatchLabel');
  const refreshLabel = ()=>{
    label.textContent = NEXT_MATCH_DATE ? tf('proximoPartidoLabel', {d:NEXT_MATCH_DATE.split('-').reverse().join('/')}) : '';
  };
  refreshLabel();
  if(NEXT_MATCH_DATE) input.value = NEXT_MATCH_DATE;
  btn.onclick = ()=>{ form.style.display = form.style.display==='block' ? 'none' : 'block'; };
  document.getElementById('nextMatchSubmit').onclick = async ()=>{
    const dateVal = input.value;
    if(!dateVal){ status.textContent=t('eligeUnaFecha'); return; }
    status.textContent = t('guardando');
    const {error} = await supabaseClient.from('app_settings')
      .upsert({club:CURRENT_CLUB, key:'next_match_date', value:dateVal, updated_at:new Date().toISOString()}, {onConflict:'club,key'});
    if(error){ status.textContent = tf('noSePudoGuardar',{e:error.message}); return; }
    NEXT_MATCH_DATE = dateVal;
    status.textContent = t('fechaGuardada');
    refreshLabel();
    buildMicrocycleTable();
  };
  document.addEventListener('click',(e)=>{ if(!wrap.contains(e.target)) form.style.display='none'; });
}

// ---------- Admin: marcar un día libre (sin necesitar ningún CSV) — inserta un evento liviano por jugador,
// con detalle "Día libre", para que computeMicrocycles() lo reconozca y cierre bien los ciclos ----------
function setupRestDayBar(){
  if(!(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'))) return;
  const btn = document.getElementById('restDayBtn');
  const form = document.getElementById('restDayForm');
  const input = document.getElementById('restDayInput');
  const status = document.getElementById('restDayStatus');
  if(!btn || !form || !input || !status) return;
  const refreshSubmitLabelRef = { current: null };
  btn.onclick = ()=>{
    form.style.display = form.style.display==='block' ? 'none' : 'block';
    if(form.style.display==='block' && refreshSubmitLabelRef.current) refreshSubmitLabelRef.current();
  };
  // Si la fecha elegida ya está marcada como día libre, el botón pasa a "Desmarcar" — mismo input,
  // mismo botón, sin tener que ir a buscar otra pantalla para deshacerlo.
  const submitBtn = document.getElementById('restDaySubmit');
  const refreshSubmitLabel = ()=>{
    const dateVal = input.value;
    const eventosDelDia = dateVal ? ACTIVE_EVENTS.filter(e=>e.fecha===dateVal) : [];
    const esDiaLibreActual = eventosDelDia.length>0 && eventosDelDia.every(isRestDayEvent);
    submitBtn.textContent = esDiaLibreActual ? t('desmarcarDiaLibre') : t('marcarDiaLibreBtn');
  };
  input.addEventListener('input', refreshSubmitLabel);
  input.addEventListener('change', refreshSubmitLabel);
  refreshSubmitLabelRef.current = refreshSubmitLabel;
  document.getElementById('restDaySubmit').onclick = async ()=>{
    const dateVal = input.value;
    if(!dateVal){ status.textContent=t('eligeUnaFecha'); return; }
    const eventosDelDia = ACTIVE_EVENTS.filter(e=>e.fecha===dateVal);
    const esDiaLibreActual = eventosDelDia.length>0 && eventosDelDia.every(isRestDayEvent);
    // Si ya hay datos reales cargados ese día (entreno/partido con GPS), no lo tocamos — solo se puede
    // marcar/desmarcar libremente cuando el día está vacío o ya es un día libre puesto por acá mismo.
    if(eventosDelDia.length>0 && !esDiaLibreActual){ status.textContent=t('sesionYaCargadaEseDia'); return; }
    if(!esDiaLibreActual && !players.length){ status.textContent=t('noHayJugadoresCargados'); return; }
    status.textContent = t('guardando');
    let eventosFinales, mensajeExito;
    if(esDiaLibreActual){
      eventosFinales = ACTIVE_EVENTS.filter(e=>e.fecha!==dateVal);
      mensajeExito = t('diaLibreDesmarcado');
    } else {
      const nuevosEventos = players.map(p=>({
        fecha:dateVal, jugador:p, tipo:'Entreno', detalle:'Día libre',
        dist:null, hsr:null, vel:null, acc:null, desa:null, pl:null, min:null,
        alta_int:null, sprint:null, sprint_count:null, rhie:null,
      }));
      eventosFinales = [...ACTIVE_EVENTS, ...nuevosEventos];
      mensajeExito = t('diaLibreMarcado');
    }
    try{
      const prevPlayer = state.player;
      ACTIVE_EVENTS = eventosFinales;
      await saveRemoteData(ACTIVE_EVENTS, ACTIVE_TEAMTOTALS);
      saveData(ACTIVE_EVENTS, ACTIVE_TEAMTOTALS);
      deriveAll(ACTIVE_EVENTS);
      renderAll(prevPlayer);
      status.textContent = mensajeExito;
      input.value = '';
      refreshSubmitLabel();
      setTimeout(()=>{ form.style.display='none'; status.textContent=''; }, 1500);
    }catch(err){
      status.textContent = tf('noSePudoGuardar',{e:err.message});
    }
  };
  document.addEventListener('click',(e)=>{ if(!form.contains(e.target) && !btn.contains(e.target)) form.style.display='none'; });
}

// ---------- Fusionar jugadores duplicados ----------
// Cuando un jugador queda cargado con dos variantes de nombre (ej. "Nicolas Alezcano" vs "nicolaz
// alezcano" — una letra de diferencia entre lo que se tipeó en el roster y lo que trajo el GPS/Wellness),
// aparece duplicado en las listas Y, más importante, sus reportes de Wellness/RPE no calzan con la
// categoría asignada en el roster — por eso "desaparecen" al filtrar por categoría puntual, aunque sí
// aparezcan en "Todas las categorías". Esta herramienta junta todo bajo un solo nombre, sin perder nada.
async function buildMergePlayersPanel(){
  const keepSel = document.getElementById('mergeKeepSelect');
  const dropSel = document.getElementById('mergeDropSelect');
  const btn = document.getElementById('mergePlayersBtn');
  const statusEl = document.getElementById('mergePlayersStatus');
  if(!keepSel || !dropSel || !btn) return;
  const rosterExtra = await getRosterExtraNames();
  const allPlayers = mergePlayerNames(players, rosterExtra).sort((a,b)=>a.localeCompare(b));
  const opts = allPlayers.map(p=>`<option value="${p.replace(/"/g,'&quot;')}">${p}</option>`).join('');
  keepSel.innerHTML = opts;
  dropSel.innerHTML = opts;
  if(allPlayers.length>1) dropSel.selectedIndex = 1; // por defecto no coincide con keepSel, para evitar el caso trivial
  btn.onclick = async ()=>{
    const nombreCanonico = keepSel.value, nombreDuplicado = dropSel.value;
    if(!nombreCanonico || !nombreDuplicado){ statusEl.textContent = t('elegiDosJugadores'); return; }
    if(normalizeNameKey(nombreCanonico)===normalizeNameKey(nombreDuplicado)){ statusEl.textContent = t('sonElMismoNombre'); return; }
    if(!confirm(tf('confirmarFusionarJugadores', {a:nombreDuplicado, b:nombreCanonico}))) return;
    btn.disabled = true; statusEl.textContent = t('fusionando');
    try{
      await mergePlayers(nombreCanonico, nombreDuplicado);
      statusEl.textContent = t('fusionadoCheck');
      await buildMergePlayersPanel();
      await buildManageRosterList();
    }catch(err){
      console.error('Error fusionando jugadores:', err);
      statusEl.textContent = tf('noSePudoGuardar',{e:err.message});
    }finally{
      btn.disabled = false;
    }
  };
}
async function mergePlayers(nombreCanonico, nombreDuplicado){
  // 1) Eventos de GPS: todo lo que estaba bajo el nombre duplicado pasa a quedar bajo el canónico.
  const eventosFinales = ACTIVE_EVENTS.map(e=>
    normalizeNameKey(e.jugador)===normalizeNameKey(nombreDuplicado) ? {...e, jugador: nombreCanonico} : e
  );
  await saveRemoteData(eventosFinales, ACTIVE_TEAMTOTALS);
  ACTIVE_EVENTS = eventosFinales;

  // 2) Reportes de RPE y Wellness — se reescribe el nombre para que vuelvan a calzar con la categoría
  // del roster (esto es justo lo que hace que el jugador "desaparezca" al filtrar por su categoría).
  const {error: errRpe} = await supabaseClient.from('rpe_reports')
    .update({player_name: nombreCanonico}).eq('club', CURRENT_CLUB).eq('player_name', nombreDuplicado);
  if(errRpe) throw errRpe;
  const {error: errWellness} = await supabaseClient.from('wellness_reports')
    .update({player_name: nombreCanonico}).eq('club', CURRENT_CLUB).eq('player_name', nombreDuplicado);
  if(errWellness) throw errWellness;

  // 3) Si el nombre duplicado tenía su propia fila en roster_players (categoría, arquero, etc.), se borra
  // — ya no hace falta, todo el historial quedó unificado bajo el nombre canónico.
  await supabaseClient.from('roster_players').delete().eq('club', CURRENT_CLUB).eq('player_name', nombreDuplicado);

  await getRosterExtraNames();
  deriveAll(ACTIVE_EVENTS);
  renderAll(state.player);
}
