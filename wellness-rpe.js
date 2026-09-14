async function getMyTodayRpe(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user) return null;
  const fecha = sessionDateForWindow(RPE_WINDOW_START, RPE_WINDOW_END);
  const {data,error}=await supabaseClient.from('rpe_reports').select('rpe,minutos').eq('user_id',user.id).eq('fecha',fecha).maybeSingle();
  if(error){ console.warn(error); return null; }
  return data || null;
}
async function submitRpe(value){
  const {data:{user}}=await supabaseClient.auth.getUser();
  const fecha = sessionDateForWindow(RPE_WINDOW_START, RPE_WINDOW_END);
  const {error}=await supabaseClient.from('rpe_reports').upsert({
    user_id:user.id, club:CURRENT_CLUB, player_name:myProfile.player_name, fecha, rpe:value, updated_at:new Date().toISOString()
  }, {onConflict:'user_id,fecha'});
  if(error) throw error;
}
async function getMyTodayWellness(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user) return null;
  const fecha = sessionDateForWindow(WELLNESS_WINDOW_START, WELLNESS_WINDOW_END);
  const {data,error}=await supabaseClient.from('wellness_reports').select('*').eq('user_id',user.id).eq('fecha',fecha).maybeSingle();
  if(error){ console.warn(error); return null; }
  return data || null;
}
async function submitWellness(payload){
  const {data:{user}}=await supabaseClient.auth.getUser();
  const fecha = sessionDateForWindow(WELLNESS_WINDOW_START, WELLNESS_WINDOW_END);
  const {error}=await supabaseClient.from('wellness_reports').upsert({
    user_id:user.id, club:CURRENT_CLUB, player_name:myProfile.player_name, fecha,
    sueno:payload.sueno, fatiga:payload.fatiga, dolor_muscular:payload.dolor_muscular, estres:payload.estres, animo:payload.animo,
    tqr:payload.tqr, observacion:payload.observacion||null, zonas_dolor:payload.zonas_dolor||[], updated_at:new Date().toISOString()
  }, {onConflict:'user_id,fecha'});
  if(error) throw error;
}
const RPE_SCALE = [
  {n:0,  color:'#D9D9D9', emoji:'😎', es:'En reposo, sentado',           en:'At rest, sitting',       ar:'في حالة الراحة، جالسًا'},
  {n:1,  color:'#8BC34A', emoji:'👍', es:'Esfuerzo muy leve',            en:'Very light effort',      ar:'جهد خفيف جدًا'},
  {n:2,  color:'#8BC34A', emoji:'👍', es:'Esfuerzo muy leve',            en:'Very light effort',      ar:'جهد خفيف جدًا'},
  {n:3,  color:'#2E7D32', emoji:'😄', es:'Esfuerzo leve',                en:'Light effort',           ar:'جهد خفيف'},
  {n:4,  color:'#FFF176', emoji:'🙂', es:'Ejercicio suave',              en:'Soft exercise',          ar:'تمرين ناعم'},
  {n:5,  color:'#FFEB3B', emoji:'😐', es:'Esfuerzo moderado',            en:'Moderate effort',        ar:'جهد معتدل'},
  {n:6,  color:'#FDD835', emoji:'😕', es:'Ejercicio algo duro',          en:'Sort of hard exercise',  ar:'نوع من التمارين الرياضية الصعبة'},
  {n:7,  color:'#FB8C00', emoji:'😬', es:'Ejercicio de alta intensidad', en:'High intensity exercise',ar:'تمارين رياضية عالية الكثافة'},
  {n:8,  color:'#F4511E', emoji:'🥵', es:'Intenso',                      en:'Intense',                ar:'مكثفة'},
  {n:9,  color:'#E53935', emoji:'🥶', es:'Muy intenso',                  en:'Very intense',           ar:'مكثفة جدًا'},
  {n:10, color:'#8E24AA', emoji:'🤯', es:'Esfuerzo máximo',              en:'Maximum effort',         ar:'أقصى جهد'},
];
function buildRpeWidget(existing){
  const panel = document.getElementById('rpePanel');
  if(!panel) return;
  if(!CLUB_FEATURES.rpe_wellness){ panel.style.display='none'; return; }
  panel.style.display='block';
  const scale = document.getElementById('rpeScale');
  const submitBtn = document.getElementById('rpeSubmit');
  const status = document.getElementById('rpeStatus');
  const rtl = currentLang==='ar';
  scale.style.flexDirection = 'column';

  // Bloqueo por horario: solo se puede ENVIAR (no ver lo ya enviado) entre 18:30 y 24:00.
  if(!existing && !isRpeSubmitUnlocked()){
    scale.innerHTML = '';
    submitBtn.style.display = 'none';
    status.className = 'rpe-status-msg locked';
    status.textContent = rpeLockMsg();
    return;
  }
  status.className = 'rpe-status-msg';

  // Ya envió su RPE hoy: se bloquea, no puede reenviar ni cambiar.
  if(existing){
    const row = RPE_SCALE.find(r=>r.n===existing.rpe) || RPE_SCALE[0];
    const label = row[currentLang] || row.es;
    scale.innerHTML = `<div style="display:flex;align-items:center;gap:12px;width:100%;padding:8px 12px;border-radius:8px;border:2px solid var(--gold);background:rgba(255,255,255,.03);opacity:.85;flex-direction:${rtl?'row-reverse':'row'};">
      <span style="min-width:34px;height:34px;border-radius:6px;background:${row.color};color:#14143A;font-weight:800;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono';flex-shrink:0;">${row.n}</span>
      <span style="flex:1;color:var(--bone);font-size:13px;" dir="${rtl?'rtl':'ltr'}">${label}</span>
      <span style="font-size:20px;flex-shrink:0;">${row.emoji}</span>
    </div>`;
    submitBtn.style.display = 'none';
    status.textContent = `✅ Ya enviaste tu RPE de hoy (${existing.rpe}/10). Podrás reportar de nuevo mañana.`;
    return;
  }

  submitBtn.style.display = 'inline-block';
  let selected = null;
  scale.innerHTML = RPE_SCALE.map(row=>{
    const label = row[currentLang] || row.es;
    return `<button type="button" class="rpe-btn" data-n="${row.n}"
      style="display:flex;align-items:center;gap:12px;width:100%;padding:8px 12px;border-radius:8px;border:2px solid transparent;background:rgba(255,255,255,.03);cursor:pointer;text-align:${rtl?'right':'left'};flex-direction:${rtl?'row-reverse':'row'};">
      <span style="min-width:34px;height:34px;border-radius:6px;background:${row.color};color:#14143A;font-weight:800;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono';flex-shrink:0;">${row.n}</span>
      <span style="flex:1;color:var(--bone);font-size:13px;" dir="${rtl?'rtl':'ltr'}">${label}</span>
      <span style="font-size:20px;flex-shrink:0;">${row.emoji}</span>
    </button>`;
  }).join('');
  submitBtn.disabled = true;
  status.textContent = '';
  scale.querySelectorAll('.rpe-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      selected = Number(btn.dataset.n);
      scale.querySelectorAll('.rpe-btn').forEach(b=>{
        const active = Number(b.dataset.n)===selected;
        b.classList.toggle('active', active);
        b.style.borderColor = active ? 'var(--gold)' : 'transparent';
      });
      submitBtn.disabled = false;
    });
  });
  submitBtn.onclick = async ()=>{
    if(selected===null) return;
    submitBtn.disabled = true; status.textContent = t('guardando');
    scale.querySelectorAll('.rpe-btn').forEach(b=> b.disabled = true);
    try{
      await submitRpe(selected);
      buildRpeWidget({rpe:selected});
    }catch(error){
      status.textContent = tf('noSePudoGuardar',{e:error.message});
      scale.querySelectorAll('.rpe-btn').forEach(b=> b.disabled = false);
      submitBtn.disabled = false;
    }
  };
}
// ---------- Wellness: formulario diario del jugador (sueño, fatiga, dolor muscular, estrés, ánimo + mapa de dolor) ----------
const WELLNESS_CATEGORIES = [
  {key:'sueno', label:{es:'Calidad del sueño', en:'Sleep quality', ar:'جودة النوم'},
    opts:{
      es:['Muy mal, no pude dormir','Mal, sueño muy inquieto','Más o menos, me costó dormirme / me desperté','Bien','Muy bien'],
      en:['Very bad, couldn\'t sleep','Bad, very restless sleep','So-so, hard to fall asleep / woke up','Good','Very good'],
      ar:['سيئ جدًا، لم أستطع النوم','سيئ، نوم مضطرب جدًا','متوسط، صعوبة في النوم / استيقظت','جيد','جيد جدًا'],
    }},
  {key:'fatiga', label:{es:'Nivel de fatiga', en:'Fatigue level', ar:'مستوى التعب'},
    opts:{
      es:['Muy fatigado','Algo cansado','Normal','Bien','Al 100%'],
      en:['Very fatigued','Somewhat tired','Normal','Good','100%'],
      ar:['متعب جدًا','متعب نوعًا ما','طبيعي','جيد','100%'],
    }},
  {key:'dolor_muscular', label:{es:'Dolor muscular', en:'Muscle soreness', ar:'ألم عضلي'},
    opts:{
      es:['Mucho dolor','Bastante dolor','Algunas molestias','Leve o casi nada','Nada de dolor'],
      en:['A lot of pain','Quite a bit of pain','Some discomfort','Mild or almost none','No pain at all'],
      ar:['ألم شديد','ألم كبير','بعض الانزعاج','خفيف أو شبه معدوم','لا يوجد ألم إطلاقًا'],
    }},
  {key:'estres', label:{es:'Estrés', en:'Stress', ar:'التوتر'},
    opts:{
      es:['Muy estresado','Estresado','Normal','Relajado','Muy relajado'],
      en:['Very stressed','Stressed','Normal','Relaxed','Very relaxed'],
      ar:['متوتر جدًا','متوتر','طبيعي','مسترخٍ','مسترخٍ جدًا'],
    }},
  {key:'animo', label:{es:'Ánimo / motivación', en:'Mood / motivation', ar:'الحالة المزاجية / الدافع'},
    opts:{
      es:['Muy enojado e irritable','Mal genio','Menos interesado de lo normal en mis actividades','Buen ánimo y humor','Muy positivo'],
      en:['Very angry and irritable','Bad mood','Less interested than usual in my activities','Good mood','Very positive'],
      ar:['غاضب جدًا وسريع الانفعال','مزاج سيء','أقل اهتمامًا من المعتاد بأنشطتي','مزاج جيد','إيجابي جدًا'],
    }},
];
// Descripción de un valor (1-5) de una de las 5 categorías de Wellness, en el idioma actual —
// para mostrar en el tooltip "fantasma" de la tabla de Wellness del admin.
function wellnessCatCaption(key, value){
  if(value===null || value===undefined) return '';
  const cat = WELLNESS_CATEGORIES.find(c=>c.key===key);
  if(!cat) return '';
  const arr = cat.opts[currentLang] || cat.opts.es;
  return arr[value-1] || '';
}
// Escala oficial de TQR (Total Quality Recovery, Kenttä & Hassmén) — va de 0 a 10, y por diseño
// solo los números "ancla" tienen descripción; los impares intermedios (1,3,7,9) quedan sin texto,
// tal como en la escala original en papel que usan los preparadores físicos.
const TQR_CAPTIONS = {
  es: ['No recuperado / Extremadamente cansado','Muy poco recuperado / Muy cansado','Poco recuperado / Bastante cansado','Ligeramente recuperado / Cansado','Algo recuperado','Adecuadamente recuperado','Bastante recuperado','Recuperado / Con energía','Bien recuperado / Con gran energía','Muy bien recuperado / Con bastante energía','Muy bien recuperado / Con mucha energía'],
  en: ['Not recovered / Extremely tired','Very poorly recovered / Very tired','Poorly recovered / Quite tired','Slightly recovered / Tired','Somewhat recovered','Adequately recovered','Well recovered','Recovered / With energy','Well recovered / Great energy','Very well recovered / Plenty of energy','Fully recovered / Great energy'],
  ar: ['غير متعافٍ / متعب جدًا','متعافٍ قليلًا جدًا / متعب جدًا','متعافٍ قليلًا / متعب جدًا','متعافٍ بشكل طفيف / متعب','متعافٍ إلى حد ما','متعافٍ بشكل مناسب','متعافٍ جيدًا','متعافٍ / بطاقة جيدة','متعافٍ جيدًا / طاقة عالية','متعافٍ جيدًا جدًا / طاقة وفيرة','متعافٍ تمامًا / طاقة عالية جدًا'],
};
function tqrCaption(n){
  if(n===null || n===undefined) return '';
  const arr = TQR_CAPTIONS[currentLang] || TQR_CAPTIONS.es;
  return arr[n] || '';
}
let wellnessState = { values:{}, zonas:[], view:'front' };
function renderBodyMapSvg(){
  const zones = wellnessState.view==='front' ? BODY_ZONES_FRONT : BODY_ZONES_BACK;
  const circles = zones.map(z=>{
    const marcada = wellnessState.zonas.some(zd=>zd.zona===z.id);
    return `<circle data-zona="${z.id}" cx="${z.cx}" cy="${z.cy}" r="${z.r}" fill="${marcada?'rgba(251,113,133,.55)':'rgba(103,232,249,.12)'}" stroke="${marcada?'#FB7185':'rgba(103,232,249,.4)'}" stroke-width="1.5" style="cursor:pointer;" class="body-zone"/>`;
  }).join('');
  return `<svg viewBox="0 0 220 340" style="width:100%;max-width:200px;display:block;margin:0 auto;">
    <ellipse cx="110" cy="26" rx="16" ry="18" fill="rgba(231,231,251,.06)" stroke="rgba(231,231,251,.18)"/>
    <path d="M 78 50 Q 110 40 142 50 L 150 160 Q 110 175 70 160 Z" fill="rgba(231,231,251,.06)" stroke="rgba(231,231,251,.18)"/>
    <path d="M 92 158 L 84 316 L 102 316 L 105 190 L 115 190 L 118 316 L 136 316 L 128 158 Z" fill="rgba(231,231,251,.06)" stroke="rgba(231,231,251,.18)"/>
    <path d="M 72 55 L 45 130 L 55 134 L 82 62 Z" fill="rgba(231,231,251,.06)" stroke="rgba(231,231,251,.18)"/>
    <path d="M 148 55 L 175 130 L 165 134 L 138 62 Z" fill="rgba(231,231,251,.06)" stroke="rgba(231,231,251,.18)"/>
    ${circles}
  </svg>`;
}
function buildWellnessWidget(existing){
  const panel = document.getElementById('wellnessPanel');
  if(!panel) return;
  if(!CLUB_FEATURES.rpe_wellness){ panel.style.display='none'; return; }
  panel.style.display='block';
  const box = document.getElementById('wellnessForm');
  const submitBtn = document.getElementById('wellnessSubmit');
  const status = document.getElementById('wellnessStatus');
  if(!box || !submitBtn || !status) return;

  if(!existing && !isWellnessSubmitUnlocked()){
    box.innerHTML = '';
    submitBtn.style.display = 'none';
    status.className = 'rpe-status-msg locked';
    status.textContent = wellnessLockMsg();
    return;
  }
  status.className = 'rpe-status-msg';

  if(existing){
    const zonas = existing.zonas_dolor || [];
    const tqrDesc = tqrCaption(existing.tqr);
    const tqrCard = `<div style="flex:1;min-width:130px;padding:10px 12px;border-radius:8px;border:2px solid var(--gold);background:rgba(255,255,255,.03);">
        <div style="font-size:11px;color:var(--mist);margin-bottom:4px;">🔋 Recuperación (TQR)</div>
        <div style="font-size:20px;font-weight:800;color:var(--bone);">${existing.tqr??'—'}<span style="font-size:12px;color:var(--mist);">/10</span></div>
        ${tqrDesc ? `<div style="font-size:10.5px;color:var(--gold);margin-top:2px;font-style:italic;">${tqrDesc}</div>` : ''}
      </div>`;
    box.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
      ${WELLNESS_CATEGORIES.map(c=>{
        const val = existing[c.key];
        const opts = c.opts[currentLang] || c.opts.es;
        const desc = (val && opts[val-1]) ? opts[val-1] : '';
        return `<div style="flex:1;min-width:130px;padding:10px 12px;border-radius:8px;border:2px solid var(--gold);background:rgba(255,255,255,.03);">
        <div style="font-size:11px;color:var(--mist);margin-bottom:4px;">${c.label[currentLang]||c.label.es}</div>
        <div style="font-size:20px;font-weight:800;color:var(--bone);">${val??'—'}<span style="font-size:12px;color:var(--mist);">/5</span></div>
        ${desc ? `<div style="font-size:10.5px;color:var(--gold);margin-top:2px;font-style:italic;">${desc}</div>` : ''}
      </div>`;
      }).join('')}
      ${tqrCard}
    </div>
    ${zonas.length ? `<div style="font-size:12px;color:var(--warn);margin-bottom:6px;">🩹 Zonas reportadas: ${zonas.map(z=>`${zoneLabel(z.zona)} (${painTypeLabel(z.tipo)})`).join(', ')}</div>` : ''}
    ${existing.observacion ? `<div style="font-size:12px;color:var(--mist);font-style:italic;">"${existing.observacion}"</div>` : ''}`;
    submitBtn.style.display = 'none';
    status.textContent = `✅ Ya enviaste tu Wellness de hoy. Podrás reportar de nuevo mañana.`;
    return;
  }

  submitBtn.style.display = 'inline-block';
  submitBtn.disabled = false;
  wellnessState = { values:{}, zonas:[], view:'front' };
  status.textContent = '';

  const catRows = WELLNESS_CATEGORIES.map(c=>`
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;color:var(--mist);margin-bottom:5px;">${c.label[currentLang]||c.label.es} <span style="opacity:.6;">(1 ${t('malAbrev')} · 5 ${t('bienAbrev')})</span></div>
      <div style="display:flex;gap:6px;" data-cat="${c.key}">
        ${[1,2,3,4,5].map(n=>`<button type="button" class="wcat-btn" data-cat="${c.key}" data-n="${n}" style="flex:1;padding:9px 0;border-radius:8px;border:2px solid transparent;background:rgba(255,255,255,.03);color:var(--bone);font:700 13px 'IBM Plex Mono';cursor:pointer;">${n}</button>`).join('')}
      </div>
      <div id="wcap-${c.key}" style="font-size:11px;color:var(--gold);margin-top:5px;min-height:14px;font-style:italic;"></div>
    </div>`).join('');

  const tqrRow = `
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;color:var(--mist);margin-bottom:5px;">🔋 ${t('comoFueTuRecuperacion')} <span style="opacity:.6;">(0 ${t('malAbrev')} · 10 ${t('bienAbrev')})</span></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;" data-cat="tqr">
        ${[0,1,2,3,4,5,6,7,8,9,10].map(n=>`<button type="button" class="wcat-btn" data-cat="tqr" data-n="${n}" style="flex:1;min-width:26px;padding:9px 0;border-radius:8px;border:2px solid transparent;background:rgba(255,255,255,.03);color:var(--bone);font:700 12px 'IBM Plex Mono';cursor:pointer;">${n}</button>`).join('')}
      </div>
      <div id="wcap-tqr" style="font-size:11px;color:var(--gold);margin-top:5px;min-height:14px;font-style:italic;"></div>
    </div>`;

  box.innerHTML = `
    ${catRows}
    ${tqrRow}
    <div style="margin-top:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:12px;color:var(--mist);">🩹 ${t('tienesAlgunaMolestia')}</span>
        <span style="display:flex;gap:4px;">
          <button type="button" id="bodyViewFront" class="upload-btn" style="padding:5px 10px;font-size:11px;">${t('frenteLabel')}</button>
          <button type="button" id="bodyViewBack" class="upload-btn" style="padding:5px 10px;font-size:11px;">${t('espaldaLabel')}</button>
        </span>
      </div>
      <div id="bodyMapWrap">${renderBodyMapSvg()}</div>
      <div id="zonasSeleccionadas" style="margin-top:8px;display:flex;flex-direction:column;gap:6px;"></div>
    </div>
    <div style="margin-top:14px;">
      <div style="font-size:12px;color:var(--mist);margin-bottom:5px;">${t('observacionesOpcional')}</div>
      <textarea id="wellnessObs" rows="2" style="width:100%;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:8px;color:var(--bone);font:400 12.5px 'IBM Plex Mono';padding:8px;resize:vertical;" placeholder="${t('observacionesPlaceholder')}"></textarea>
    </div>`;

  function wireCatButtons(){
    box.querySelectorAll('.wcat-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const cat = btn.dataset.cat, n = Number(btn.dataset.n);
        wellnessState.values[cat] = n;
        box.querySelectorAll(`.wcat-btn[data-cat="${cat}"]`).forEach(b=>{
          const active = Number(b.dataset.n)===n;
          b.style.borderColor = active ? 'var(--gold)' : 'transparent';
          b.style.background = active ? 'rgba(212,175,55,.15)' : 'rgba(255,255,255,.03)';
        });
        const catDef = WELLNESS_CATEGORIES.find(c=>c.key===cat);
        const capEl = document.getElementById(`wcap-${cat}`);
        if(catDef && capEl){
          const opts = catDef.opts[currentLang] || catDef.opts.es;
          capEl.textContent = opts[n-1] || '';
        } else if(cat==='tqr' && capEl){
          capEl.textContent = tqrCaption(n);
        }
        checkReady();
      });
    });
  }
  function renderZonasList(){
    const wrap = document.getElementById('zonasSeleccionadas');
    if(!wrap) return;
    if(!wellnessState.zonas.length){ wrap.innerHTML=''; return; }
    wrap.innerHTML = wellnessState.zonas.map((z,i)=>`
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(251,113,133,.08);border:1px solid rgba(251,113,133,.3);border-radius:6px;font-size:11.5px;">
        <span style="flex:1;color:var(--bone);">${zoneLabel(z.zona)}</span>
        <select data-zi="${i}" class="zona-tipo-select" style="background:var(--pitch-800);color:var(--bone);border:1px solid var(--line);border-radius:5px;font:400 11px 'IBM Plex Mono';padding:2px 4px;">
          ${PAIN_TYPE_KEYS.map(k=>`<option value="${k}" ${painTypeKey(z.tipo)===k?'selected':''}>${painTypeLabel(k)}</option>`).join('')}
        </select>
        <button type="button" data-zi="${i}" class="zona-quitar" style="background:none;border:none;color:var(--bad);cursor:pointer;font-size:14px;">✕</button>
      </div>`).join('');
    wrap.querySelectorAll('.zona-tipo-select').forEach(sel=>{
      sel.addEventListener('change', ()=>{ wellnessState.zonas[Number(sel.dataset.zi)].tipo = sel.value; });
    });
    wrap.querySelectorAll('.zona-quitar').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        wellnessState.zonas.splice(Number(btn.dataset.zi),1);
        redrawBodyMap(); renderZonasList();
      });
    });
  }
  function redrawBodyMap(){
    const wrap = document.getElementById('bodyMapWrap');
    if(wrap) wrap.innerHTML = renderBodyMapSvg();
    wireBodyZones();
  }
  function wireBodyZones(){
    box.querySelectorAll('.body-zone').forEach(el=>{
      el.addEventListener('click', ()=>{
        const zonaId = el.dataset.zona;
        const existente = wellnessState.zonas.find(z=>z.zona===zonaId);
        if(existente){ wellnessState.zonas = wellnessState.zonas.filter(z=>z.zona!==zonaId); }
        else{ wellnessState.zonas.push({zona:zonaId, tipo:PAIN_TYPE_KEYS[0]}); }
        redrawBodyMap(); renderZonasList();
      });
    });
  }
  function checkReady(){
    const allSet = WELLNESS_CATEGORIES.every(c=> wellnessState.values[c.key]!==undefined) && wellnessState.values.tqr!==undefined;
    submitBtn.disabled = !allSet;
  }

  wireCatButtons();
  wireBodyZones();
  submitBtn.disabled = true;

  const btnFront = document.getElementById('bodyViewFront');
  const btnBack = document.getElementById('bodyViewBack');
  if(btnFront) btnFront.addEventListener('click', ()=>{ wellnessState.view='front'; redrawBodyMap(); });
  if(btnBack) btnBack.addEventListener('click', ()=>{ wellnessState.view='back'; redrawBodyMap(); });

  submitBtn.onclick = async ()=>{
    submitBtn.disabled = true; status.textContent = t('guardando');
    try{
      const obsEl = document.getElementById('wellnessObs');
      await submitWellness({
        sueno: wellnessState.values.sueno, fatiga: wellnessState.values.fatiga,
        dolor_muscular: wellnessState.values.dolor_muscular, estres: wellnessState.values.estres, animo: wellnessState.values.animo,
        tqr: wellnessState.values.tqr,
        observacion: obsEl ? obsEl.value.trim() : '', zonas_dolor: wellnessState.zonas,
      });
      const nuevo = await getMyTodayWellness();
      buildWellnessWidget(nuevo);
    }catch(error){
      status.textContent = tf('noSePudoGuardar',{e:error.message});
      submitBtn.disabled = false;
    }
  };
}
function rpeAcwrStatus(ratio){
  if(ratio===null) return {status:'insuf', label:t('acwrInsuf'), varName:'--mist'};
  if(ratio<0.8) return {status:'low', label:t('acwrLow'), varName:'--low'};
  if(ratio<1.3) return {status:'optimal', label:t('acwrOptimal'), varName:'--good'};
  if(ratio<1.5) return {status:'caution', label:t('acwrCaution'), varName:'--warn'};
  return {status:'high', label:t('acwrHigh'), varName:'--bad'};
}
async function buildRpeTeamList(){
  const box = document.getElementById('rpeTeamList');
  if(!box) return;
  const {data,error} = await supabaseClient.from('rpe_reports').select('player_name,fecha,rpe,minutos,updated_at').eq('club',CURRENT_CLUB).order('fecha',{ascending:false});
  if(error){
    box.innerHTML = `<div style="padding:14px 0;color:var(--mist);font-size:12.5px;">${t('noSePudoRpePlantel')}</div>`;
    const tagElErr = document.getElementById('rpePlantelTag');
    if(tagElErr) tagElErr.textContent = t('rpePlantelTag');
    return;
  }
  RPE_REPORTS_CACHE = data || [];
  buildRpeAcwrChart();
  const byPlayerRpe = {};
  RPE_REPORTS_CACHE.forEach(r=>{ (byPlayerRpe[normalizeNameKey(r.player_name)] = byPlayerRpe[normalizeNameKey(r.player_name)]||[]).push(r); });
  const today = todayISO();
  // Usa la MISMA fecha de referencia que la tabla de abajo (el selector de fecha), no siempre "hoy" —
  // antes calculaba acá con hoy fijo, y la tabla con la fecha elegida, así que si alguien miraba un día
  // anterior, los números de la lista y los de la tabla no coincidían entre sí.
  const refDate = document.getElementById('rpeDatePicker')?.value || today;
  const tagEl = document.getElementById('rpePlantelTag');
  if(tagEl) tagEl.textContent = `${t('rpePlantelTag')} ${tf('ratioAlDia', {d: refDate.split('-').reverse().join('/')})}`;
  const order = {high:0, caution:1, optimal:2, low:3, insuf:4};
  // Plantel completo: jugadores con datos GPS + los que se agregaron manualmente (todavía sin GPS cargado)
  const rosterExtra = await getRosterExtraNames();
  const allPlayers = mergePlayerNames(players, rosterExtra).filter(p=>!isGoalkeeper(p));
  const rows = allPlayers.map(p=>{
    const reportsForPlayer = byPlayerRpe[normalizeNameKey(p)] || [];
    const {ratio} = computeRpeACWR(reportsForPlayer, refDate);
    const st = rpeAcwrStatus(ratio);
    return {p, ratio, ...st};
  }).sort((a,b)=> (order[a.status]-order[b.status]) || ((b.ratio||0)-(a.ratio||0)));
  box.innerHTML = rows.map((r,i)=>{
    const pct = r.ratio!==null ? Math.min(100, r.ratio/2*100) : null;
    return `<div class="acwr-row ${r.p===state.player?'active':''}" data-p="${r.p}">
      <div class="rk">${i+1<10?'0':''}${i+1}</div>
      <div class="nm">${r.p}</div>
      <div class="acwr-track">${pct!==null?`<div class="acwr-marker" style="left:${pct}%"></div>`:''}</div>
      <div class="acwr-ratio">${r.ratio!==null? r.ratio.toFixed(2) : '—'}</div>
      <div><span class="acwr-badge" style="background:var(${r.varName});color:#14143A;">${r.label}</span></div>
    </div>`;
  }).join('');
  box.querySelectorAll('.acwr-row').forEach(el=> el.addEventListener('click',()=>selectPlayer(el.dataset.p)));
  buildRpeLoadTable(document.getElementById('rpeDatePicker').value || today);
}
// ---------- RPE de arqueros: misma mecánica que RPE del plantel, pero solo para arqueros (gkPlayers) ----------
let GK_RPE_REPORTS_CACHE = [];
async function buildGkRpeTeamList(){
  const box = document.getElementById('gkRpeTeamList');
  if(!box) return;
  const {data,error} = await supabaseClient.from('rpe_reports').select('player_name,fecha,rpe,minutos,updated_at').eq('club',CURRENT_CLUB).order('fecha',{ascending:false});
  if(error){
    box.innerHTML = `<div style="padding:14px 0;color:var(--mist);font-size:12.5px;">${t('noSePudoRpeArqueros')}</div>`;
    const gkTagElErr = document.getElementById('gkRpePlantelTag');
    if(gkTagElErr) gkTagElErr.textContent = t('gkPercepcionEsfuerzo');
    return;
  }
  GK_RPE_REPORTS_CACHE = (data || []).filter(r => isGoalkeeper(r.player_name));
  const byPlayerRpe = {};
  GK_RPE_REPORTS_CACHE.forEach(r=>{ (byPlayerRpe[normalizeNameKey(r.player_name)] = byPlayerRpe[normalizeNameKey(r.player_name)]||[]).push(r); });
  const today = todayISO();
  // Misma fecha de referencia que la tabla de abajo (mismo motivo que en RPE de jugadores de campo).
  const refDate = document.getElementById('gkRpeDatePicker')?.value || today;
  const gkTagEl = document.getElementById('gkRpePlantelTag');
  if(gkTagEl) gkTagEl.textContent = `${t('gkPercepcionEsfuerzo')} ${tf('ratioAlDia', {d: refDate.split('-').reverse().join('/')})}`;
  const order = {high:0, caution:1, optimal:2, low:3, insuf:4};
  if(!gkPlayers.length){
    box.innerHTML = `<div style="padding:14px 0;color:var(--mist);font-size:12.5px;">${t('gkSinArqueros')}</div>`;
    return;
  }
  const rows = gkPlayers.map(p=>{
    const reportsForPlayer = byPlayerRpe[normalizeNameKey(p)] || [];
    const {ratio} = computeRpeACWR(reportsForPlayer, refDate);
    const st = rpeAcwrStatus(ratio);
    return {p, ratio, ...st};
  }).sort((a,b)=> (order[a.status]-order[b.status]) || ((b.ratio||0)-(a.ratio||0)));
  box.innerHTML = rows.map((r,i)=>{
    const pct = r.ratio!==null ? Math.min(100, r.ratio/2*100) : null;
    return `<div class="acwr-row ${r.p===state.player?'active':''}" data-p="${r.p}">
      <div class="rk">${i+1<10?'0':''}${i+1}</div>
      <div class="nm">${r.p}</div>
      <div class="acwr-track">${pct!==null?`<div class="acwr-marker" style="left:${pct}%"></div>`:''}</div>
      <div class="acwr-ratio">${r.ratio!==null? r.ratio.toFixed(2) : '—'}</div>
      <div><span class="acwr-badge" style="background:var(${r.varName});color:#14143A;">${r.label}</span></div>
    </div>`;
  }).join('');
  box.querySelectorAll('.acwr-row').forEach(el=> el.addEventListener('click',()=>selectPlayer(el.dataset.p)));
  const gkDatePicker = document.getElementById('gkRpeDatePicker');
  buildGkRpeLoadTable(gkDatePicker ? (gkDatePicker.value || today) : today);
}
function buildGkRpeLoadTable(dateStr){
  const table = document.getElementById('gkRpeLoadTable');
  if(!table) return;
  const saveAllBtn = document.getElementById('gkRpeSaveAllBtn');
  if(saveAllBtn){
    saveAllBtn.disabled = !(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'));
    saveAllBtn.style.opacity = saveAllBtn.disabled ? '.45' : '1';
    saveAllBtn.style.cursor = saveAllBtn.disabled ? 'default' : 'pointer';
  }
  const byPlayerRpe = {};
  GK_RPE_REPORTS_CACHE.forEach(r=>{ (byPlayerRpe[normalizeNameKey(r.player_name)] = byPlayerRpe[normalizeNameKey(r.player_name)]||[]).push(r); });
  const rowsData = gkPlayers.map(p=>{
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
          ? `<input type="number" min="0" max="240" class="gk-rpe-min-input" data-player="${r.todayReport.player_name}" data-fecha="${dateStr}" value="${r.minVal!==null?r.minVal:''}" placeholder="—" style="width:56px;padding:5px 6px;border-radius:6px;border:1px solid var(--line-strong);background:var(--pitch-950);color:var(--bone);font:12px 'IBM Plex Mono';outline:none;">`
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
    <td class="metric-name" style="color:var(--gold-bright);">${t('gkPromedioArqueros')}</td>
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
         <input id="gkRpeMinBulkFill" type="number" min="0" max="240" placeholder="min" title="Escribe un valor y aplícalo a todas las filas" style="width:46px;padding:3px 5px;border-radius:5px;border:1px solid var(--gold);background:var(--pitch-950);color:var(--gold-bright);font:11px 'IBM Plex Mono';outline:none;">
         <button id="gkRpeMinBulkApplyBtn" type="button" title="Aplicar este valor a todos los arqueros" style="padding:3px 8px;border-radius:5px;border:1px solid var(--gold);background:var(--gold);color:var(--pitch-950);font:700 11px 'IBM Plex Mono';cursor:pointer;">✏️ Aplicar a todos</button>
       </span></th>`
    : `<th>${t('colMin')}</th>`;
  table.innerHTML = `<thead><tr>
    <th>${t('colJugador')}</th><th>${t('colHora')}</th><th>${t('colRpe')}</th>${minHeaderCell}<th>${t('colCDiaria')}</th><th>${t('colCAguda')}</th><th>${t('colCCronica')}</th><th>${t('colRatioAC')}</th>
  </tr></thead><tbody>${rowsHtml}${footerHtml}</tbody>`;
  table.querySelectorAll('.gk-rpe-min-input').forEach(input=>{
    const save = async ()=>{
      const val = input.value===''? null : Number(input.value);
      input.disabled = true;
      const {error} = await supabaseClient.from('rpe_reports').update({minutos:val, updated_at:new Date().toISOString()})
        .eq('club',CURRENT_CLUB).eq('player_name',input.dataset.player).eq('fecha',input.dataset.fecha);
      input.disabled = false;
      if(error){ console.warn(error); return; }
      const active = document.activeElement;
      if(active && active.classList && active.classList.contains('gk-rpe-min-input') && active !== input) return;
      await buildGkRpeTeamList();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ input.blur(); } });
  });
  if(isAdminGlobal){
    const bulkInput = document.getElementById('gkRpeMinBulkFill');
    const bulkBtn = document.getElementById('gkRpeMinBulkApplyBtn');
    const applyToAll = ()=>{
      if(bulkInput.value==='') return;
      table.querySelectorAll('.gk-rpe-min-input').forEach(inp=>{ inp.value = bulkInput.value; });
    };
    if(bulkBtn) bulkBtn.addEventListener('click', applyToAll);
    if(bulkInput) bulkInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); applyToAll(); } });
  }
}
async function saveAllGkRpeMinutes(){
  const btn = document.getElementById('gkRpeSaveAllBtn');
  const inputs = document.querySelectorAll('#gkRpeLoadTable .gk-rpe-min-input:not([disabled])');
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
    alert(`Se guardaron ${updates.length-failed.length} de ${updates.length} arqueros. Hubo ${failed.length} error(es), revisa la consola.`);
  }
  const active = document.activeElement;
  if(active && active.classList && active.classList.contains('gk-rpe-min-input')){ btn.disabled = false; return; }
  await buildGkRpeTeamList();
}
// ---------- Wellness: vista de staff (promedio del plantel, tabla y alertas de dolor) ----------
async function buildWellnessTeamList(fecha){
  const kpiBox = document.getElementById('wellnessKpi');
  const tableBox = document.getElementById('wellnessTable');
  const alertBox = document.getElementById('wellnessAlerts');
  const legendBox = document.getElementById('tqrLegend');
  if(legendBox){
    const anchors = [0,1,2,3,4,5,6,7,8,9,10].map(n=> `<b style="color:var(--gold);">${n}</b> = ${tqrCaption(n)}`).join(' &nbsp;·&nbsp; ');
    legendBox.innerHTML = `🔋 <b>${t('leyendaTqrTitulo')}</b> ${anchors}`;
  }
  if(!tableBox) return;
  const targetDate = fecha || todayISO();
  const isToday = targetDate === todayISO();
  const {data,error} = await supabaseClient.from('wellness_reports').select('*').eq('club',CURRENT_CLUB).eq('fecha',targetDate);
  if(error){
    tableBox.innerHTML = `<div style="padding:14px 0;color:var(--mist);font-size:12.5px;">${t('noSePudoWellness')}</div>`;
    return;
  }
  const reports = (data || []).filter(r=> matchesCurrentCategory(r.player_name)); // filtrado por categoría — antes se promediaba con reportes de TODAS las categorías del club
  const byPlayer = {};
  reports.forEach(r=> byPlayer[normalizeNameKey(r.player_name)] = r);

  // Plantel completo: jugadores con datos GPS + los que se agregaron manualmente (todavía sin GPS cargado)
  const rosterExtra = await getRosterExtraNames();
  const allPlayers = mergePlayerNames(players, rosterExtra);

  const scoreOf = r => {
    const vals = ['sueno','fatiga','dolor_muscular','estres','animo'].map(k=>r[k]).filter(v=>v!==null && v!==undefined);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  };
  const scores = reports.map(scoreOf).filter(s=>s!==null);
  const teamAvg = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length) : null;

  if(kpiBox){
    const diaLabel = isToday ? t('hoy') : targetDate.split('-').reverse().join('/');
    kpiBox.innerHTML = `<div class="kpi-card">
      <div class="kpi-label">${t('wellnessPromedioPlantel')} · ${diaLabel}</div>
      <div class="kpi-value">${teamAvg!==null ? teamAvg.toFixed(1) : '—'}<span style="font-size:14px;color:var(--mist);">/5</span></div>
      <div class="kpi-sub">${tf('jugadoresReportaron', {n:reports.length, t:allPlayers.length, d: diaLabel==='hoy'||isToday ? t('hoy') : tf('elDia',{d:diaLabel})})}</div>
    </div>`;
  }

  const conDolor = reports.filter(r=> (r.zonas_dolor||[]).length>0);
  if(alertBox){
    const diaTxt = isToday ? t('hoy') : tf('elDia', {d:targetDate.split('-').reverse().join('/')});
    alertBox.innerHTML = !conDolor.length ? '' : `<div style="padding:12px 14px;background:rgba(251,113,133,.08);border:1px solid rgba(251,113,133,.3);border-radius:10px;margin-bottom:14px;">
      <div style="font-size:12.5px;color:var(--bad);font-weight:700;margin-bottom:6px;">⚠️ ${tf('alertaDolor', {n:conDolor.length, d:diaTxt})}</div>
      ${conDolor.map(r=>`<div style="font-size:12px;color:var(--bone);margin-bottom:3px;">
        <b>${r.player_name}</b>: ${(r.zonas_dolor||[]).map(z=>`${zoneLabel(z.zona)} (${painTypeLabel(z.tipo)})`).join(', ')}
      </div>`).join('')}
    </div>`;
  }

  const avgCol = (key) => {
    const vals = reports.map(r=>r[key]).filter(v=>v!==null && v!==undefined);
    return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : null;
  };
  const fmtAvg = (v) => v!==null ? v.toFixed(1) : '—';
  const scoreColor = (v) => v===null ? 'var(--mist)' : v<3.0 ? '#FB7185' : v<4.0 ? '#FBBF24' : '#34D399';
  const totalMuscularOf = (r) => (r.fatiga!==null && r.fatiga!==undefined && r.dolor_muscular!==null && r.dolor_muscular!==undefined) ? (r.fatiga + r.dolor_muscular) : null;
  const totalMuscularVals = reports.map(totalMuscularOf).filter(v=>v!==null);
  const totalMuscularAvg = totalMuscularVals.length ? (totalMuscularVals.reduce((a,b)=>a+b,0)/totalMuscularVals.length) : null;

  tableBox.innerHTML = `<table class="mc-table">
    <thead><tr><th>#</th><th>${t('colJugador')}</th><th>${t('colSueno')}</th><th>${t('colFatiga')}</th><th>${t('colDolorMusc')}</th><th>${t('colEstres')}</th><th>${t('colAnimo')}</th><th>${t('colScore')}</th><th>${t('colTotalMusc')}</th><th>${t('colTqr')}</th><th>${t('colZonaDolor')}</th><th>${t('colObservacion')}</th></tr></thead>
    <tbody>${allPlayers.map((p,i)=>{
      const num = `${i+1<10?'0':''}${i+1}`;
      const r = byPlayer[normalizeNameKey(p)];
      if(!r) return `<tr><td class="mono" style="color:var(--mist);">${num}</td><td><b>${p}</b></td><td colspan="10" style="color:var(--mist);">${isToday?t('sinReportarHoy'):t('sinReportarDia')}</td></tr>`;
      const sc = scoreOf(r);
      const tm = totalMuscularOf(r);
      const zonas = (r.zonas_dolor||[]).map(z=> zoneLabel(z.zona)).join(', ');
      // Solo agrega la clase/tooltip "fantasma" si hay una descripción real que mostrar (evita un
      // globito vacío si esa categoría puntual quedó sin responder).
      const wtipAttrs = (val, caption) => caption ? `class="mono wtip" data-tip="${caption}"` : `class="mono"`;
      return `<tr>
        <td class="mono" style="color:var(--mist);">${num}</td>
        <td><b>${p}</b></td>
        <td ${wtipAttrs(r.sueno, wellnessCatCaption('sueno', r.sueno))}>${r.sueno??'—'}</td>
        <td ${wtipAttrs(r.fatiga, wellnessCatCaption('fatiga', r.fatiga))}>${r.fatiga??'—'}</td>
        <td ${wtipAttrs(r.dolor_muscular, wellnessCatCaption('dolor_muscular', r.dolor_muscular))}>${r.dolor_muscular??'—'}</td>
        <td ${wtipAttrs(r.estres, wellnessCatCaption('estres', r.estres))}>${r.estres??'—'}</td>
        <td ${wtipAttrs(r.animo, wellnessCatCaption('animo', r.animo))}>${r.animo??'—'}</td>
        <td class="mono" style="font-weight:800;font-size:15px;color:${scoreColor(sc)};">${sc!==null?sc.toFixed(1):'—'}</td>
        <td class="mono">${tm??'—'}<span style="color:var(--mist);font-size:10px;">/10</span></td>
        <td ${wtipAttrs(r.tqr, tqrCaption(r.tqr))}>${r.tqr??'—'}<span style="color:var(--mist);font-size:10px;">/10</span></td>
        <td style="color:${zonas?'var(--bad)':'var(--mist)'};font-size:11.5px;">${zonas||'—'}</td>
        <td style="color:var(--mist);font-size:11.5px;">${r.observacion||''}</td>
      </tr>`;
    }).join('')}</tbody>
    <tfoot><tr class="mc-total" style="border-top:2px solid var(--line-strong);">
      <td></td>
      <td><b>${t('promedioDelPlantel')}</b></td>
      <td class="mono">${fmtAvg(avgCol('sueno'))}</td>
      <td class="mono">${fmtAvg(avgCol('fatiga'))}</td>
      <td class="mono">${fmtAvg(avgCol('dolor_muscular'))}</td>
      <td class="mono">${fmtAvg(avgCol('estres'))}</td>
      <td class="mono">${fmtAvg(avgCol('animo'))}</td>
      <td class="mono" style="font-weight:800;font-size:15px;color:${scoreColor(teamAvg)};">${teamAvg!==null?teamAvg.toFixed(1):'—'}</td>
      <td class="mono">${fmtAvg(totalMuscularAvg)}</td>
      <td class="mono">${fmtAvg(avgCol('tqr'))}</td>
      <td></td>
      <td></td>
    </tr></tfoot>
  </table>`;
  // Tocar/tap en celular (el hover de CSS no sirve ahí) — abre el tooltip "fantasma" al tocar,
  // y lo cierra si se toca en cualquier otro lado o se toca de nuevo la misma celda.
  tableBox.querySelectorAll('.wtip').forEach(cell=>{
    cell.addEventListener('click', (e)=>{
      e.stopPropagation();
      const wasActive = cell.classList.contains('wtip-active');
      tableBox.querySelectorAll('.wtip-active').forEach(el=> el.classList.remove('wtip-active'));
      if(!wasActive) cell.classList.add('wtip-active');
    });
  });
  if(!window._wtipDocListenerAdded){
    document.addEventListener('click', ()=>{ document.querySelectorAll('.wtip-active').forEach(el=> el.classList.remove('wtip-active')); });
    window._wtipDocListenerAdded = true;
  }
}

