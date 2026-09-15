// ---------- Descargar cualquier sección del dashboard como imagen PNG ----------
// Antes de la foto, expande temporalmente cualquier contenedor con scroll interno (records, gráficos
// deslizables) para que la imagen salga completa, no solo la parte visible en pantalla.
async function downloadElementAsImage(el, filename){
  if(!el){ alert('No se encontró esa sección para descargar.'); return; }
  if(typeof html2canvas === 'undefined'){ alert('No se pudo cargar la herramienta de descarga. Revisa tu conexión e intenta de nuevo.'); return; }

  const candidatos = el.querySelectorAll('.rec-scroll, .weekly-chart-box, [id$="ScrollBox"]');
  const originales = [];
  candidatos.forEach(node=>{
    originales.push({ node, overflow: node.style.overflow, overflowX: node.style.overflowX, overflowY: node.style.overflowY, maxHeight: node.style.maxHeight });
    node.style.overflow = 'visible';
    node.style.overflowX = 'visible';
    node.style.overflowY = 'visible';
    node.style.maxHeight = 'none';
  });

  try{
    const canvas = await html2canvas(el, { backgroundColor: '#14143A', scale: 2, useCORS: true });
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }catch(err){
    console.error('Error al descargar imagen:', err);
    alert('No se pudo generar la imagen de esta sección.');
  }finally{
    originales.forEach(({node, overflow, overflowX, overflowY, maxHeight})=>{
      node.style.overflow = overflow;
      node.style.overflowX = overflowX;
      node.style.overflowY = overflowY;
      node.style.maxHeight = maxHeight;
    });
  }
}
// Ícono chico de descarga, para pegar en la esquina de cualquier panel/grupo de paneles.
// targetId = id del contenedor a fotografiar · nombre = prefijo del archivo descargado.
function downloadIconBtn(targetId, nombre){
  return `<button type="button" class="panel-dl-btn" data-target="${targetId}" data-nombre="${nombre}" title="Descargar esta sección como imagen">⬇</button>`;
}
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.panel-dl-btn');
  if(!btn) return;
  const target = document.getElementById(btn.dataset.target);
  const filename = `${btn.dataset.nombre || 'Metrics Performance'} - ${CURRENT_CLUB||''} - ${todayISO()}.png`.replace(/[\/\\?%*:|"<>]/g, '-');
  downloadElementAsImage(target, filename);
});
