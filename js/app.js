// app.js — lógica de la interfaz: navegación entre pantallas, formulario de la NC,
// transiciones de estado (ciclo ISO 9001 cláusula 10.2) y conexión con db.js/fotos.js/pdf.js/backup.js.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ESTADOS_LABEL = { abierta: 'Abierta', en_analisis: 'En análisis', accion_en_curso: 'Acción en curso', en_verificacion: 'En verificación', cerrada: 'Cerrada' };
const GRAVEDAD_LABEL = { menor: 'Menor', mayor: 'Mayor', critica: 'Crítica' };
const TIPO_LABEL = { materia_prima: 'Materia prima', proceso: 'Proceso', producto_terminado: 'Producto terminado', envase_rotulado: 'Envase / rotulado', otro: 'Otro' };
const INMEDIATA_LABEL = { cuarentena: 'Cuarentena', reproceso: 'Reproceso', rechazo: 'Rechazo', liberacion_concesion: 'Liberación por concesión', otra: 'Otra' };

let todasNC = [];
let filtroEstado = '';
let ncActual = null;   // NC que se está viendo/editando (puede no estar guardada aún)
let fotosTemp = [];    // fotos de la NC en edición, separadas hasta guardar

function fechaHoraLocal() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ── Tema claro/oscuro ── */
const temaOscuro = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light')) === 'dark';
const pintarTema = () => { $('tema').textContent = temaOscuro() ? '☀️' : '🌙' };
$('tema').addEventListener('click', () => { const t = temaOscuro() ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try { localStorage.setItem('nc_tema', t) } catch (e) { } pintarTema() });
pintarTema();

/* ── Navegación entre vistas ── */
function mostrarLista() { $('vista-ficha').hidden = true; $('vista-lista').hidden = false; }
function mostrarFicha() { $('vista-lista').hidden = true; $('vista-ficha').hidden = false; scrollTo({ top: 0 }); }

/* ── Lista de NC: buscador + filtro por estado ── */
function renderLista() {
  const q = $('buscador').value.trim().toLowerCase();
  const filtradas = todasNC.filter(nc => {
    if (filtroEstado && nc.estado !== filtroEstado) return false;
    if (!q) return true;
    return [nc.numero, nc.producto, nc.lote, nc.lineaSector].some(v => (v || '').toLowerCase().includes(q));
  }).sort((a, b) => (b.numero || '').localeCompare(a.numero || ''));

  $('lista-vacia').hidden = filtradas.length > 0 || todasNC.length > 0;
  $('lista').innerHTML = filtradas.map(nc => `
    <div class="nc-item" data-id="${nc.id}">
      <div class="fila1">
        <span class="numero">${esc(nc.numero || '(sin guardar)')}</span>
        <span class="badge badge-${nc.estado}">${esc(ESTADOS_LABEL[nc.estado] || nc.estado)}</span>
      </div>
      <div class="datos">
        <span class="badge-gravedad badge-${nc.gravedad || ''}">${esc(GRAVEDAD_LABEL[nc.gravedad] || '-')}</span>
        <span>${esc(nc.producto || 'Sin producto')} · ${esc(nc.lineaSector || 'Sin línea')}</span>
      </div>
    </div>`).join('');
}
$('buscador').addEventListener('input', renderLista);
$('lista').addEventListener('click', e => {
  const item = e.target.closest('.nc-item'); if (!item) return;
  abrirFicha(item.dataset.id);
});
document.querySelectorAll('#filtros-estado .chip').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#filtros-estado .chip').forEach(x => x.classList.remove('activo'));
    b.classList.add('activo');
    filtroEstado = b.dataset.estado;
    renderLista();
  });
});
function actualizarDatalistLineas() {
  const lineas = [...new Set(todasNC.map(n => n.lineaSector).filter(Boolean))];
  $('dl-lineas').innerHTML = lineas.map(l => `<option value="${esc(l)}">`).join('');
}