// ---------- Carga interna (RPE × minutos), aguda:crónica ----------
let RPE_REPORTS_CACHE = [];
function computeRpeACWR(playerReports, refDateStr){
  if(!playerReports.length) return {ratio:null, acute:null, chronic:null};
  const ref = new Date(refDateStr+'T00:00:00');
  const within = (r,days)=>{ const d=new Date(r.fecha+'T00:00:00'); const diff=(ref-d)/86400000; return diff>=0 && diff<days; };
  const loadOf = r => (r.rpe||0) * (r.minutos||0);
  const acuteR = playerReports.filter(r=>within(r,7));
  const chronicR = playerReports.filter(r=>within(r,28));
  if(!acuteR.length || !chronicR.length) return {ratio:null, acute:null, chronic:null};
  const avg = arr => arr.reduce((a,r)=>a+loadOf(r),0)/arr.length;
  const acute = avg(acuteR), chronic = avg(chronicR);
  if(!chronic) return {ratio:null, acute, chronic};
  return {ratio: acute/chronic, acute, chronic};
}
// Ventana de envío de RPE para jugadores: configurable por club (por defecto 18:30–23:59,
// pensado para clubes que entrenan de tarde; un club que entrena de mañana puede cambiarla).
let RPE_WINDOW_START = '18:30'; // "HH:MM", hora local del navegador
let RPE_WINDOW_END = '23:59';
let CLUB_FEATURES = {gps:true, rpe_wellness:true, active:true}; // por defecto, todo activo (compatibilidad con clubes ya existentes)
let WELLNESS_WINDOW_START = '05:00';
let WELLNESS_WINDOW_END = '11:00';
const PAIN_TYPE_KEYS = ['muscular','articular','tendinoso','oseo','otro'];
const PAIN_TYPE_LABELS_I18N = {
  es: {muscular:'Muscular', articular:'Articular', tendinoso:'Tendinoso', oseo:'Óseo/Golpe', otro:'Otro'},
  en: {muscular:'Muscular', articular:'Joint', tendinoso:'Tendon', oseo:'Bone/Impact', otro:'Other'},
  ar: {muscular:'عضلي', articular:'مفصلي', tendinoso:'وتري', oseo:'عظمي/ضربة', otro:'آخر'},
};
// Compatibilidad con reportes guardados ANTES de este cambio, cuando se guardaba directo el texto en
// español (ej. "Óseo/Golpe") en vez de una clave neutral de idioma (ej. "oseo") — así los reportes viejos
// se siguen traduciendo bien, en vez de mostrar el texto crudo en español sin importar el idioma elegido.
const PAIN_TYPE_LEGACY_MAP = {'Muscular':'muscular','Articular':'articular','Tendinoso':'tendinoso','Óseo/Golpe':'oseo','Otro':'otro'};
function painTypeKey(raw){
  if(!raw) return PAIN_TYPE_KEYS[0];
  if(PAIN_TYPE_KEYS.includes(raw)) return raw;
  return PAIN_TYPE_LEGACY_MAP[raw] || 'otro';
}
function painTypeLabel(raw){
  const dict = PAIN_TYPE_LABELS_I18N[currentLang] || PAIN_TYPE_LABELS_I18N.es;
  return dict[painTypeKey(raw)] || raw;
}
// Zonas compartidas: aparecen igual en la vista de frente y de espalda (misma articulación, se ve desde ambos lados)
const BODY_ZONE_LABELS_I18N = {
  es: { hombro_izq:'Hombro Izq.', hombro_der:'Hombro Der.', codo_izq:'Codo Izq.', codo_der:'Codo Der.',
    cadera_izq:'Cadera Izq.', cadera_der:'Cadera Der.', rodilla_izq:'Rodilla Izq.', rodilla_der:'Rodilla Der.',
    tobillo_izq:'Tobillo Izq.', tobillo_der:'Tobillo Der.',
    cabeza_cuello:'Cabeza/Cuello', pecho:'Pecho', abdomen:'Abdomen',
    biceps_izq:'Bíceps Izq.', biceps_der:'Bíceps Der.',
    cuadriceps_izq:'Cuádriceps Izq.', cuadriceps_der:'Cuádriceps Der.',
    aductor_izq:'Aductor Izq.', aductor_der:'Aductor Der.', inguinal_pubis:'Inguinal/Pubis',
    espinilla_izq:'Espinilla Izq.', espinilla_der:'Espinilla Der.',
    cervical:'Cervical (nuca)', espalda_alta:'Espalda Alta', espalda_baja:'Espalda Baja/Lumbar',
    gluteo_izq:'Glúteo Izq.', gluteo_der:'Glúteo Der.',
    isquios_izq:'Isquiotibiales Izq.', isquios_der:'Isquiotibiales Der.',
    gemelo_izq:'Gemelo Izq.', gemelo_der:'Gemelo Der.' },
  en: { hombro_izq:'Left Shoulder', hombro_der:'Right Shoulder', codo_izq:'Left Elbow', codo_der:'Right Elbow',
    cadera_izq:'Left Hip', cadera_der:'Right Hip', rodilla_izq:'Left Knee', rodilla_der:'Right Knee',
    tobillo_izq:'Left Ankle', tobillo_der:'Right Ankle',
    cabeza_cuello:'Head/Neck', pecho:'Chest', abdomen:'Abdomen',
    biceps_izq:'Left Bicep', biceps_der:'Right Bicep',
    cuadriceps_izq:'Left Quad', cuadriceps_der:'Right Quad',
    aductor_izq:'Left Adductor', aductor_der:'Right Adductor', inguinal_pubis:'Groin/Pubis',
    espinilla_izq:'Left Shin', espinilla_der:'Right Shin',
    cervical:'Cervical (neck)', espalda_alta:'Upper Back', espalda_baja:'Lower Back/Lumbar',
    gluteo_izq:'Left Glute', gluteo_der:'Right Glute',
    isquios_izq:'Left Hamstring', isquios_der:'Right Hamstring',
    gemelo_izq:'Left Calf', gemelo_der:'Right Calf' },
  ar: { hombro_izq:'الكتف الأيسر', hombro_der:'الكتف الأيمن', codo_izq:'الكوع الأيسر', codo_der:'الكوع الأيمن',
    cadera_izq:'الورك الأيسر', cadera_der:'الورك الأيمن', rodilla_izq:'الركبة اليسرى', rodilla_der:'الركبة اليمنى',
    tobillo_izq:'الكاحل الأيسر', tobillo_der:'الكاحل الأيمن',
    cabeza_cuello:'الرأس/الرقبة', pecho:'الصدر', abdomen:'البطن',
    biceps_izq:'العضلة الأمامية اليسرى', biceps_der:'العضلة الأمامية اليمنى',
    cuadriceps_izq:'الفخذ الأمامي الأيسر', cuadriceps_der:'الفخذ الأمامي الأيمن',
    aductor_izq:'المقرّبة اليسرى', aductor_der:'المقرّبة اليمنى', inguinal_pubis:'الأربية/العانة',
    espinilla_izq:'قصبة الساق اليسرى', espinilla_der:'قصبة الساق اليمنى',
    cervical:'عنقي (الرقبة)', espalda_alta:'أعلى الظهر', espalda_baja:'أسفل الظهر/القطني',
    gluteo_izq:'الأرداف اليسرى', gluteo_der:'الأرداف اليمنى',
    isquios_izq:'أوتار الركبة اليسرى', isquios_der:'أوتار الركبة اليمنى',
    gemelo_izq:'ربلة الساق اليسرى', gemelo_der:'ربلة الساق اليمنى' },
};
function zoneLabel(id){
  if(!id) return '';
  const dict = BODY_ZONE_LABELS_I18N[currentLang] || BODY_ZONE_LABELS_I18N.es;
  return dict[id] || id;
}
// Posiciones (cx,cy,r) sobre un viewBox de 220x400, para cada vista
const BODY_ZONES_FRONT = [
  {id:'cabeza_cuello', cx:110, cy:26, r:15},
  {id:'hombro_izq', cx:72, cy:62, r:12},
  {id:'hombro_der', cx:148, cy:62, r:12},
  {id:'pecho', cx:110, cy:82, r:17},
  {id:'biceps_izq', cx:58, cy:100, r:10},
  {id:'biceps_der', cx:162, cy:100, r:10},
  {id:'abdomen', cx:110, cy:122, r:16},
  {id:'codo_izq', cx:52, cy:132, r:9},
  {id:'codo_der', cx:168, cy:132, r:9},
  {id:'cadera_izq', cx:92, cy:158, r:11},
  {id:'cadera_der', cx:128, cy:158, r:11},
  {id:'inguinal_pubis', cx:110, cy:172, r:8},
  {id:'cuadriceps_izq', cx:90, cy:225, r:13},
  {id:'cuadriceps_der', cx:130, cy:225, r:13},
  {id:'aductor_izq', cx:99, cy:206, r:8},
  {id:'aductor_der', cx:121, cy:206, r:8},
  {id:'rodilla_izq', cx:90, cy:255, r:10},
  {id:'rodilla_der', cx:130, cy:255, r:10},
  {id:'espinilla_izq', cx:90, cy:285, r:10},
  {id:'espinilla_der', cx:130, cy:285, r:10},
  {id:'tobillo_izq', cx:93, cy:316, r:8},
  {id:'tobillo_der', cx:127, cy:316, r:8},
];
const BODY_ZONES_BACK = [
  {id:'cervical', cx:110, cy:28, r:13},
  {id:'hombro_izq', cx:148, cy:62, r:12}, // vista de espalda: el hombro izq del jugador queda a la derecha de la imagen
  {id:'hombro_der', cx:72, cy:62, r:12},
  {id:'espalda_alta', cx:110, cy:88, r:18},
  {id:'codo_izq', cx:168, cy:132, r:9},
  {id:'codo_der', cx:52, cy:132, r:9},
  {id:'espalda_baja', cx:110, cy:130, r:15},
  {id:'cadera_izq', cx:128, cy:158, r:11},
  {id:'cadera_der', cx:92, cy:158, r:11},
  {id:'gluteo_izq', cx:128, cy:180, r:13},
  {id:'gluteo_der', cx:92, cy:180, r:13},
  {id:'isquios_izq', cx:128, cy:214, r:13},
  {id:'isquios_der', cx:92, cy:214, r:13},
  {id:'rodilla_izq', cx:128, cy:242, r:10},
  {id:'rodilla_der', cx:92, cy:242, r:10},
  {id:'gemelo_izq', cx:128, cy:278, r:11},
  {id:'gemelo_der', cx:92, cy:278, r:11},
  {id:'tobillo_izq', cx:128, cy:316, r:8},
  {id:'tobillo_der', cx:92, cy:316, r:8},
];
function isRpeSubmitUnlocked(){
  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  const [sh,sm] = RPE_WINDOW_START.split(':').map(Number);
  const [eh,em] = RPE_WINDOW_END.split(':').map(Number);
  const startMin = sh*60+sm, endMin = eh*60+em;
  if(startMin <= endMin){
    return nowMin >= startMin && nowMin <= endMin; // ventana normal, dentro del mismo día
  }
  return nowMin >= startMin || nowMin <= endMin; // ventana que cruza medianoche (ej: 22:00 a 02:00)
}
function rpeLockMsg(){
  const msgs = {
    es: `🔴 El envío de RPE está disponible de ${RPE_WINDOW_START} a ${RPE_WINDOW_END}. Vuelve a intentarlo dentro de ese horario.`,
    en: `🔴 RPE submission is available from ${RPE_WINDOW_START} to ${RPE_WINDOW_END}. Please try again within that window.`,
    ar: `🔴 إرسال مؤشر الجهد المدرك متاح من ${RPE_WINDOW_START} حتى ${RPE_WINDOW_END}. حاول مرة أخرى خلال هذا الوقت.`
  };
  return msgs[currentLang] || msgs.es;
}
function isWellnessSubmitUnlocked(){
  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  const [sh,sm] = WELLNESS_WINDOW_START.split(':').map(Number);
  const [eh,em] = WELLNESS_WINDOW_END.split(':').map(Number);
  const startMin = sh*60+sm, endMin = eh*60+em;
  if(startMin <= endMin){
    return nowMin >= startMin && nowMin <= endMin;
  }
  return nowMin >= startMin || nowMin <= endMin;
}
function wellnessLockMsg(){
  const msgs = {
    es: `🔴 El envío de Wellness está disponible de ${WELLNESS_WINDOW_START} a ${WELLNESS_WINDOW_END}. Vuelve a intentarlo mañana dentro de ese horario.`,
    en: `🔴 Wellness submission is available from ${WELLNESS_WINDOW_START} to ${WELLNESS_WINDOW_END}. Please try again tomorrow within that window.`,
    ar: `🔴 إرسال بيانات Wellness متاح من ${WELLNESS_WINDOW_START} حتى ${WELLNESS_WINDOW_END}. حاول مرة أخرى غدًا خلال هذا الوقت.`
  };
  return msgs[currentLang] || msgs.es;
}
async function loadRpeWindow(){
  try{
    const {data} = await supabaseClient.from('app_settings').select('value').eq('club',CURRENT_CLUB).eq('key','rpe_window').maybeSingle();
    if(data && data.value){
      const parsed = JSON.parse(data.value);
      RPE_WINDOW_START = parsed.start || '18:30';
      RPE_WINDOW_END = parsed.end || '23:59';
    } else {
      RPE_WINDOW_START = '18:30'; RPE_WINDOW_END = '23:59'; // valor por defecto para clubes que no lo configuraron todavía
    }
  }catch(e){ console.warn('No se pudo cargar el horario de RPE:', e); RPE_WINDOW_START='18:30'; RPE_WINDOW_END='23:59'; }
}
function setupRpeWindowBar(){
  if(!(myProfile && (myProfile.role==='admin' || myProfile.role==='owner'))) return;
  const wrap = document.getElementById('rpeWindowWrap');
  if(!wrap) return;
  wrap.style.display = 'block';
  const btn = document.getElementById('rpeWindowBtn');
  const form = document.getElementById('rpeWindowForm');
  const startInput = document.getElementById('rpeWindowStartInput');
  const endInput = document.getElementById('rpeWindowEndInput');
  const status = document.getElementById('rpeWindowStatus');
  const label = document.getElementById('rpeWindowLabel');
  const refreshLabel = ()=>{ label.textContent = `habilitado ${RPE_WINDOW_START} a ${RPE_WINDOW_END}`; };
  refreshLabel();
  startInput.value = RPE_WINDOW_START;
  endInput.value = RPE_WINDOW_END;
  btn.onclick = ()=>{ form.style.display = form.style.display==='block' ? 'none' : 'block'; };
  document.getElementById('rpeWindowSubmit').onclick = async ()=>{
    const startVal = startInput.value, endVal = endInput.value;
    if(!startVal || !endVal){ status.textContent = 'Completa las dos horas.'; return; }
    status.textContent = t('guardando');
    const {error} = await supabaseClient.from('app_settings')
      .upsert({club:CURRENT_CLUB, key:'rpe_window', value:JSON.stringify({start:startVal, end:endVal}), updated_at:new Date().toISOString()}, {onConflict:'club,key'});
    if(error){ status.textContent = tf('noSePudoGuardar',{e:error.message}); return; }
    RPE_WINDOW_START = startVal; RPE_WINDOW_END = endVal;
    status.textContent = '✅ Horario guardado.';
    refreshLabel();
  };
  document.addEventListener('click',(e)=>{ if(!wrap.contains(e.target)) form.style.display='none'; });
}
async function loadWellnessWindow(){
  try{
    const {data} = await supabaseClient.from('app_settings').select('value').eq('club',CURRENT_CLUB).eq('key','wellness_window').maybeSingle();
    if(data && data.value){
      const parsed = JSON.parse(data.value);
      WELLNESS_WINDOW_START = parsed.start || '05:00';
      WELLNESS_WINDOW_END = parsed.end || '11:00';
    } else {
      WELLNESS_WINDOW_START = '05:00'; WELLNESS_WINDOW_END = '11:00'; // valor por defecto para clubes que no lo configuraron todavía
    }
  }catch(e){ console.warn('No se pudo cargar el horario de Wellness:', e); WELLNESS_WINDOW_START='05:00'; WELLNESS_WINDOW_END='11:00'; }
}
