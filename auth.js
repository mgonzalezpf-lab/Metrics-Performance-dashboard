// ---------- perfiles de jugador (rol admin / player) ----------
async function getMyProfile(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user) return null;
  const {data,error}=await supabaseClient.from('player_profiles').select('*').eq('user_id',user.id).maybeSingle();
  if(error){ console.warn(error); return null; }
  return data;
}
// Le permite a alguien que quedó "rejected_club" (típicamente porque eligió "Administrador de un club nuevo"
// por error, en vez de Jugador/Staff) reintentar con la opción correcta, sin crear una cuenta nueva —
// reusa la misma cuenta/email, solo corrige club y rol, y pasa otra vez por el mismo camino que un registro normal.
async function retryAfterRejection(){
  const status = document.getElementById('retryRejectedStatus');
  const btn = document.getElementById('retryRejectedBtn');
  const clubName = document.getElementById('retryClubName').value.trim();
  const selectedRole = document.getElementById('retryRoleSelect').value;
  if(!clubName){ status.textContent = t('ingresaNombreClub'); return; }
  btn.disabled = true;
  status.textContent = t('reintentandoSolicitud');
  try{
    const {data:{user}} = await supabaseClient.auth.getUser();
    const {data:existingClub, error:clubError} = await supabaseClient.rpc('club_exists', {search_name: clubName});
    if(clubError) throw clubError;
    const clubExists = !!existingClub;
    const finalClub = clubExists ? existingClub : clubName;
    // Este formulario de reintento no ofrece la opción "Administrador" — solo jugador/staff/entrenador de
    // arqueros. Así que si el club sigue sin encontrarse, NUNCA lo mandamos como solicitud de admin;
    // se queda en "club no encontrado" para que pueda corregir el nombre de nuevo, sin límite de intentos.
    const finalRole = clubExists ? selectedRole : 'club_not_found';
    const {error} = await supabaseClient.from('player_profiles').update({club:finalClub, role:finalRole}).eq('user_id', user.id);
    if(error) throw error;
    status.textContent = t('solicitudReintentada');
    CURRENT_CLUB = finalClub;
    myProfile = await getMyProfile();
    setTimeout(()=>{ routeAfterLogin(); }, 900);
  }catch(e){
    status.textContent = tf('noSePudoGuardar', {e: e.message || e});
    btn.disabled = false;
  }
}
async function ensureProfile(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user) return null;

  const metadata = user.user_metadata || {};
  const roleSelectEl = document.getElementById('authRoleSelect');
  // Metadata tiene prioridad: sobrevive a confirmación de email y nuevos logins.
  const selectedRole = metadata.requested_role || ((roleSelectEl && roleSelectEl.value) || 'player');
  const clubName = (pendingSignupClub || metadata.club_name || '').trim();

  if(!clubName){
    const fallbackRole = selectedRole === 'club_admin' ? 'pending_club' : selectedRole;
    const {error} = await supabaseClient.from('player_profiles').insert({
      user_id:user.id, club:CURRENT_CLUB||'Sin club', role:fallbackRole, player_name:null, email:user.email
    });
    if(error) console.warn('No se pudo crear el perfil:', error);
    return await getMyProfile();
  }

  const {data:existingClub, error:clubError} = await supabaseClient.rpc('club_exists', {search_name: clubName});
  if(clubError){
    // Antes, si esta consulta fallaba (típicamente por un corte de señal momentáneo en el celular),
    // la función se rendía acá sin llegar a crear NUNCA el perfil — dejando a la persona con una cuenta
    // de acceso creada pero sin perfil, atascada para siempre hasta que alguien lo notara y lo arreglara
    // a mano. Ahora, en vez de rendirse, se crea el perfil igual con el mismo estado que "club no
    // encontrado" — así la persona ve un mensaje claro y puede reintentar apenas tenga señal de nuevo,
    // en lugar de quedar en un limbo invisible.
    console.warn('No se pudo comprobar el club (se guarda como "club no encontrado" para poder reintentar):', clubError);
    const fallbackRole2 = selectedRole === 'club_admin' ? 'pending_club' : 'club_not_found';
    const {error: fallbackError} = await supabaseClient.from('player_profiles').insert({
      user_id:user.id, club:clubName, role:fallbackRole2, player_name:null, email:user.email
    });
    if(fallbackError) console.warn('Tampoco se pudo crear el perfil de respaldo:', fallbackError);
    pendingSignupClub = null;
    return await getMyProfile();
  }

  const clubExists = !!existingClub;
  const finalClub = clubExists ? existingClub : clubName;
  // Un club nuevo JAMÁS se activa automáticamente. El primer solicitante queda pendiente
  // hasta que el OWNER lo apruebe y recién entonces pasa a admin.
  // Importante: si el club NO existe y la persona NO eligió "Administrador de un club nuevo" a propósito
  // (o sea, quería ser jugador/staff/entrenador de arqueros de un club que ya existe, pero lo escribió mal),
  // NO la convertimos en una solicitud de admin silenciosa — eso confundía a mucha gente. En vez de eso,
  // queda en un estado aparte que le explica que no encontramos el club, con opción de corregir el nombre.
  const finalRole = clubExists
    ? (selectedRole === 'club_admin' ? 'pending_club' : selectedRole)
    : (selectedRole === 'club_admin' ? 'pending_club' : 'club_not_found');

  const {error} = await supabaseClient.from('player_profiles').insert({
    user_id:user.id, club:finalClub, role:finalRole, player_name:null, email:user.email
  });
  if(error) console.warn('No se pudo crear el perfil:', error);

  pendingSignupClub = null;
  return await getMyProfile();
}
async function getTakenPlayerNames(){
  const {data,error}=await supabaseClient.from('player_profiles').select('player_name').eq('club',CURRENT_CLUB).eq('role','player').not('player_name','is',null);
  if(error){ console.warn(error); return []; }
  return data.map(r=>r.player_name);
}
async function claimPlayerName(name){
  const {data:{user}}=await supabaseClient.auth.getUser();
  const {error}=await supabaseClient.from('player_profiles').update({player_name:name}).eq('user_id',user.id);
  if(error) throw error;
}
let nameScreenAllNames = [];
function renderNameSelectOptions(){
  const select=document.getElementById('nameSelect');
  const catSelect = document.getElementById('nameCategorySelect');
  const cat = catSelect ? catSelect.value : '';
  const filtered = cat
    ? nameScreenAllNames.filter(n=> ROSTER_CATEGORIES[normalizeNameKey(n)] === cat)
    : nameScreenAllNames;
  select.innerHTML = filtered.length
    ? `<option value="" selected disabled>— ${t('seleccionaTuNombre')} —</option>` + filtered.map(n=>`<option value="${n}">${n}</option>`).join('')
    : `<option value="">${t('sinNombresDisponibles')}</option>`;
}
function showNamePicker(availableNames){
  document.getElementById('authScreen').style.display='none';
  const screen=document.getElementById('nameScreen');
  screen.style.display='flex';
  ensureAuthBgLogo(screen);
  nameScreenAllNames = availableNames;
  // El selector de categoría solo tiene sentido si el club realmente tiene jugadores con categoría asignada
  // (clubes de un solo plantel no la necesitan y no la ven).
  const catWrap = document.getElementById('nameCategoryWrap');
  const catSelect = document.getElementById('nameCategorySelect');
  const usaCategoria = Object.keys(ROSTER_CATEGORIES).length > 0;
  if(catWrap) catWrap.style.display = usaCategoria ? '' : 'none';
  if(catSelect){ catSelect.value = ''; catSelect.onchange = renderNameSelectOptions; }
  renderNameSelectOptions();
}
let previewingAsPlayer = null;
let ORIGINAL_BRAND_SUB = null;
let currentAdminTab = 'jugadores'; // recuerda en qué pestaña estaba el admin, para volver ahí al salir de una vista previa
function setupPreviewBar(){
  if(!(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'))) return;
  const bar = document.getElementById('previewBar');
  bar.style.display = 'block';
  const select = document.getElementById('previewPlayerSelect');
  select.innerHTML = players.map(p=>`<option value="${p}">${p}</option>`).join('');
  document.getElementById('previewStartBtn').onclick = ()=>{ startPlayerPreview(select.value); };
  document.getElementById('previewExitBtn').onclick = exitPlayerPreview;
}
function setupGkPreviewBar(){
  if(!(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'))) return;
  const select = document.getElementById('gkPreviewSelect');
  if(!select) return;
  const gkNames = [...new Set(GK_EVENTS.map(e=>e.jugador))].sort();
  select.innerHTML = gkNames.map(p=>`<option value="${p}">${p}</option>`).join('');
  document.getElementById('gkPreviewStartBtn').onclick = ()=>{ startPlayerPreview(select.value); };
}
function resizeAllCharts(){
  // Si hay un modal abierto (ej. el de confirmar tipo/nombre de entrenamiento al subir el CSV), no tiene
  // sentido reconstruir los ~8 gráficos del dashboard de atrás cada vez que el teclado del celular
  // dispara un resize — eso es trabajo pesado e innecesario en ese momento, y causaba un destello/parpadeo
  // visible mientras se tipeaba. Se salta acá; los gráficos igual se refrescan solos al cerrar el modal
  // (las pestañas ya se reconstruyen normalmente cuando se vuelve a entrar a ellas).
  const csvModalOpen = document.getElementById('csvImportModal')?.style.display === 'flex';
  if(csvModalOpen) return;
  // Al hacer clic en "Actualizar datos (subir Excel)" se abre el selector de archivos NATIVO del sistema
  // operativo — eso también dispara un resize en varios navegadores (el propio picker no es un modal
  // nuestro, así que csvModalOpen no lo detecta). Si en ese momento se reconstruye un gráfico, el canvas
  // puede tener 0 de ancho/alto (tapado por el picker) y Chart.js lo dibuja vacío — y como el picker suele
  // seguir abierto más tiempo del que dura el reintento escalonado de abajo, el gráfico se queda en blanco
  // hasta recargar la página. Por eso cada bloque de abajo primero chequea que el canvas tenga tamaño real
  // antes de destruir el gráfico existente: si no lo tiene, no toca nada y deja el último gráfico bueno
  // como estaba, en vez de reemplazarlo por uno vacío.
  const hasRealSize = (id)=>{
    const el = document.getElementById(id);
    return !!(el && el.offsetWidth > 0 && el.offsetHeight > 0);
  };
  const doRebuild = ()=>{
    try{
      if(hasRealSize('timelineChart')){
        if(timelineChart){ timelineChart.destroy(); timelineChart=null; }
        buildTimeline(state.player, state.metric, true);
      }
    }catch(e){ console.warn('resize timelineChart falló:', e); }
    try{
      if(hasRealSize('weeklyLoadChart')){
        if(weeklyLoadChart){ weeklyLoadChart.destroy(); weeklyLoadChart=null; }
        buildWeeklyLoadChart(true);
      }
    }catch(e){ console.warn('resize weeklyLoadChart falló:', e); }
    try{
      if(hasRealSize('rpeAcwrCanvas')){
        if(rpeAcwrChartInstance){ rpeAcwrChartInstance.destroy(); rpeAcwrChartInstance=null; }
        buildRpeAcwrChart();
      }
    }catch(e){ console.warn('resize rpeAcwrChartInstance falló:', e); }
    try{
      if(hasRealSize('teamTimelineChart')){
        if(teamTimelineChart){ teamTimelineChart.destroy(); teamTimelineChart=null; }
        buildTeamTimeline(true);
      }
    }catch(e){ console.warn('resize teamTimelineChart falló:', e); }
    try{
      if(hasRealSize('weeklyMicroChart')){
        if(weeklyMicroChart){ weeklyMicroChart.destroy(); weeklyMicroChart=null; }
        buildMicrocycleTable();
        buildWeeklyMicrocycle();
      }
    }catch(e){ console.warn('resize weeklyMicroChart falló:', e); }
    try{
      const activePlayer = previewingAsPlayer || (myProfile && myProfile.player_name);
      if(activePlayer && isGoalkeeper(activePlayer) && hasRealSize('gkTimelineChart')){
        if(gkTimelineChart){ gkTimelineChart.destroy(); gkTimelineChart=null; }
        buildGkTimeline(activePlayer, state.gkMetric, true);
      }
    }catch(e){ console.warn('resize gkTimelineChart falló:', e); }
    try{
      if(document.getElementById('wellnessView')?.style.display !== 'none' && hasRealSize('wellnessTrendChart')){
        if(wellnessTrendChart){ wellnessTrendChart.destroy(); wellnessTrendChart=null; }
        renderWellnessTrendChart();
      }
    }catch(e){ console.warn('resize wellnessTrendChart falló:', e); }
    try{
      if(efficiencyDetailChart){ efficiencyDetailChart.destroy(); efficiencyDetailChart=null; }
    }catch(e){ console.warn('resize efficiencyDetailChart falló:', e); }
  };
  // Varios intentos escalonados: cubre navegadores rápidos (rAF), layouts más lentos (timeouts), y el caso
  // del selector de archivos nativo que puede seguir abierto pasados los 500ms originales — el intento a
  // los 2s le da tiempo de sobra a que el picker se haya cerrado y el layout ya esté firme otra vez.
  requestAnimationFrame(()=> requestAnimationFrame(doRebuild));
  setTimeout(doRebuild, 150);
  setTimeout(doRebuild, 500);
  setTimeout(doRebuild, 2000);
}
let PLAYER_BEFORE_PREVIEW = null;
function startPlayerPreview(playerName){
  previewingAsPlayer = playerName;
  PLAYER_BEFORE_PREVIEW = state.player;
  if(ORIGINAL_BRAND_SUB===null){
    const sub = document.querySelector('.top .brand-sub');
    ORIGINAL_BRAND_SUB = sub ? sub.textContent : '';
  }
  if(!isGoalkeeper(playerName)) selectPlayer(playerName);
  applyPlayerModeUI();
  document.querySelector('.top .brand-sub').textContent = `Vista previa: ${playerName} — solo lectura`;
  document.getElementById('previewPlayerSelect').style.display='none';
  document.getElementById('previewStartBtn').style.display='none';
  document.getElementById('previewExitBtn').style.display='inline-block';
  resizeAllCharts();
}
function exitPlayerPreview(){
  previewingAsPlayer = null;
  document.querySelectorAll('.team-only').forEach(el=>el.style.display='');
  const mainGrid=document.getElementById('mainGrid');
  if(mainGrid){ mainGrid.style.gridTemplateColumns=''; mainGrid.style.display=''; }
  const gkView=document.getElementById('gkPlayerView');
  if(gkView) gkView.style.display='none';
  if(ORIGINAL_BRAND_SUB!==null) document.querySelector('.top .brand-sub').textContent = ORIGINAL_BRAND_SUB;
  document.getElementById('previewPlayerSelect').style.display='inline-block';
  document.getElementById('previewStartBtn').style.display='inline-block';
  document.getElementById('previewExitBtn').style.display='none';
  renderAll(PLAYER_BEFORE_PREVIEW);
  resizeAllCharts();
  switchAdminTab(currentAdminTab);
}
// Si la conexión se corta justo en medio del signUp/login, antes el fetch podía quedarse "colgado" sin
// nunca resolver ni rechazar — la persona veía "Comprobando acceso…" para siempre, sin ningún botón para
// reintentar (aunque el submit de abajo seguía técnicamente clickeable, no había ninguna pista de que debía
// volver a intentar). Este helper le pone un límite de tiempo a cualquier llamada a Supabase del login/registro:
// si no responde en ese tiempo, se corta y se le avisa a la persona que reintente, en vez de dejarla en limbo.
function withTimeout(promise, ms, timeoutMessage){
  return Promise.race([
    promise,
    new Promise((_, reject)=> setTimeout(()=> reject(new Error(timeoutMessage)), ms)),
  ]);
}
let isAuthSubmitting = false;
async function handleAuthSubmit(event){
  event.preventDefault();
  if(isAuthSubmitting) return; // evita disparar un segundo signUp/login mientras el primero sigue en vuelo
  const email=document.getElementById('authEmail').value.trim();
  const password=document.getElementById('authPassword').value;
  isAuthSubmitting = true;
  try{

  if(authMode==='signup'){
    const passwordConfirm = document.getElementById('authPasswordConfirm').value;
    if(password !== passwordConfirm){ authMessage(t('contrasenasNoCoinciden'),'error'); return; }
    const clubNameEl = document.getElementById('authClubName');
    const roleEl = document.getElementById('authRoleSelect');
    const clubName = clubNameEl ? clubNameEl.value.trim() : '';
    const selectedRole = roleEl ? roleEl.value : 'player';
    if(!clubName){ authMessage(t('ingresaNombreClub'),'error'); return; }

    // El rol y el club quedan en Auth metadata para que sobrevivan a la confirmación del email.
    pendingSignupClub = clubName;
    authMessage(t('comprobandoAcceso'));
    let result;
    try{
      result = await withTimeout(
        supabaseClient.auth.signUp({
          email, password,
          options:{ data:{ club_name:clubName, requested_role:selectedRole, club_request_status:'pending' } }
        }),
        20000, t('timeoutIntentaDeNuevo')
      );
    }catch(err){
      // Corte de señal / timeout: NO asumimos nada sobre si la cuenta quedó creada del lado del servidor.
      // Solo avisamos con claridad y la dejamos reintentar tocando el mismo botón de nuevo.
      authMessage(err.message || t('timeoutIntentaDeNuevo'), 'error');
      return;
    }
    if(result.error){
      // Caso típico del corte de señal: el signUp anterior sí llegó a crear la cuenta del lado del
      // servidor, pero la respuesta nunca volvió (o la persona cerró/perdió señal antes de verla) y
      // ahora Supabase dice "ya existe". En vez de dejarla trabada con un error críptico, la obligamos
      // a seguir el proceso: cambiamos solo a Iniciar sesión con el mismo mail/contraseña ya cargados.
      const yaExiste = /already registered|already exists|user already/i.test(result.error.message || '');
      if(yaExiste){
        authMode = 'login';
        updateAuthForm();
        document.getElementById('authEmail').value = email;
        document.getElementById('authPassword').value = password;
        authMessage(t('cuentaYaExisteIniciaSesion'), 'error');
        return;
      }
      authMessage(result.error.message,'error');
      return;
    }
    if(!result.data.session){
      authMessage(t('cuentaCreadaReintentar'),'ok');
      return;
    }
    try{
      await withTimeout(routeAfterLogin(), 20000, t('timeoutPerfilIntentaDeNuevo'));
    }catch(err){
      // No des por sentado que ya quedó todo guardado: si esto se corta, se lo decimos claro y puede
      // reintentar con el mismo botón — la cuenta de Auth ya existe, así que alcanza con reintentar el
      // login (no hace falta registrarse de nuevo).
      authMessage(err.message || t('timeoutPerfilIntentaDeNuevo'), 'error');
    }
    return;
  }

  authMessage(t('comprobandoAcceso'));
  let result;
  try{
    result = await withTimeout(supabaseClient.auth.signInWithPassword({email,password}), 20000, t('timeoutIntentaDeNuevo'));
  }catch(err){
    authMessage(err.message || t('timeoutIntentaDeNuevo'), 'error');
    return;
  }
  if(result.error){ authMessage(result.error.message,'error'); return; }
  try{
    await withTimeout(routeAfterLogin(), 20000, t('timeoutPerfilIntentaDeNuevo'));
  }catch(err){
    authMessage(err.message || t('timeoutPerfilIntentaDeNuevo'), 'error');
  }

  }finally{
    isAuthSubmitting = false;
  }
}
function applyOwnerMode(){
  const authCard = document.getElementById('authForm');
  const ownerBadge = document.getElementById('ownerBadge');

  if(!authCard || !ownerBadge) return;

  const isOwner = !!myProfile && myProfile.role === 'owner';

  authCard.classList.toggle('owner-mode', isOwner);
  ownerBadge.style.display = isOwner ? 'inline-flex' : 'none';
}async function routeAfterLogin(){
  myProfile = await getMyProfile();
 if(!myProfile){ myProfile = await ensureProfile(); }
 if(!myProfile){
   // Si llegamos hasta acá sin perfil (típicamente por un corte de señal en un momento muy puntual),
   // avisamos claro y dejamos reintentar en vez de romper en silencio con una pantalla en blanco o
   // trabada — la cuenta de acceso ya existe, así que con volver a intentar alcanza, sin crear nada de nuevo.
   authMessage(t('perfilNoCargoReintenta'),'error');
   return;
 }
 CURRENT_CLUB = myProfile.club || CURRENT_CLUB; // a partir de acá, todo el dashboard usa el club de quien inició sesión

applyOwnerMode();

if(myProfile.role === 'owner'){
  authMessage('Acceso de propietario verificado ✓','ok');
  await new Promise(resolve => setTimeout(resolve, 2500));
}

if(myProfile.role==='pending_club' || myProfile.role==='pending_staff' || myProfile.role==='pending_gk_coach'){
    showPendingScreen(myProfile.role);
    return;
  }
  if(myProfile.role==='rejected_club' || myProfile.role==='club_not_found'){
    showPendingScreen(myProfile.role);
    return;
  }
  if(myProfile.role!=='owner'){
    const features = await loadClubFeatures(CURRENT_CLUB);
    CLUB_FEATURES = features;
    if(!features.active){
      showPendingScreen('suspended');
      return;
    }
  }
  if(myProfile.role==='player' && !myProfile.player_name){
    await loadGkData(); // para que los arqueros también aparezcan en el picker de nombre
    const taken = await getTakenPlayerNames();
    const rosterExtra = await getRosterExtraNames();
    const gkNames = [...new Set(GK_EVENTS.map(e=>e.jugador))];
    const allNames = [...new Set([...ACTIVE_EVENTS.map(e=>e.jugador), ...rosterExtra, ...gkNames])].sort();
    const available = allNames.filter(n=>!taken.includes(n));
    showNamePicker(available);
    return;
  }
  await startDashboard();
}
function showPendingScreen(role){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('nameScreen').style.display='none';
  const screen = document.getElementById('pendingScreen');
  const msg = document.getElementById('pendingMessage');
  const title = document.getElementById('pendingTitle');
  if(role==='suspended'){
    title.textContent = 'Club suspendido';
    msg.textContent = `El acceso de "${CURRENT_CLUB}" está temporalmente suspendido. Contacta al OWNER (Matías González) para reactivarlo — tus datos siguen guardados y vas a poder seguir usando el dashboard normalmente en cuanto se reactive.`;
    screen.style.display='flex';
    ensureAuthBgLogo(screen);
    document.getElementById('pendingLogoutBtn').onclick = async ()=>{
      await supabaseClient.auth.signOut();
      location.reload();
    };
    return;
  }
  title.textContent = t('cuentaCreada');
  const roleLabel = role==='pending_club' ? 'Administrador de un nuevo club' : (role==='pending_gk_coach' ? 'Entrenador de arqueros' : 'Staff (médico y técnico)');
  const approver = role==='pending_club' ? 'OWNER (Matías González)' : 'el administrador de tu club';
  if(role==='rejected_club' || role==='club_not_found'){
    msg.textContent = role==='club_not_found' ? t('clubNoEncontrado') : t('solicitudRechazada');
    const retryWrap = document.getElementById('retryRejectedWrap');
    if(retryWrap) retryWrap.style.display = '';
    const retryClubInput = document.getElementById('retryClubName');
    if(retryClubInput && !retryClubInput.value){
      supabaseClient.auth.getUser().then(({data})=>{
        const prevClub = data?.user?.user_metadata?.club_name;
        if(prevClub) retryClubInput.value = prevClub;
      });
    }
    const retryBtn = document.getElementById('retryRejectedBtn');
    if(retryBtn) retryBtn.onclick = retryAfterRejection;
  } else {
    const retryWrap = document.getElementById('retryRejectedWrap');
    if(retryWrap) retryWrap.style.display = 'none';
    msg.textContent = role==='pending_club'
      ? `La solicitud del club fue creada correctamente. Necesita la aprobación del OWNER (Matías González) antes de activar el club y asignarte como administrador.`
      : `Tu cuenta fue creada correctamente como "${roleLabel}". Necesita la aprobación de ${approver} antes de poder acceder al panel.`;
  }
  screen.style.display='flex';
  ensureAuthBgLogo(screen);
  document.getElementById('pendingLogoutBtn').onclick = async ()=>{
    await supabaseClient.auth.signOut();
    location.reload();
  };
}
async function handleNameSubmit(event){
  event.preventDefault();
  const name=document.getElementById('nameSelect').value;
  if(!name){ document.getElementById('nameMessage').textContent=t('seleccionaNombreValido'); return; }
  try{
    await claimPlayerName(name);
    myProfile = await getMyProfile();
    document.getElementById('nameScreen').style.display='none';
    await startDashboard();
  }catch(error){
    document.getElementById('nameMessage').textContent = t('nombreYaTomado');
    const taken = await getTakenPlayerNames();
    const rosterExtra = await getRosterExtraNames();
    const allNames = [...new Set([...ACTIVE_EVENTS.map(e=>e.jugador), ...rosterExtra])].sort();
    showNamePicker(allNames.filter(n=>!taken.includes(n)));
  }
}
