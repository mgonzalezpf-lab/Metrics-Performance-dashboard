// ---------- Admin/Owner: aprobar solicitudes de Staff / Entrenador de arqueros con un clic, sin SQL ----------
async function buildPendingRequestsPanel(){
  const panel = document.getElementById('pendingRequestsPanel');
  if(!panel) return;
  if(!(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'))){ panel.style.display='none'; return; }

  const {data, error} = await supabaseClient.from('player_profiles')
    .select('user_id,email,role,created_at')
    .eq('club', CURRENT_CLUB)
    .in('role', ['pending_staff','pending_gk_coach'])
    .order('created_at', {ascending:true});
  if(error){ console.warn('No se pudieron cargar las solicitudes pendientes:', error); panel.style.display='none'; return; }

  if(!data || !data.length){ panel.style.display='none'; return; }
  panel.style.display = '';
  document.getElementById('pendingRequestsCount').textContent = `${data.length} esperando aprobación`;

  const roleLabel = (r)=> r==='pending_gk_coach' ? 'Entrenador de arqueros' : 'Staff (médico y técnico)';
  const box = document.getElementById('pendingRequestsList');
  box.innerHTML = data.map(r=>{
    const fecha = new Date(r.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 4px;border-bottom:1px solid var(--line);flex-wrap:wrap;">
      <div>
        <div style="color:var(--bone);font-weight:600;font-size:13px;">${r.email || 'Sin email'}</div>
        <div style="color:var(--mist);font-size:11.5px;margin-top:2px;">Pide acceso como <b style="color:var(--gold-bright);">${roleLabel(r.role)}</b> · ${fecha}</div>
      </div>
      <button class="upload-btn" data-approve="${r.user_id}" data-newrole="${r.role==='pending_gk_coach'?'gk_coach':'staff'}" style="padding:7px 14px;white-space:nowrap;">✓ Aprobar</button>
    </div>`;
  }).join('');

  box.querySelectorAll('[data-approve]').forEach(btn=>{
    btn.onclick = ()=> approvePendingUser(btn.dataset.approve, btn.dataset.newrole, btn);
  });
}
async function approvePendingUser(userId, newRole, btnEl){
  btnEl.disabled = true;
  btnEl.textContent = 'Aprobando…';
  const {error} = await supabaseClient.from('player_profiles')
    .update({role:newRole, player_name:null})
    .eq('user_id', userId).eq('club', CURRENT_CLUB);
  if(error){
    console.error(error);
    btnEl.disabled = false;
    btnEl.textContent = '⚠️ Reintentar';
    return;
  }
  await buildPendingRequestsPanel();
}
