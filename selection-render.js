// ---------- selection ----------
function selectPlayer(p){
  state.player = p;
  document.querySelectorAll('.p-item').forEach(el=>el.classList.toggle('active', el.dataset.p===p));
  document.querySelectorAll('.lb-row').forEach(el=>el.classList.toggle('active', el.dataset.p===p));
  document.querySelectorAll('.acwr-row').forEach(el=>el.classList.toggle('active', el.dataset.p===p));
  document.getElementById('radarTitle').textContent = p ? `${t('radarVuelo')} · ${p}` : `${t('radarVuelo')} · ${t('radarVueloSinJugadores')}`;
  drawRadar(p);
  buildTimeline(p, state.metric, true);
  buildPlayerSessionLog();
}

// ---------- render everything (used on init and after a data refresh) ----------
function renderAll(keepPlayer){
  buildKPIs();
  buildWeeklyTarget();
  buildPlayerList(document.getElementById('searchInput')?.value || '');
  refreshWellnessRiskCache(); // fire-and-forget: cuando llegue, repinta los puntitos de riesgo con el factor wellness
  refreshNotifications(); // fire-and-forget: recalcula alertas ACWR/TQR/dolor/RHIE + solicitudes pendientes
  buildLeaderboard();
  buildRecordsTable();
  buildMatchGrid();
  buildACWR();
  buildWeeklyLoadChart(true);
  buildTeamTimeline(true);
  buildMonotonyStrain();
  buildMicrocycleTable();
  buildWeeklyMicroTabs();
  buildWeeklyMicrocycle();
  buildGkTeamMetricTabs();
  buildGkTeamTimeline(true);
  buildGkLbMetricTabs();
  buildGkLeaderboard();
  buildGkACWR();
  buildGkTable();
  buildDataQuality();
  if(!(myProfile && myProfile.role==='player')) buildRpeTeamList();
  if(!(myProfile && myProfile.role==='player')) buildGkRpeTeamList();
  populateCompareSelects();
  buildCompare();
  const defaultPlayer = (keepPlayer && players.includes(keepPlayer)) ? keepPlayer : players[0];
  if(!(keepPlayer && isGoalkeeper(keepPlayer))) selectPlayer(defaultPlayer);
}