/* ── Abrir / crear una NC ── */
$('nueva-nc').addEventListener('click', () => {
  ncActual = {
    id: DB.nuevoId(), numero: null, fechaHora: fechaHoraLocal(), detectadoPor: '', lineaSector: '',
    producto: '', lote: '', tipo: 'materia_prima', tipoDetalle: '', descripcion: '', fotos: [],
    gravedad: null, accionInmediata: null, accionCorrectiva: null, verificacion: null,
    historialVerificaciones: [], estado: null, creadoEn: Date.now(), actualizadoEn: Date.now()
  };
  fotosTemp = [];
  cargarFormulario();
  mostrarFicha();
});
async function abrirFicha(id) {
  ncActual = await DB.obtenerNC(id);
  fotosTemp = (ncActual.fotos || []).slice();
  cargarFormulario();
  mostrarFicha();
}
$('volver-lista').addEventListener('click', async () => {
  todasNC = await DB.listarNC();
  actualizarDatalistLineas();
  renderLista();
  mostrarLista();
});

/* ── Cargar los datos de ncActual en el formulario ── */
function cargarFormulario() {
  $('ficha-titulo').textContent = ncActual.numero || 'Nueva No Conformidad';
  $('ficha-estado').textContent = ncActual.estado ? ESTADOS_LABEL[ncActual.estado] : 'Sin guardar';
  $('ficha-estado').className = 'badge' + (ncActual.estado ? ' badge-' + ncActual.estado : '');

  $('f-fecha').value = ncActual.fechaHora || '';
  $('f-detectadoPor').value = ncActual.detectadoPor || '';
  $('f-lineaSector').value = ncActual.lineaSector || '';
  $('f-producto').value = ncActual.producto || '';
  $('f-lote').value = ncActual.lote || '';
  $('f-tipo').value = ncActual.tipo || 'materia_prima';
  $('f-tipoDetalle').value = ncActual.tipoDetalle || '';
  $('f-tipoDetalle').hidden = $('f-tipo').value !== 'otro';
  $('f-descripcion').value = ncActual.descripcion || '';
  document.querySelectorAll('#f-gravedad .chip').forEach(b => b.classList.toggle('activo', b.dataset.gravedad === ncActual.gravedad));

  const ai = ncActual.accionInmediata || {};
  $('f-inm-tipo').value = ai.tipo || 'cuarentena';
  $('f-inm-detalle').value = ai.detalle || '';

  const ac = ncActual.accionCorrectiva || {};
  $('f-cor-descripcion').value = ac.descripcion || '';
  $('f-cor-responsable').value = ac.responsable || '';
  $('f-cor-fecha').value = ac.fechaCompromiso || '';

  const ve = ncActual.verificacion || {};
  $('f-ver-fecha').value = ve.fecha || '';
  $('f-ver-resultado').value = ve.resultado || 'eficaz';
  $('f-ver-comentario').value = ve.comentario || '';

  dibujarThumbs();
  dibujarHistorial();
  actualizarVisibilidadSecciones();
  $('ficha-msg').textContent = '';
}
$('f-tipo').addEventListener('change', () => { $('f-tipoDetalle').hidden = $('f-tipo').value !== 'otro' });
document.querySelectorAll('#f-gravedad .chip').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#f-gravedad .chip').forEach(x => x.classList.remove('activo'));
    b.classList.add('activo');
  });
});
function gravedadSeleccionada() {
  const b = document.querySelector('#f-gravedad .chip.activo');
  return b ? b.dataset.gravedad : null;
}

