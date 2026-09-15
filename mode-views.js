// ---------- Área médica: solo lectura, solo 5 paneles relevantes (ACWR, RPE x2, Récords, Monotonía/Strain), solo jugadores de campo ----------
function applyStaffModeUI(){
  // Corre esto primero: además de mover el grupo de paneles de RPE al lugar que corresponde según si
  // el club tiene GPS o no, ya decide sola a qué pestaña mandar si "Jugadores" no aplica para este club
  // (antes esto no se llamaba acá, así que un club sin GPS igual mostraba la vista de Jugadores vacía).
  applyClubFeaturesToTabs();
  document.querySelectorAll('.team-only').forEach(el=>{
    el.style.display = el.classList.contains('staff-ok') ? '' : 'none';
  });
  const mainGrid = document.getElementById('mainGrid');
  if(mainGrid) mainGrid.style.display = ''; // Staff sí puede navegar el plantel y ver Radar + Evolución por sesión de cualquier jugador
  const adminTabBar = document.getElementById('adminTabBar');
  if(adminTabBar) adminTabBar.style.display = 'none';
  const goalkeepersView = document.getElementById('goalkeepersView');
  if(goalkeepersView) goalkeepersView.style.display = 'none';
  const fieldWrap = document.getElementById('fieldContentWrap');
  const controlCargaView = document.getElementById('controlCargaView');
  const wellnessView = document.getElementById('wellnessView');
  const rpeView = document.getElementById('rpeView');
  // Un club sin GPS no tiene nada que mostrar en Jugadores/Control de Carga (dependen del GPS) — ahí
  // el staff tiene que ver Wellness/RPE en su lugar, que es donde vive ese contenido para ese tipo de club.
  if(CLUB_FEATURES.gps){
    if(fieldWrap) fieldWrap.style.display = ''; // los paneles staff-ok viven adentro, tiene que estar visible
    if(controlCargaView) controlCargaView.style.display = ''; // ACWR y Monotonía (staff-ok) viven acá cuando hay GPS
    if(wellnessView) wellnessView.style.display = 'none';
    if(rpeView) rpeView.style.display = 'none';
    // Mismo ajuste que en switchAdminTab: estos gráficos se armaron mientras este panel estaba oculto,
    // así que hay que reintentar el scroll al día más reciente ahora que ya es visible de verdad.
    requestAnimationFrame(()=>{
      const wb = document.getElementById('weeklyChartScrollBox');
      if(wb) wb.scrollLeft = wb.scrollWidth;
      const rb = document.getElementById('rpeAcwrScrollBox');
      if(rb) rb.scrollLeft = rb.scrollWidth;
      setTimeout(()=>{
        if(wb) wb.scrollLeft = wb.scrollWidth;
        if(rb) rb.scrollLeft = rb.scrollWidth;
      }, 60);
    });
  } else {
    if(fieldWrap) fieldWrap.style.display = 'none';
    if(controlCargaView) controlCargaView.style.display = 'none';
    const showWellnessRpe = CLUB_FEATURES.rpe_wellness;
    if(wellnessView){
      wellnessView.style.display = showWellnessRpe ? '' : 'none';
      // El barrido de ".team-only" de más arriba oculta TODO lo que no tenga "staff-ok" — pero acá, para
      // un club sin GPS, Wellness/RPE SON toda la vista del staff (no un subconjunto curado como pasa
      // adentro de Jugadores/Control de Carga), así que se muestran sus paneles internos explícitamente.
      if(showWellnessRpe) wellnessView.querySelectorAll('.team-only').forEach(el=> el.style.display = '');
    }
    if(rpeView){
      rpeView.style.display = showWellnessRpe ? '' : 'none';
      if(showWellnessRpe) rpeView.querySelectorAll('.team-only').forEach(el=> el.style.display = '');
    }
    if(showWellnessRpe){
      // Antes esto llamaba a estas 4 funciones (todas async) sin "await" dentro de un try/catch síncrono —
      // eso significa que si alguna fallaba, el error pasaba en silencio total, sin que este catch lo agarrara
      // (para cuando el error ocurre, el catch ya había terminado de ejecutarse). Ahora cada una se espera de
      // verdad y tiene su propio manejo de error VISIBLE EN PANTALLA (no solo en consola, para poder
      // diagnosticar esto con una simple captura de celular, sin depender de abrir la consola del navegador).
      const showBuildError = (containerId, e) => {
        console.error(`applyStaffModeUI: falló al armar ${containerId}`, e);
        const el = document.getElementById(containerId);
        const target = (el && el.tagName === 'CANVAS') ? el.parentElement : el;
        if(target) target.innerHTML = `<div style="padding:14px 18px;color:var(--bad);font-size:12px;">⚠️ Error al cargar esta sección: ${e && e.message ? e.message : e}</div>`;
      };
      (async()=>{
        try{ await buildWellnessTeamList(); }catch(e){ showBuildError('wellnessTable', e); }
        try{ buildWellnessMetricTabs(); }catch(e){ console.error('applyStaffModeUI: falló buildWellnessMetricTabs', e); }
        try{ await buildWellnessTrendChart(true); }catch(e){ showBuildError('wellnessTrendChart', e); }
        try{ await buildRpeTeamList(); }catch(e){ showBuildError('rpeTeamList', e); }
      })();
    }
  }
  const partidosView = document.getElementById('partidosView');
  if(partidosView) partidosView.style.display = 'none'; // Staff no ve Comparativo de partidos
  const clubesView = document.getElementById('clubesView');
  if(clubesView) clubesView.style.display = 'none'; // esa vista es exclusiva del owner
  const eficienciaView = document.getElementById('eficienciaView');
  if(eficienciaView) eficienciaView.style.display = 'none'; // Staff no tiene esta pestaña por ahora
  const previewBar = document.getElementById('previewBar');
  if(previewBar) previewBar.style.display = 'none';
  const gkPlayerView = document.getElementById('gkPlayerView');
  if(gkPlayerView) gkPlayerView.style.display = 'none';
  const saveAllBtn = document.getElementById('rpeSaveAllBtn');
  if(saveAllBtn) saveAllBtn.style.display = 'none'; // ya viene deshabilitado, esto además lo oculta del todo
  const acwrDailyBox = document.getElementById('acwrDailyTeamBox');
  if(acwrDailyBox) acwrDailyBox.style.display = 'none'; // Staff ve la lista por jugador, no el gráfico diario del equipo
  const subEl = document.querySelector('.top .brand-sub');
  if(subEl) subEl.textContent = 'Staff (médico y técnico) — solo lectura — ' + CURRENT_CLUB;
}

