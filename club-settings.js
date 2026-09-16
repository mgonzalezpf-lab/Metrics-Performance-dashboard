// ---------- RPE de sesión ----------
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

// ---------- Descargar la pestaña actualmente visible como PDF ----------

function dateToISO(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
// Si la ventana cruza medianoche (ej. 19:00 a 00:59) y estamos en el tramo de madrugada,
// la sesión "pertenece" al día anterior (el del partido/entreno), no al calendario de hoy.
function sessionDateForWindow(startStr, endStr){
  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  const [sh,sm] = startStr.split(':').map(Number);
  const [eh,em] = endStr.split(':').map(Number);
  const startMin = sh*60+sm, endMin = eh*60+em;
  if(startMin > endMin && nowMin <= endMin){
    const y = new Date(now);
    y.setDate(y.getDate()-1);
    return dateToISO(y);
  }
  return todayISO();
}
async function loadClubFeatures(clubName){
  try{
    const {data} = await supabaseClient.from('app_settings').select('value').eq('club',clubName).eq('key','club_features').maybeSingle();
    if(data && data.value){
      const parsed = JSON.parse(data.value);
      return {gps: parsed.gps!==false, rpe_wellness: parsed.rpe_wellness!==false, active: parsed.active!==false, ocultar_numeros_jugador: parsed.ocultar_numeros_jugador===true};
    }
  }catch(e){ console.warn('No se pudieron cargar las features del club:', e); }
  return {gps:true, rpe_wellness:true, active:true, ocultar_numeros_jugador:false}; // clubes sin configurar todavía: todo activo (compatibilidad)
}
async function saveClubFeature(clubName, key, value){
  const current = await loadClubFeatures(clubName);
  current[key] = value;
  const {error} = await supabaseClient.from('app_settings')
    .upsert({club:clubName, key:'club_features', value:JSON.stringify(current), updated_at:new Date().toISOString()}, {onConflict:'club,key'});
  if(error) throw error;
  return current;
}
// Segundo nivel, más fino: además del interruptor general (arriba), el Owner puede ocultarle los números
// de GPS a los jugadores de UNA categoría puntual (ej. solo U16), sin tocar el resto del club. Es un
// permiso exclusivo del Owner, igual que el general — no lo toca el admin del club.
async function loadCategoryVisibility(clubName){
  try{
    const {data} = await supabaseClient.from('app_settings').select('value').eq('club',clubName).eq('key','category_visibility').maybeSingle();
    if(data && data.value) return JSON.parse(data.value);
  }catch(e){ console.warn('No se pudo cargar la visibilidad por categoría:', e); }
  return {}; // sin configurar todavía = ninguna categoría oculta (compatibilidad)
}
async function saveCategoryVisibility(clubName, categoria, ocultar){
  const current = await loadCategoryVisibility(clubName);
  current[categoria] = ocultar;
  const {error} = await supabaseClient.from('app_settings')
    .upsert({club:clubName, key:'category_visibility', value:JSON.stringify(current), updated_at:new Date().toISOString()}, {onConflict:'club,key'});
  if(error) throw error;
  return current;
}
function applyClubFeaturesToTabs(){
  const btnJ = document.getElementById('tabBtnJugadores');
  const btnA = document.getElementById('tabBtnArqueros');
  const btnC = document.getElementById('tabBtnCarga');
  const btnP = document.getElementById('tabBtnPartidos');
  const btnW = document.getElementById('tabBtnWellness');
  const btnR = document.getElementById('tabBtnRpe');
  const btnE = document.getElementById('tabBtnEficiencia');
  [btnJ,btnA,btnC,btnP].forEach(b=>{ if(b) b.style.display = CLUB_FEATURES.gps ? '' : 'none'; });
  if(btnW) btnW.style.display = CLUB_FEATURES.rpe_wellness ? '' : 'none';
  // Eficiencia GPS-RPE necesita las dos fuentes de datos a la vez, así que solo se muestra si el club
  // tiene ambas habilitadas (sin GPS o sin RPE+Wellness, no hay con qué compararlo).
  if(btnE) btnE.style.display = (CLUB_FEATURES.gps && CLUB_FEATURES.rpe_wellness) ? '' : 'none';
  // El grupo de paneles de RPE vive en un solo lugar del DOM: adentro de Control de Carga si hay GPS
  // (conviven ahí con ACWR/Monotonía/Carga Semanal), o en su propia pestaña si el club no tiene GPS
  // (porque en ese caso "Control de Carga" entero queda oculto y no hay dónde mostrarlo).
  const rpeGroup = document.getElementById('rpePanelsGroup');
  const anchorInCarga = document.getElementById('rpeGroupAnchorInCarga');
  const rpeViewEl = document.getElementById('rpeView');
  if(rpeGroup){
    if(CLUB_FEATURES.gps){ if(anchorInCarga) anchorInCarga.appendChild(rpeGroup); }
    else{ if(rpeViewEl) rpeViewEl.appendChild(rpeGroup); }
    rpeGroup.style.display = CLUB_FEATURES.rpe_wellness ? '' : 'none';
  }
  if(btnR) btnR.style.display = (CLUB_FEATURES.rpe_wellness && !CLUB_FEATURES.gps) ? '' : 'none';
  // Si la pestaña activa quedó oculta por el cambio de features, mandamos a la primera disponible.
  const current = typeof currentAdminTab!=='undefined' ? currentAdminTab : 'jugadores';
  const hiddenNow = (['jugadores','arqueros','carga','partidos'].includes(current) && !CLUB_FEATURES.gps)
    || (current==='wellness' && !CLUB_FEATURES.rpe_wellness)
    || (current==='rpe' && !(CLUB_FEATURES.rpe_wellness && !CLUB_FEATURES.gps))
    || (current==='eficiencia' && !(CLUB_FEATURES.gps && CLUB_FEATURES.rpe_wellness));
  if(hiddenNow && myProfile && myProfile.role!=='player'){
    switchAdminTab(CLUB_FEATURES.gps ? 'jugadores' : (CLUB_FEATURES.rpe_wellness ? 'wellness' : 'clubes'));
  }
}
function setupWellnessWindowBar(){
  if(!(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'))) return;
  const wrap = document.getElementById('wellnessWindowWrap');
  if(!wrap) return;
  wrap.style.display = 'block';
  const btn = document.getElementById('wellnessWindowBtn');
  const form = document.getElementById('wellnessWindowForm');
  const startInput = document.getElementById('wellnessWindowStartInput');
  const endInput = document.getElementById('wellnessWindowEndInput');
  const status = document.getElementById('wellnessWindowStatus');
  const label = document.getElementById('wellnessWindowLabel');
  const refreshLabel = ()=>{ label.textContent = `habilitado ${WELLNESS_WINDOW_START} a ${WELLNESS_WINDOW_END}`; };
  refreshLabel();
  startInput.value = WELLNESS_WINDOW_START;
  endInput.value = WELLNESS_WINDOW_END;
  btn.onclick = ()=>{ form.style.display = form.style.display==='block' ? 'none' : 'block'; };
  document.getElementById('wellnessWindowSubmit').onclick = async ()=>{
    const startVal = startInput.value, endVal = endInput.value;
    if(!startVal || !endVal){ status.textContent = 'Completa las dos horas.'; return; }
    status.textContent = t('guardando');
    const {error} = await supabaseClient.from('app_settings')
      .upsert({club:CURRENT_CLUB, key:'wellness_window', value:JSON.stringify({start:startVal, end:endVal}), updated_at:new Date().toISOString()}, {onConflict:'club,key'});
    if(error){ status.textContent = tf('noSePudoGuardar',{e:error.message}); return; }
    WELLNESS_WINDOW_START = startVal; WELLNESS_WINDOW_END = endVal;
    status.textContent = '✅ Horario guardado.';
    refreshLabel();
  };
  document.addEventListener('click',(e)=>{ if(!wrap.contains(e.target)) form.style.display='none'; });

  const datePicker = document.getElementById('wellnessDatePicker');
  if(datePicker){
    datePicker.value = todayISO();
    datePicker.addEventListener('change', ()=> buildWellnessTeamList(datePicker.value));
  }
}
const RPE_LOCK_MSG = { es:'', en:'', ar:'' }; // se mantiene por compatibilidad; el mensaje real ahora sale de rpeLockMsg()
async function buildRpeLoadTable(dateStr){
  const table = document.getElementById('rpeLoadTable');
  if(!table) return;
  const saveAllBtn = document.getElementById('rpeSaveAllBtn');
  if(saveAllBtn){
    saveAllBtn.disabled = !(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'));
    saveAllBtn.style.opacity = saveAllBtn.disabled ? '.45' : '1';
    saveAllBtn.style.cursor = saveAllBtn.disabled ? 'default' : 'pointer';
  }
  const byPlayerRpe = {};
  RPE_REPORTS_CACHE.forEach(r=>{ (byPlayerRpe[normalizeNameKey(r.player_name)] = byPlayerRpe[normalizeNameKey(r.player_name)]||[]).push(r); });
  // Plantel completo: jugadores con datos GPS + los que se agregaron manualmente (todavía sin GPS cargado)
  const rosterExtra = await getRosterExtraNames();
  const allPlayers = mergePlayerNames(players, rosterExtra).filter(p=>!isGoalkeeper(p));
  const rowsData = allPlayers.map(p=>{
    const reportsForPlayer = byPlayerRpe[normalizeNameKey(p)] || [];
    const todayReport = reportsForPlayer.find(r=>r.fecha===dateStr);
    const {ratio, acute, chronic} = computeRpeACWR(reportsForPlayer, dateStr);
    const hora = todayReport && todayReport.updated_at ? new Date(todayReport.updated_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—';
    const rpeVal = todayReport ? todayReport.rpe : null;
    const minVal = todayReport ? todayReport.minutos : null;
    const cDiaria = (rpeVal!==null && minVal!==null) ? rpeVal*minVal : null;
    return {p, hora, rpeVal, minVal, cDiaria, acute, chronic, ratio, todayReport};
  });
  const rowsHtml = rowsData.map(r=>{
    let ratioColor = 'var(--mist)', ratioLabel = '—';
    if(r.ratio!==null){
      if(r.ratio<0.8){ ratioColor='var(--low)'; ratioLabel=t('acwrLow'); }
      else if(r.ratio<1.3){ ratioColor='var(--good)'; ratioLabel=t('acwrOptimal'); }
      else if(r.ratio<1.5){ ratioColor='var(--warn)'; ratioLabel=t('acwrCaution'); }
      else { ratioColor='var(--bad)'; ratioLabel=t('acwrHigh'); }
    }
    const isAdmin = myProfile && (myProfile.role==='admin' || myProfile.role==='owner');
    const minCell = r.todayReport
      ? (isAdmin
          ? `<input type="number" min="0" max="240" class="rpe-min-input" data-player="${r.todayReport.player_name}" data-fecha="${dateStr}" value="${r.minVal!==null?r.minVal:''}" placeholder="—" style="width:56px;padding:5px 6px;border-radius:6px;border:1px solid var(--line-strong);background:var(--pitch-950);color:var(--bone);font:12px 'IBM Plex Mono';outline:none;">`
          : `<span style="color:var(--bone);">${r.minVal!==null? r.minVal : '—'}</span>`)
      : `<span style="color:var(--mist);">—</span>`;
    return `<tr>
      <td class="metric-name">${r.p}</td>
      <td>${r.hora}</td>
      <td>${r.rpeVal!==null? r.rpeVal+'/10' : '—'}</td>
      <td>${minCell}</td>
      <td>${r.cDiaria!==null? r.cDiaria : '—'}</td>
      <td>${r.acute!==null? r.acute.toFixed(1) : '—'}</td>
      <td>${r.chronic!==null? r.chronic.toFixed(1) : '—'}</td>
      <td><span class="acwr-badge" style="background:${ratioColor};color:#14143A;">${r.ratio!==null? r.ratio.toFixed(2)+' · '+ratioLabel : '—'}</span></td>
    </tr>`;
  }).join('');
  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const rpeAvg = avg(rowsData.map(r=>r.rpeVal).filter(v=>v!==null));
  const minAvg = avg(rowsData.map(r=>r.minVal).filter(v=>v!==null));
  const cDiariaAvg = avg(rowsData.map(r=>r.cDiaria).filter(v=>v!==null));
  const acuteAvg = avg(rowsData.map(r=>r.acute).filter(v=>v!==null));
  const chronicAvg = avg(rowsData.map(r=>r.chronic).filter(v=>v!==null));
  const ratioAvg = avg(rowsData.map(r=>r.ratio).filter(v=>v!==null));
  const footerHtml = `<tr style="border-top:2px solid var(--line-strong);font-weight:700;">
    <td class="metric-name" style="color:var(--gold-bright);">${t('promedioDelPlantel')}</td>
    <td>—</td>
    <td>${rpeAvg!==null? rpeAvg.toFixed(1)+'/10' : '—'}</td>
    <td>${minAvg!==null? minAvg.toFixed(0) : '—'}</td>
    <td>${cDiariaAvg!==null? cDiariaAvg.toFixed(0) : '—'}</td>
    <td>${acuteAvg!==null? acuteAvg.toFixed(1) : '—'}</td>
    <td>${chronicAvg!==null? chronicAvg.toFixed(1) : '—'}</td>
    <td>${ratioAvg!==null? ratioAvg.toFixed(2) : '—'}</td>
  </tr>`;
  const isAdminGlobal = myProfile && (myProfile.role==='admin' || myProfile.role==='owner');
  const minHeaderCell = isAdminGlobal
    ? `<th>${t('colMin')} <span style="display:inline-flex;align-items:center;gap:4px;margin-left:4px;white-space:nowrap;">
         <input id="rpeMinBulkFill" type="number" min="0" max="240" placeholder="min" title="Escribe un valor y aplícalo a todas las filas" style="width:46px;padding:3px 5px;border-radius:5px;border:1px solid var(--gold);background:var(--pitch-950);color:var(--gold-bright);font:11px 'IBM Plex Mono';outline:none;">
         <button id="rpeMinBulkApplyBtn" type="button" title="Aplicar este valor a todos los jugadores" style="padding:3px 8px;border-radius:5px;border:1px solid var(--gold);background:var(--gold);color:var(--pitch-950);font:700 11px 'IBM Plex Mono';cursor:pointer;">✏️ Aplicar a todos</button>
       </span></th>`
    : `<th>${t('colMin')}</th>`;
  table.innerHTML = `<thead><tr>
    <th>${t('colJugador')}</th><th>${t('colHora')}</th><th>${t('colRpe')}</th>${minHeaderCell}<th>${t('colCDiaria')}</th><th>${t('colCAguda')}</th><th>${t('colCCronica')}</th><th>${t('colRatioAC')}</th>
  </tr></thead><tbody>${rowsHtml}${footerHtml}</tbody>`;
  table.querySelectorAll('.rpe-min-input').forEach(input=>{
    const save = async ()=>{
      const val = input.value===''? null : Number(input.value);
      input.disabled = true;
      const {error} = await supabaseClient.from('rpe_reports').update({minutos:val, updated_at:new Date().toISOString()})
        .eq('club',CURRENT_CLUB).eq('player_name',input.dataset.player).eq('fecha',input.dataset.fecha);
      input.disabled = false;
      if(error){ console.warn(error); return; }
      // Si ya pasaste a escribir en OTRA casilla de minutos, no reconstruimos la tabla ahora —
      // eso te borraría lo que estás tipeando ahí. Se actualiza recién cuando esa otra casilla también se guarde.
      const active = document.activeElement;
      if(active && active.classList && active.classList.contains('rpe-min-input') && active !== input) return;
      await buildRpeTeamList();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ input.blur(); } });
  });
  if(isAdminGlobal){
    const bulkInput = document.getElementById('rpeMinBulkFill');
    const bulkBtn = document.getElementById('rpeMinBulkApplyBtn');
    const applyToAll = ()=>{
      if(bulkInput.value==='') return;
      table.querySelectorAll('.rpe-min-input').forEach(inp=>{ inp.value = bulkInput.value; });
    };
    if(bulkBtn) bulkBtn.addEventListener('click', applyToAll);
    if(bulkInput) bulkInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); applyToAll(); } });
  }
}

