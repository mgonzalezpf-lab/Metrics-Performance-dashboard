function num(v){ return (v===null||v===undefined||v==='') ? null : Number(v); }
function toISO(v){
  if(v instanceof Date){
    const y=v.getFullYear(), m=String(v.getMonth()+1).padStart(2,'0'), d=String(v.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  if(typeof v === 'string') return v.slice(0,10);
  return String(v);
}
// ---------- Importación de CSV crudo de Catapult (sin pasar por nuestro Excel) ----------
function hhmmssToMinutes(str){
  if(!str) return null;
  const parts = String(str).trim().split(':').map(Number);
  if(parts.length!==3 || parts.some(isNaN)) return null;
  const [h,m,s] = parts;
  return h*60 + m + s/60;
}
function parseCsvLine(line){
  // parseo simple respetando comillas, sin dependencias externas
  const result = [];
  let cur = '', inQuotes = false;
  for(let i=0;i<line.length;i++){
    const c = line[i];
    if(c === '"'){ inQuotes = !inQuotes; }
    else if(c === ',' && !inQuotes){ result.push(cur); cur=''; }
    else { cur += c; }
  }
  result.push(cur);
  return result.map(s=>s.trim());
}
// Reconoce el export crudo de Catapult buscando sus columnas por NOMBRE (no por posición),
// así funciona tanto con el reporte resumido (44 columnas) como con el completo (1600+).
function parseCatapultCSV(text){
  const lines = text.split(/\r?\n/);

  let fecha = null;
  for(const line of lines.slice(0,10)){
    const clean = line.replace(/"/g,'');
    if(clean.startsWith('Date:')){
      const m = clean.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if(m) fecha = `${m[3]}-${m[2]}-${m[1]}`;
      break;
    }
  }

  let headerIdx = -1;
  for(let i=0;i<lines.length;i++){
    if(lines[i].replace(/"/g,'').trim().startsWith('Player Name')){ headerIdx = i; break; }
  }
  if(headerIdx<0) throw new Error('Este archivo no parece un export de Catapult: no encontramos la fila de encabezados ("Player Name").');

  const headers = parseCsvLine(lines[headerIdx]);
  const idx = (name) => headers.indexOf(name);

  const cols = {
    name: idx('Player Name'), periodName: idx('Period Name'),
    dist: idx('Average Distance (Session)'), hsr: idx('HSR'), vel: idx('Maximum Velocity'),
    acc: idx('Acceleration B2-3 Average Efforts (Session) (Gen 2)'),
    desa: idx('Deceleration B2-3 Average Efforts (Session) (Gen 2)'),
    pl: idx('Average Player Load (Session)'), dur: idx('Average Duration (Session)'),
    sprintDist: idx('Velocity Band 5 Total Distance'), sprintEfforts: idx('Velocity B5+ Total # Efforts (Gen 2)'),
    divesLeft: idx('Dive Left Count'), divesRight: idx('Dive Right Count'), // opcionales: solo el reporte completo de Catapult las trae (arqueros)
    impactLeft: idx('Total Impact Dive Load Left High Intensity'), impactRight: idx('Total Impact Dive Load Right High Intensity'),
    rhieBouts: idx('RHIE Total Bouts'),
  };
  const requeridasLabels = {
    name:'Player Name', periodName:'Period Name', dist:'Average Distance (Session)', hsr:'HSR',
    vel:'Maximum Velocity', acc:'Acceleration B2-3 Average Efforts (Session) (Gen 2)',
    desa:'Deceleration B2-3 Average Efforts (Session) (Gen 2)', pl:'Average Player Load (Session)',
    dur:'Average Duration (Session)',
  };
  const requeridas = Object.keys(requeridasLabels);
  const requeridasFaltantes = requeridas.filter(k => cols[k]<0).map(k => requeridasLabels[k]);
  if(requeridasFaltantes.length){
    throw new Error(`Este archivo no tiene el formato esperado de Catapult. No encontramos estas columnas: ${requeridasFaltantes.join(', ')}.`);
  }

  const bySession = [], byHalf1 = [], byHalf2 = [];
  for(let i=headerIdx+1;i<lines.length;i++){
    if(!lines[i] || !lines[i].trim()) continue;
    const c = parseCsvLine(lines[i]);
    if(c.length < headers.length) continue;
    const jugador = c[cols.name].trim();
    if(!jugador) continue;
    const periodName = c[cols.periodName].trim();
    const minutos = hhmmssToMinutes(c[cols.dur]);
    const row = {
      jugador,
      dist: num(c[cols.dist]), hsr: num(c[cols.hsr]), vel: num(c[cols.vel]),
      acc: num(c[cols.acc]), desa: num(c[cols.desa]), pl: num(c[cols.pl]), min: minutos,
      sprint: cols.sprintDist>=0 ? num(c[cols.sprintDist]) : null,
      sprint_count: cols.sprintEfforts>=0 ? num(c[cols.sprintEfforts]) : null,
      dives_left: cols.divesLeft>=0 ? num(c[cols.divesLeft]) : null,
      dives_right: cols.divesRight>=0 ? num(c[cols.divesRight]) : null,
      impact_left: cols.impactLeft>=0 ? num(c[cols.impactLeft]) : null,
      impact_right: cols.impactRight>=0 ? num(c[cols.impactRight]) : null,
      rhie: cols.rhieBouts>=0 ? num(c[cols.rhieBouts]) : null,
    };
    const periodUpper = periodName.toUpperCase();
    if(periodUpper === 'SESSION') bySession.push(row);
    else if(periodUpper === '1ST HALF') byHalf1.push(row);
    else if(periodUpper === '2ND HALF') byHalf2.push(row);
  }
  if(!bySession.length) return null;
  const opcionales = [
    {key:'sprintDist', label:'Sprint distancia (Velocity Band 5 Total Distance)'},
    {key:'sprintEfforts', label:'Sprint conteo (Velocity B5+ Total # Efforts)'},
    {key:'divesLeft', label:'Buzos Izq. (Dive Left Count)'},
    {key:'divesRight', label:'Buzos Der. (Dive Right Count)'},
    {key:'impactLeft', label:'Impacto Izq. (Total Impact Dive Load Left High Intensity)'},
    {key:'impactRight', label:'Impacto Der. (Total Impact Dive Load Right High Intensity)'},
    {key:'rhieBouts', label:'RHIE bouts (RHIE Total Bouts)'},
  ];
  const columnasNoEncontradas = opcionales.filter(o => cols[o.key]<0).map(o => o.label);
  return { fecha, bySession, byHalf1, byHalf2, columnasNoEncontradas };
}
// Arma la fila de "Comparativo GPS" (promedio del plantel) a partir de los datos crudos de Catapult,
// calculando el índice de fatiga (2T vs 1T) automáticamente si el archivo trae las dos mitades.
function computeCatapultTeamTotals(bySession, byHalf1, byHalf2){
  const sum = (arr, key) => { const v = arr.map(r=>r[key]).filter(x=>x!==null && x!==undefined && !isNaN(x)); return v.length ? v.reduce((a,b)=>a+b,0) : null; };
  const pctDiff = (v1, v2) => (v1!==null && v2!==null && v1>0) ? ((v2-v1)/v1*100) : null;
  const halfSum = (key) => {
    const v1 = sum(byHalf1,key), v2 = sum(byHalf2,key);
    return { t1:v1, t2:v2, diff: pctDiff(v1,v2) };
  };
  const distH = halfSum('dist'), hsrH = halfSum('hsr'), accH = halfSum('acc'), desaH = halfSum('desa'), plH = halfSum('pl');
  const sprintDistH = halfSum('sprint'), sprintCountH = halfSum('sprint_count');
  const rhieH = halfSum('rhie');
  return {
    dist: sum(bySession,'dist'), hsr: sum(bySession,'hsr'),
    sprint_dist: sum(bySession,'sprint'), sprint_count: sum(bySession,'sprint_count'),
    acc: sum(bySession,'acc'), desa: sum(bySession,'desa'), rhie: sum(bySession,'rhie'), pl: sum(bySession,'pl'),
    fatiga: distH.diff,
    halves: { dist:distH, hsr:hsrH, acc:accH, desa:desaH, pl:plH, sprint:sprintDistH, sprint_count:sprintCountH, rhie:rhieH },
  };
}

function parseComparativoSheet(ws){
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
  let headerRow = -1;
  for(let i=0;i<rows.length;i++){ if(rows[i] && String(rows[i][0]||'').startsWith('Variable')){ headerRow=i; break; } }
  if(headerRow<0) throw new Error('No se encontró la fila de encabezado en "Comparativo GPS".');
  const cols = [];
  for(let c=1;c<rows[headerRow].length;c++){ if(rows[headerRow][c]) cols.push({idx:c, name:rows[headerRow][c]}); }
  const dateFor = {};
  for(let i=0;i<headerRow;i++){
    const txt = rows[i] && rows[i][0] ? String(rows[i][0]) : '';
    const m = txt.match(/vs\s+([^—]+?)\s*—\s*.*?(\d{2})\.(\d{2})\.(\d{2})/i);
    if(m){ dateFor[('vs '+m[1].trim())] = `20${m[4]}-${m[3]}-${m[2]}`; }
  }
  const keyMap = {
    'Distancia total (m)':'dist', 'Sprint distancia (m)':'sprint_dist', 'HSR':'hsr',
    'Sprint conteo':'sprint_count', 'Acc B2-3':'acc', 'Desa B2-3':'desa',
    'RHIE bouts':'rhie', 'Player Load':'pl', 'Índice de fatiga (%)':'fatiga'
  };
  // Filas OPCIONALES de 1T/2T por métrica — si el club las completa en la hoja, quedan calculadas acá
  // igual que si vinieran del CSV crudo de Catapult (el mismo objeto "halves" que ya usan las tarjetas de
  // Partidos y el informe PDF). Si no están, simplemente no aparece esa fila y sigue funcionando como antes.
  const halfKeyMap = {
    'Distancia total 1T (m)':['dist','t1'], 'Distancia total 2T (m)':['dist','t2'],
    'HSR 1T':['hsr','t1'], 'HSR 2T':['hsr','t2'],
    'Sprint distancia 1T (m)':['sprint','t1'], 'Sprint distancia 2T (m)':['sprint','t2'],
    'Sprint conteo 1T':['sprint_count','t1'], 'Sprint conteo 2T':['sprint_count','t2'],
    'Acc B2-3 1T':['acc','t1'], 'Acc B2-3 2T':['acc','t2'],
    'Desa B2-3 1T':['desa','t1'], 'Desa B2-3 2T':['desa','t2'],
    'RHIE bouts 1T':['rhie','t1'], 'RHIE bouts 2T':['rhie','t2'],
    'Player Load 1T':['pl','t1'], 'Player Load 2T':['pl','t2'],
  };
  const totals = {};
  const halvesRaw = {};
  cols.forEach(c=>{ totals[c.name] = {fecha: dateFor[c.name] || null}; halvesRaw[c.name] = {}; });
  for(let i=headerRow+1;i<rows.length;i++){
    const r = rows[i]; if(!r || !r[0]) continue;
    const label = String(r[0]).trim();
    const key = keyMap[label];
    if(key){
      cols.forEach(c=>{ if(key in totals[c.name]) return; totals[c.name][key] = num(r[c.idx]); });
      continue;
    }
    const halfEntry = halfKeyMap[label];
    if(halfEntry){
      const [metricKey, half] = halfEntry;
      cols.forEach(c=>{
        const v = num(r[c.idx]);
        if(v===null) return;
        if(!halvesRaw[c.name][metricKey]) halvesRaw[c.name][metricKey] = {};
        halvesRaw[c.name][metricKey][half] = v;
      });
    }
  }
  // armar el objeto "halves" final (con % de diferencia 2T vs 1T) solo para las métricas que sí tengan
  // ambos tiempos cargados — igual formato que computeCatapultTeamTotals, para que todo lo que ya lee
  // row.halves (tarjetas de Partidos, informe PDF) funcione igual sin importar de dónde vino el dato.
  cols.forEach(c=>{
    const raw = halvesRaw[c.name];
    const halves = {};
    let tieneAlgo = false;
    Object.keys(raw).forEach(metricKey=>{
      const {t1, t2} = raw[metricKey];
      if(t1===undefined || t2===undefined) return;
      const diff = t1 ? ((t2-t1)/t1*100) : null;
      halves[metricKey] = {t1, t2, diff};
      tieneAlgo = true;
    });
    if(tieneAlgo) totals[c.name].halves = halves;
  });
  return totals;
}