// ---------- Entrenador de arqueros: solo la pestaña de Arqueros completa, de solo lectura ----------
function applyGkCoachModeUI(){
  document.querySelectorAll('.team-only').forEach(el=>{ el.style.display = 'none'; });
  const mainGrid = document.getElementById('mainGrid');
  if(mainGrid) mainGrid.style.display = 'none';
  const adminTabBar = document.getElementById('adminTabBar');
  if(adminTabBar) adminTabBar.style.display = 'none';
  const fieldWrap = document.getElementById('fieldContentWrap');
  if(fieldWrap) fieldWrap.style.display = 'none';
  const controlCargaView = document.getElementById('controlCargaView');
  if(controlCargaView) controlCargaView.style.display = 'none';
  const partidosView = document.getElementById('partidosView');
  if(partidosView) partidosView.style.display = 'none';
  const clubesView = document.getElementById('clubesView');
  if(clubesView) clubesView.style.display = 'none'; // esa vista es exclusiva del owner
  const goalkeepersView = document.getElementById('goalkeepersView');
  if(goalkeepersView) goalkeepersView.style.display = 'block';
  const previewBar = document.getElementById('previewBar');
  if(previewBar) previewBar.style.display = 'none';
  const gkPlayerView = document.getElementById('gkPlayerView');
  if(gkPlayerView) gkPlayerView.style.display = 'none';
  const subEl = document.querySelector('.top .brand-sub');
  if(subEl) subEl.textContent = 'Entrenador de arqueros — solo lectura — ' + CURRENT_CLUB;
}

function applyPlayerModeUI(){
  document.querySelectorAll('.team-only').forEach(el=>el.style.display='none');
  const fieldWrap = document.getElementById('fieldContentWrap');
  if(fieldWrap) fieldWrap.style.display=''; // la vista individual siempre necesita este contenedor visible, sin importar en qué pestaña haya quedado el admin
  const gkAdminView = document.getElementById('goalkeepersView');
  if(gkAdminView) gkAdminView.style.display='none'; // esa vista es solo para el admin navegando el plantel completo
  const cargaAdminView = document.getElementById('controlCargaView');
  if(cargaAdminView) cargaAdminView.style.display='none'; // idem, solo para el admin
  const partidosAdminView = document.getElementById('partidosView');
  if(partidosAdminView) partidosAdminView.style.display='none'; // idem, solo para el admin
  const clubesAdminView = document.getElementById('clubesView');
  if(clubesAdminView) clubesAdminView.style.display='none'; // idem, exclusiva del owner
  const mainGrid=document.getElementById('mainGrid');
  const gkView=document.getElementById('gkPlayerView');
  const activePlayer = previewingAsPlayer || (myProfile && myProfile.player_name);
  if(!CLUB_FEATURES.gps){
    if(mainGrid) mainGrid.style.display='none';
    if(gkView) gkView.style.display='none';
  } else if(activePlayer && isGoalkeeper(activePlayer)){
    if(mainGrid) mainGrid.style.display='none';
    if(gkView) gkView.style.display='block';
    buildGkPlayerView(activePlayer);
  } else {
    if(mainGrid){ mainGrid.style.display=''; mainGrid.style.gridTemplateColumns='1fr'; }
    if(gkView) gkView.style.display='none';
  }
  const rpePanelEl = document.getElementById('rpePanel');
  const wellnessPanelEl = document.getElementById('wellnessPanel');
  if(!CLUB_FEATURES.rpe_wellness){
    if(rpePanelEl) rpePanelEl.style.display='none';
    if(wellnessPanelEl) wellnessPanelEl.style.display='none';
  }
  document.querySelector('.top .brand-sub').textContent = 'Tus métricas individuales — ' + CURRENT_CLUB;
}