/* ── Fotos (mismo patrón que informeCalidad) ── */
$('f-fotos').addEventListener('change', async e => {
  $('ficha-msg').textContent = 'Cargando fotos…';
  for (const archivo of e.target.files) fotosTemp.push(await Fotos.redimensionar(archivo));
  e.target.value = '';
  $('ficha-msg').textContent = '';
  dibujarThumbs();
});
function dibujarThumbs() {
  $('f-thumbs').innerHTML = fotosTemp.map((f, i) => `<div class="th"><img src="${f.d}" alt="Foto ${i + 1}"><div><button type="button" data-a="l" data-i="${i}">◀</button><button type="button" data-a="x" data-i="${i}">✕</button><button type="button" data-a="r" data-i="${i}">▶</button></div></div>`).join('');
}
$('f-thumbs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const i = +b.dataset.i, a = b.dataset.a;
  if (a === 'x') fotosTemp.splice(i, 1);
  else { const j = a === 'l' ? i - 1 : i + 1; if (j >= 0 && j < fotosTemp.length)[fotosTemp[i], fotosTemp[j]] = [fotosTemp[j], fotosTemp[i]] }
  dibujarThumbs();
});

/* ── Mostrar/ocultar secciones según el avance de la NC ── */
function actualizarVisibilidadSecciones() {
  const tieneNumero = !!ncActual.numero;
  const tieneInmediata = !!ncActual.accionInmediata;
  const tieneCorrectiva = !!ncActual.accionCorrectiva;
  $('seccion-inmediata').hidden = !tieneNumero;
  $('seccion-correctiva').hidden = !tieneInmediata;
  $('pasar-verificacion').hidden = !(ncActual.estado === 'accion_en_curso' && tieneCorrectiva);
  $('seccion-verificacion').hidden = !(ncActual.estado === 'en_verificacion' || ncActual.estado === 'cerrada');
  $('exportar-pdf').hidden = !tieneNumero;
  $('borrar-nc').hidden = !tieneNumero;
}

/* ── Guardar cada sección (cada una avanza el estado según el ciclo ISO 10.2) ── */
$('guardar-basicos').addEventListener('click', async () => {
  const gravedad = gravedadSeleccionada();
  if (!$('f-lineaSector').value.trim() || !$('f-producto').value.trim() || !gravedad) {
    $('ficha-msg').textContent = 'Completá línea/sector, producto y gravedad.';
    return;
  }
  ncActual.fechaHora = $('f-fecha').value;
  ncActual.detectadoPor = $('f-detectadoPor').value.trim();
  ncActual.lineaSector = $('f-lineaSector').value.trim();
  ncActual.producto = $('f-producto').value.trim();
  ncActual.lote = $('f-lote').value.trim();
  ncActual.tipo = $('f-tipo').value;
  ncActual.tipoDetalle = ncActual.tipo === 'otro' ? $('f-tipoDetalle').value.trim() : '';
  ncActual.descripcion = $('f-descripcion').value.trim();
  ncActual.fotos = fotosTemp.slice();
  ncActual.gravedad = gravedad;
  if (!ncActual.numero) {
    ncActual.numero = await DB.proximoNumero();
    ncActual.estado = 'abierta';
  }
  ncActual.actualizadoEn = Date.now();
  await DB.guardarNC(ncActual);
  todasNC = await DB.listarNC();
  actualizarDatalistLineas();
  cargarFormulario();
  $('ficha-msg').textContent = 'Datos básicos guardados.';
});

$('guardar-inmediata').addEventListener('click', async () => {
  if (!ncActual.numero) { $('ficha-msg').textContent = 'Primero guardá los datos básicos.'; return }
  ncActual.accionInmediata = { tipo: $('f-inm-tipo').value, detalle: $('f-inm-detalle').value.trim() };
  if (ncActual.estado === 'abierta') ncActual.estado = 'en_analisis';
  ncActual.actualizadoEn = Date.now();
  await DB.guardarNC(ncActual);
  todasNC = await DB.listarNC();
  cargarFormulario();
  $('ficha-msg').textContent = 'Acción inmediata guardada.';
});