async function saveAllRpeMinutes(){
  const btn = document.getElementById('rpeSaveAllBtn');
  const inputs = document.querySelectorAll('#rpeLoadTable .rpe-min-input:not([disabled])');
  if(!inputs.length){ return; }
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('guardando');
  const updates = Array.from(inputs).map(input=>{
    const val = input.value===''? null : Number(input.value);
    return supabaseClient.from('rpe_reports').update({minutos:val, updated_at:new Date().toISOString()})
      .eq('club',CURRENT_CLUB).eq('player_name',input.dataset.player).eq('fecha',input.dataset.fecha);
  });
  const results = await Promise.all(updates);
  const failed = results.filter(r=>r.error);
  btn.textContent = originalLabel;
  if(failed.length){
    failed.forEach(f=>console.warn(f.error));
    alert(`Se guardaron ${updates.length-failed.length} de ${updates.length} jugadores. Hubo ${failed.length} error(es), revisa la consola.`);
  }
  // Si mientras se guardaba ya pasaste a escribir en otra casilla, no reconstruimos ahora
  // (te borraría lo que estás tipeando) — se actualiza cuando esa casilla también se guarde.
  const active = document.activeElement;
  if(active && active.classList && active.classList.contains('rpe-min-input')){ btn.disabled = false; return; }
  await buildRpeTeamList(); // re-renderiza la tabla (esto ya vuelve a habilitar el botón según el horario)
}

