// ---------- Owner: solicitudes de nuevos clubes ----------
async function buildPendingClubsPanel(){
  const panel=document.getElementById('pendingClubsPanel');
  const box=document.getElementById('pendingClubsList');
  const count=document.getElementById('pendingClubsCount');
  if(!panel || !box || !count) return;
  if(!(myProfile && myProfile.role==='owner')){ panel.style.display='none'; return; }

  const {data,error}=await supabaseClient.from('player_profiles')
    .select('user_id,email,club,role,created_at')
    .eq('role','pending_club')
    .order('created_at',{ascending:true});
  if(error){ console.warn('No se pudieron cargar las solicitudes de clubes:',error); panel.style.display='none'; return; }

  if(!data || !data.length){ panel.style.display='none'; return; }
  panel.style.display='';
  count.textContent=`${data.length} pendiente${data.length===1?'':'s'}`;

  // Para avisar si esta persona (o este nombre de club) ya fue rechazada antes — no bloquea nada,
  // solo te lo señala para que decidas con contexto antes de aprobar de nuevo.
  const {data:rechazados} = await supabaseClient.from('player_profiles')
    .select('email,club').eq('role','rejected_club');
  const rechazadosList = rechazados || [];
  const yaRechazado = (r) => rechazadosList.some(x=>
    (x.email && r.email && x.email.toLowerCase()===r.email.toLowerCase()) ||
    (x.club && r.club && normalizeNameKey(x.club)===normalizeNameKey(r.club))
  );

  box.innerHTML=data.map(r=>{
    const fecha=new Date(r.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
    const avisoRechazo = yaRechazado(r) ? `<div style="color:var(--bad);font-size:11px;font-weight:700;margin-top:3px;">${t('yaRechazadoAntes')}</div>` : '';
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap;">
      <div><div style="color:var(--bone);font-weight:600;font-size:13px;">${r.club||'Club sin nombre'}</div>
      <div style="color:var(--mist);font-size:11.5px;margin-top:2px;">${r.email||'Sin email'} · Solicitud ${fecha}</div>
      ${avisoRechazo}</div>
      <div style="display:flex;gap:8px;">
        <button class="upload-btn" data-approve-club="${r.user_id}" style="padding:7px 14px;white-space:nowrap;">✓ Aprobar y hacer Admin</button>
        <button class="upload-btn" data-reject-club="${r.user_id}" style="padding:7px 14px;white-space:nowrap;">✕ Rechazar</button>
      </div>
    </div>`;
  }).join('');

  box.querySelectorAll('[data-approve-club]').forEach(btn=>btn.onclick=async()=>{
    btn.disabled=true; btn.textContent='Aprobando…';
    try{ await approveNewClub(btn.dataset.approveClub); await buildPendingClubsPanel(); await buildClubesList(); }
    catch(e){ console.error(e); btn.disabled=false; btn.textContent=t('reintentar'); }
  });
  box.querySelectorAll('[data-reject-club]').forEach(btn=>btn.onclick=async()=>{
    btn.disabled=true; btn.textContent='Rechazando…';
    try{ await rejectNewClub(btn.dataset.rejectClub); await buildPendingClubsPanel(); }
    catch(e){ console.error(e); btn.disabled=false; btn.textContent=t('reintentar'); }
  });
}

async function assertOwner(){
  if(!(myProfile && myProfile.role==='owner')) throw new Error('Solo el OWNER puede realizar esta acción.');
}
async function approveNewClub(userId){
  await assertOwner();
  const {data,error}=await supabaseClient.from('player_profiles')
    .update({role:'admin',player_name:null})
    .eq('user_id',userId).eq('role','pending_club')
    .select().single();
  if(error) throw error;
  return data;
}
async function rejectNewClub(userId){
  await assertOwner();
  const {error}=await supabaseClient.from('player_profiles')
    .update({role:'rejected_club'})
    .eq('user_id',userId).eq('role','pending_club');
  if(error) throw error;
}

// ---------- Clubes (solo owner): lista de todos los clubes en la plataforma, con acceso total a cada uno ----------
async function buildClubesList(){
  const box = document.getElementById('clubesList');
  const tag = document.getElementById('clubesCountTag');
  if(!box) return;
  box.innerHTML = `<p style="padding:14px 18px;color:var(--mist);font-size:12.5px;">${t('cargandoClubes')}</p>`;
  const {data, error} = await supabaseClient.from('player_profiles').select('club,role');
  if(error){
    box.innerHTML = '<p style="padding:14px 18px;color:var(--mist);font-size:12.5px;">No se pudieron cargar los clubes.</p>';
    return;
  }
  const counts = {};
  (data||[]).forEach(r=>{
    if(!r.club) return;
    if(r.role==='pending_club' || r.role==='rejected_club' || r.role==='club_not_found') return; // no son clubes activos todavía
    counts[r.club] = (counts[r.club]||0)+1;
  });
  const clubs = Object.keys(counts).sort((a,b)=>a.localeCompare(b));
  if(tag) tag.textContent = tf('clubesRegistradosCount', {n:clubs.length});
  if(!clubs.length){
    box.innerHTML = `<p style="padding:14px 18px;color:var(--mist);font-size:12.5px;">${t('sinClubesRegistrados')}</p>`;
    return;
  }
  // Features (GPS / RPE+Wellness) de cada club, para pintar los toggles
  const featuresByClub = {};
  await Promise.all(clubs.map(async c=>{ featuresByClub[c] = await loadClubFeatures(c); }));

  const toggleBtn = (club, key, active, label) => `<button type="button" class="club-feature-toggle" data-club="${club}" data-key="${key}"
    style="padding:5px 10px;border-radius:7px;font:700 11px 'IBM Plex Mono';cursor:pointer;margin-right:6px;
    border:1px solid ${active?'var(--good)':'var(--line-strong)'};
    background:${active?'rgba(52,211,153,.15)':'transparent'};
    color:${active?'var(--good)':'var(--mist)'};">${active?'✓ ':'✗ '}${label}</button>`;

  const suspendBtn = (club, active) => `<button type="button" class="club-feature-toggle" data-club="${club}" data-key="active"
    style="padding:5px 10px;border-radius:7px;font:700 11px 'IBM Plex Mono';cursor:pointer;margin-right:6px;
    border:1px solid ${active?'var(--line-strong)':'var(--bad)'};
    background:${active?'transparent':'rgba(251,113,133,.15)'};
    color:${active?'var(--mist)':'var(--bad)'};">${active?'🔓 Activo':'🔒 Suspendido'}</button>`;

  box.innerHTML = clubs.map(c=>{
    const f = featuresByClub[c] || {gps:true, rpe_wellness:true, active:true};
    return `
    <div class="club-row" data-club="${c}" style="cursor:pointer;">
      <div class="nm">${c}${c===CURRENT_CLUB?' <span class="lb-record-tag">VIENDO AHORA</span>':''}${f.active===false?' <span class="lb-record-tag" style="background:var(--bad);">SUSPENDIDO</span>':''}</div>
      <div class="club-controls-row" style="margin:6px 0;display:flex;align-items:center;gap:14px;">
        <span style="font-family:'IBM Plex Mono';font-size:12.5px;color:var(--mist);white-space:nowrap;">${counts[c]} usuario${counts[c]===1?'':'s'}</span>
        ${toggleBtn(c,'gps',f.gps,'📡 GPS')}${toggleBtn(c,'rpe_wellness',f.rpe_wellness,'💚 RPE+Wellness')}${suspendBtn(c,f.active!==false)}
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('.club-feature-toggle').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const club = btn.dataset.club, key = btn.dataset.key;
      const current = await loadClubFeatures(club);
      const newValue = !current[key];
      if(key==='active' && !newValue){
        if(!confirm(`¿Suspender el acceso de "${club}"? Nadie de ese club (admin ni jugadores) va a poder entrar hasta que lo reactives. Sus datos no se tocan ni se borran.`)) return;
      }
      btn.disabled = true;
      try{
        const updated = await saveClubFeature(club, key, newValue);
        if(club === CURRENT_CLUB){ CLUB_FEATURES = updated; applyClubFeaturesToTabs(); }
        buildClubesList();
      }catch(err){
        alert('No se pudo actualizar: ' + err.message);
        btn.disabled = false;
      }
    });
  });
  box.querySelectorAll('.club-row').forEach(el=>{
    el.addEventListener('click', ()=> switchToClub(el.dataset.club));
  });
}
async function switchToClub(clubName){
  if(clubName === CURRENT_CLUB){ switchAdminTab(typeof currentAdminTab!=='undefined' ? currentAdminTab : (CLUB_FEATURES.gps ? 'jugadores' : (CLUB_FEATURES.rpe_wellness ? 'wellness' : 'clubes'))); return; }
  CURRENT_CLUB = clubName;
  // Las categorías son propias de cada club — si no se resetean acá, un club nuevo puede heredar
  // la categoría (ej. "U20") o los datos de categoría de jugadores con el mismo nombre del club anterior,
  // dejando el dashboard vacío sin razón aparente (todo queda filtrado a una categoría que no existe acá).
  CURRENT_CATEGORY = null;
  ROSTER_CATEGORIES = {};
  ARCHIVED_PLAYERS = new Set(); // igual que las categorías, es propio de cada club
  try{
    await loadRemoteData();
  }catch(error){
    console.error('switchToClub: loadRemoteData falló', error);
    alert(`No se pudieron cargar los datos de "${clubName}": ${error.message || error}. El dashboard puede quedar vacío hasta que reintentes.`);
  }
  await loadNextMatchDate();
  await loadRpeWindow();
  await loadWellnessWindow();
  CLUB_FEATURES = await loadClubFeatures(CURRENT_CLUB);
  await loadGkData();
  await getRosterExtraNames(); // asegura tener ARCHIVED_PLAYERS del club nuevo antes de armar la lista de jugadores
  deriveAll(ACTIVE_EVENTS);
  // RPE_REPORTS_CACHE es global y queda del club anterior — si no se limpia acá, Eficiencia (y otras vistas
  // que lo reusan sin volver a pedirlo) podrían mezclar el RPE de un club con el GPS de otro.
  RPE_REPORTS_CACHE = [];
  GK_RPE_REPORTS_CACHE = [];
  const efDetailPanel = document.getElementById('eficienciaDetailPanel');
  if(efDetailPanel) efDetailPanel.style.display = 'none';
  try{
    renderAll();
  }catch(e){
    // Mismo criterio que en startDashboard(): si algo dentro de renderAll() falla para este club en particular,
    // no queremos que se corte acá y deje todo lo que sigue (pestañas, botones, etc.) sin configurar.
    console.error('switchToClub: renderAll() falló', e);
  }
  setupPreviewBar();
  setupGkPreviewBar();
  setupAddPlayerBar();
  setupManageRosterBar();
  setupUploadButtons();
  setupCategorySelector();
  setupNextMatchBar();
  setupRestDayBar();
  setupRpeWindowBar();
  setupWellnessWindowBar();
  applyClubFeaturesToTabs();
  buildPendingRequestsPanel();
  const subEl = document.querySelector('.top .brand-sub');
  if(subEl) subEl.textContent = `Viendo: ${CURRENT_CLUB} (modo Owner)`;
  // Se queda en la MISMA pestaña en la que estabas si sigue siendo válida para el club nuevo
  // (applyClubFeaturesToTabs ya te redirige si dejó de estarlo) — y de paso refresca su contenido,
  // que hasta acá seguía mostrando los datos del club anterior.
  switchAdminTab(typeof currentAdminTab!=='undefined' ? currentAdminTab : (CLUB_FEATURES.gps ? 'jugadores' : (CLUB_FEATURES.rpe_wellness ? 'wellness' : 'clubes')));
}