$('guardar-correctiva').addEventListener('click', async () => {
  if (!$('f-cor-descripcion').value.trim() || !$('f-cor-responsable').value.trim() || !$('f-cor-fecha').value) {
    $('ficha-msg').textContent = 'Completá descripción, responsable y fecha compromiso.';
    return;
  }
  ncActual.accionCorrectiva = { descripcion: $('f-cor-descripcion').value.trim(), responsable: $('f-cor-responsable').value.trim(), fechaCompromiso: $('f-cor-fecha').value };
  ncActual.estado = 'accion_en_curso';
  ncActual.actualizadoEn = Date.now();
  await DB.guardarNC(ncActual);
  todasNC = await DB.listarNC();
  cargarFormulario();
  $('ficha-msg').textContent = 'Acción correctiva guardada.';
});

$('pasar-verificacion').addEventListener('click', async () => {
  ncActual.estado = 'en_verificacion';
  ncActual.actualizadoEn = Date.now();
  await DB.guardarNC(ncActual);
  todasNC = await DB.listarNC();
  cargarFormulario();
  $('ficha-msg').textContent = 'NC pasada a verificación.';
});

$('guardar-verificacion').addEventListener('click', async () => {
  if (!$('f-ver-fecha').value) { $('ficha-msg').textContent = 'Completá la fecha de verificación.'; return }
  const verificacion = { fecha: $('f-ver-fecha').value, resultado: $('f-ver-resultado').value, comentario: $('f-ver-comentario').value.trim() };
  if (verificacion.resultado === 'eficaz') {
    ncActual.verificacion = verificacion;
    ncActual.estado = 'cerrada';
  } else {
    // No eficaz: se guarda en el historial y la NC vuelve a análisis para cargar una acción correctiva nueva.
    ncActual.historialVerificaciones = (ncActual.historialVerificaciones || []).concat([{ ...verificacion, accionCorrectiva: ncActual.accionCorrectiva }]);
    ncActual.verificacion = null;
    ncActual.accionCorrectiva = null;
    ncActual.estado = 'en_analisis';
  }
  ncActual.actualizadoEn = Date.now();
  await DB.guardarNC(ncActual);
  todasNC = await DB.listarNC();
  cargarFormulario();
  $('ficha-msg').textContent = verificacion.resultado === 'eficaz' ? 'NC cerrada: verificación eficaz.' : 'No eficaz: la NC vuelve a análisis. Cargá una nueva acción correctiva.';
});

function dibujarHistorial() {
  const hist = ncActual.historialVerificaciones || [];
  $('historial-verificaciones').innerHTML = hist.length
    ? `<div class="card"><h3>Verificaciones anteriores (no eficaces)</h3>${hist.map(h => `<p><b>${esc(h.fecha)}</b> — ${esc(h.comentario || 'sin comentario')}</p>`).join('')}</div>`
    : '';
}

/* ── Borrar / exportar PDF ── */
$('borrar-nc').addEventListener('click', async () => {
  if (!confirm(`¿Borrar definitivamente la NC ${ncActual.numero}? No se puede deshacer.`)) return;
  await DB.borrarNC(ncActual.id);
  todasNC = await DB.listarNC();
  renderLista();
  mostrarLista();
});
$('exportar-pdf').addEventListener('click', () => PDF.exportarNC(ncActual));

/* ── Backup ── */
$('exportar-backup').addEventListener('click', Backup.exportar);
$('importar-backup').addEventListener('change', async e => {
  const archivo = e.target.files[0]; if (!archivo) return;
  try {
    await Backup.importar(archivo);
    todasNC = await DB.listarNC();
    actualizarDatalistLineas();
    renderLista();
    $('msg-global').textContent = 'Backup importado.';
  } catch (err) {
    $('msg-global').textContent = 'No se pudo importar: ' + err.message;
  }
  e.target.value = '';
});

/* ── Arranque ── */
async function iniciar() {
  todasNC = await DB.listarNC();
  actualizarDatalistLineas();
  renderLista();
}
iniciar();

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=1'));
