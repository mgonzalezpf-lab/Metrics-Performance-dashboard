// ---------- ACWR panel ----------
function acwrLabel(status){ const map={low:'acwrLow',optimal:'acwrOptimal',caution:'acwrCaution',high:'acwrHigh',insuf:'acwrInsuf'}; return t(map[status]); }
const ACWR_VAR = {low:'--low', optimal:'--good', caution:'--warn', high:'--bad', insuf:'--mist'};
function buildACWR(){
  const dates = [...new Set(categoryFilteredEvents().map(e=>e.fecha))].sort();
  const refDate = dates[dates.length-1];
  const order = {high:0, caution:1, optimal:2, low:3, insuf:4};
  const rows = players.map(p=>({p, ...computeACWR(byPlayer[p], refDate)}))
    .sort((a,b)=> (order[a.status]-order[b.status]) || ((b.ratio||0)-(a.ratio||0)));
  const box = document.getElementById('acwrList');
  if(!box) return;
  box.innerHTML = rows.map((r,i)=>{
    const pct = r.ratio!==null ? Math.min(100, r.ratio/2*100) : null;
    return `<div class="acwr-row ${r.p===state.player?'active':''}" data-p="${r.p}">
      <div class="rk">${i+1<10?'0':''}${i+1}</div>
      <div class="nm">${r.p}</div>
      <div class="acwr-track">${pct!==null?`<div class="acwr-marker" style="left:${pct}%"></div>`:''}</div>
      <div class="acwr-ratio">${r.ratio!==null? r.ratio.toFixed(2) : '—'}</div>
      <div><span class="acwr-badge" style="background:var(${ACWR_VAR[r.status]});color:#14143A;">${acwrLabel(r.status)}</span></div>
    </div>`;
  }).join('');
  box.querySelectorAll('.acwr-row').forEach(el=> el.addEventListener('click',()=>selectPlayer(el.dataset.p)));
}

// ---------- daily team ACWR (1 dato por día, se desliza horizontal con el dedo, sin flechas) ----------
let weeklyLoadChart;
function buildWeeklyLoadChart(){
  const canvas = document.getElementById('weeklyLoadChart');
  if(!canvas) return;
  const dates = [...new Set(categoryFilteredEvents().map(e=>e.fecha))].sort();
  if(!dates.length){
    if(weeklyLoadChart){ weeklyLoadChart.destroy(); weeklyLoadChart=null; }
    const tag = document.getElementById('weeklyLoadTag');
    if(tag) tag.textContent = t('sinDatosCargados');
    // Si no, este label se quedaba con el "X días cargados" del club/categoría anterior — contradiciendo
    // al tag de arriba, que sí decía "sin datos". Pasaba sobre todo al cambiar de club como owner.
    const wlLabelElEmpty = document.getElementById('wlLabel');
    if(wlLabelElEmpty) wlLabelElEmpty.innerHTML = '';
    const scrollBoxEmpty = document.getElementById('weeklyChartScrollBox');
    const innerEmpty = document.getElementById('weeklyChartInner');
    if(innerEmpty && scrollBoxEmpty) innerEmpty.style.width = scrollBoxEmpty.clientWidth + 'px';
    return;
  }

  // ACWR promedio del plantel para cada día con datos cargados
  const allRatios = dates.map(d=>{
    const ratios = players
      .map(p=> computeACWR(byPlayer[p], d).ratio)
      .filter(r=> r!==null && r!==undefined && !isNaN(r));
    const avgRatio = ratios.length ? ratios.reduce((a,b)=>a+b,0)/ratios.length : null;
    const esPartido = categoryFilteredEvents().some(e=> e.fecha===d && e.tipo==='Partido');
    return { fecha:d, ratio: avgRatio!==null ? Math.round(avgRatio*100)/100 : null, esPartido };
  });

  const labels = allRatios.map(r=> r.fecha.slice(5).split('-').reverse().join('/'));
  const data = allRatios.map(r=> r.ratio);

  const wlLabelEl = document.getElementById('wlLabel');
  if(wlLabelEl) wlLabelEl.innerHTML = tf('diasCargadosScrollHint', {n:`<b>${allRatios.length}</b>`}).replace('●', '<span style="color:#7C5CFC;">●</span>');

  // Ancho dinámico: se calcula para que en reposo (sin scroll) entren ~10 días en pantalla,
  // y el resto quede disponible deslizando hacia la izquierda.
  const scrollBox = document.getElementById('weeklyChartScrollBox');
  const inner = document.getElementById('weeklyChartInner');
  const minWidth = scrollBox ? scrollBox.clientWidth : 300;
  const perDay = Math.max(48, Math.floor(minWidth / 10)); // ~10 días visibles en reposo, sin achicar demasiado en pantallas chicas
  const wantedWidth = Math.max(minWidth, allRatios.length * perDay);
  if(inner) inner.style.width = wantedWidth + 'px';

  if(typeof Chart === 'undefined'){
    canvas.parentElement.innerHTML = `<div style="color:var(--mist);font-family:'IBM Plex Mono';font-size:12px;padding:14px;text-align:center;">${t('noSePudoChartjs')}</div>`;
    return;
  }

  // plugin propio: dibuja las bandas de referencia (0.80 / 1.30 / 1.50) y el valor sobre cada punto
  const acwrRefPlugin = {
    id: 'acwrDailyRef',
    afterDatasetsDraw(chart){
      const {ctx, chartArea, scales} = chart;
      if(!chartArea) return;
      const yScale = scales.y;
      ctx.save();
      [{v:0.8, color:'#34D399'},{v:1.3, color:'#34D399'},{v:1.5, color:'#FB7185'}].forEach(l=>{
        const y = yScale.getPixelForValue(l.v);
        if(y<chartArea.top || y>chartArea.bottom) return;
        ctx.strokeStyle = l.color; ctx.lineWidth = 1.2; ctx.setLineDash([5,4]);
        ctx.beginPath(); ctx.moveTo(chartArea.left,y); ctx.lineTo(chartArea.right,y); ctx.stroke();
      });
      ctx.restore();

      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textAlign = 'center';
      meta.data.forEach((point, idx)=>{
        const v = chart.data.datasets[0].data[idx];
        if(v===null || v===undefined) return;
        const esPartido = allRatios[idx] && allRatios[idx].esPartido;
        ctx.font = esPartido ? "700 12px 'IBM Plex Mono', monospace" : "600 11px 'IBM Plex Mono', monospace";
        ctx.fillStyle = esPartido ? '#B794F6' : '#67E8F9';
        ctx.fillText(v.toFixed(2), point.x, point.y - 12);
      });
      ctx.restore();
    }
  };

  // eje Y dinámico: se ajusta al rango real de los datos (con margen), en vez de un tope fijo alto
  // que dejaba la línea de 1.50 pegada arriba del todo cuando los valores del equipo eran bajos.
  const validData = data.filter(v=> v!==null && v!==undefined);
  const dataMax = validData.length ? Math.max(...validData) : 1.5;
  const yMax = Math.max(1.7, Math.ceil((Math.max(dataMax, 1.5) + 0.15) * 10) / 10);

  const ctx = canvas.getContext('2d');
  const cfg = {
    type:'line',
    data:{ labels, datasets:[{
      label:'ACWR promedio del equipo',
      data,
      spanGaps:true,
      borderColor:'#22D3EE',
      backgroundColor:'rgba(34,211,238,.10)',
      pointBackgroundColor: allRatios.map(r=> r.esPartido ? '#B794F6' : '#67E8F9'),
      pointBorderColor: allRatios.map(r=> r.esPartido ? '#7C5CFC' : '#22D3EE'),
      pointStyle: allRatios.map(r=> r.esPartido ? 'rectRot' : 'circle'),
      pointRadius: allRatios.map(r=> r.esPartido ? 6.5 : 5),
      pointHoverRadius: allRatios.map(r=> r.esPartido ? 8.5 : 7),
      tension:.3,
      fill:true,
      borderWidth:2.2,
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{ padding:{ top:18 } },
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#1E1E58', borderColor:'#22D3EE', borderWidth:1, titleColor:'#67E8F9', bodyColor:'#E7E7FB',
          callbacks:{
            label:(ctx)=> ctx.raw===null?'Datos insuficientes':`ACWR promedio: ${ctx.raw.toFixed(2)}`,
            afterLabel:(ctx)=> allRatios[ctx.dataIndex] && allRatios[ctx.dataIndex].esPartido ? '⚽ Día de partido' : ''
          }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{
          color:(c)=> allRatios[c.index] && allRatios[c.index].esPartido ? '#B794F6' : '#9797C9',
          font:(c)=> ({family:'IBM Plex Mono', size:9.5, weight: (allRatios[c.index] && allRatios[c.index].esPartido) ? '700' : '400'})
        } },
        y:{ min:0.5, max:yMax, grid:{color:'rgba(231,231,251,.06)'}, ticks:{color:'#9797C9', font:{family:'IBM Plex Mono', size:10}, stepSize:.2} }
      }
    },
    plugins:[acwrRefPlugin]
  };
  if(weeklyLoadChart){ weeklyLoadChart.destroy(); }
  weeklyLoadChart = new Chart(ctx, cfg);
  requestAnimationFrame(()=>{
    if(weeklyLoadChart) weeklyLoadChart.resize();
    // arranca mostrando los días más recientes (extremo derecho), como antes hacía "resetToLatest".
    // Un solo requestAnimationFrame a veces no alcanza a esperar a que termine de asentarse el ancho
    // real del contenedor (sobre todo la primera vez que se abre la pestaña) — se agrega un pequeño
    // margen extra con setTimeout para que el scroll se aplique después de que el layout ya esté firme.
    if(scrollBox) scrollBox.scrollLeft = scrollBox.scrollWidth;
    setTimeout(()=>{ if(scrollBox) scrollBox.scrollLeft = scrollBox.scrollWidth; }, 60);
  });
  const tag = document.getElementById('weeklyLoadTag');
  if(tag) tag.textContent = `${t('promedioDelPlantel')} · ${tf('diasCargados',{n:allRatios.length})}`;
}
