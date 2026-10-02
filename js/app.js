// app.js — registro mensual de No Conformidades (réplica local del registro_nc de QualityOS/Agrofacil).
// Todo vive en el dispositivo: filas en IndexedDB (db.js), respaldo manual en .json (backup.js).
// Tabla en pantallas grandes, tarjetas colapsables en el celular. Imprime A4 horizontal en dos hojas.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ════════════════════════════════════════════
// CONSTANTES
// TIPOS: tipos de desvío con la gravedad sugerida (autocompleta la gravedad al elegirlos)
// ════════════════════════════════════════════
const TIPOS = [
  { label: '', sev: '' },
  { label: 'Poco film', sev: 'Leve' },
  { label: 'Falta de enfilmado final', sev: 'Crítico' },
  { label: 'Bidones abollados', sev: 'Crítico' },
  { label: 'Inducción débil', sev: 'Crítico' },
  { label: 'Bidón/es por inducción', sev: 'Moderado' },
  { label: 'Tapas incorrectas', sev: 'Crítico' },
  { label: 'Packaging incorrecto', sev: 'Moderado' },
  { label: 'Paletizado incorrecto', sev: 'Moderado' },
  { label: 'Palét incorrecto', sev: 'Moderado' },
  { label: 'Trazabilidad / QR', sev: 'Crítico' },
  { label: 'Identificación de palét', sev: 'Moderado' },
  { label: 'Peso / Volumen', sev: 'Leve' },
  { label: 'Palét chocado', sev: 'Moderado' },
  { label: 'Pérdida (bidón/es pinchados)', sev: 'Crítico' },
];
const SEVS = ['', 'Leve', 'Moderado', 'Crítico'];
const ESTADOS = ['Pendiente', 'En proceso', 'Finalizado', 'Anulado'];
const EFICACIA = ['Pendiente', 'Eficaz', 'No eficaz'];
const DETEC = ['', 'CONTROL LÍNEA', 'CONTROL FINAL', 'CONTROL INGRESO'];
const BADGES = { Pendiente: 'b-pend', 'En proceso': 'b-proc', Finalizado: 'b-final', Anulado: 'b-cancel' };
const EF_BADGES = { Pendiente: 'b-efpend', Eficaz: 'b-efok', 'No eficaz': 'b-efno' };
const SEV_CLS = { Leve: 'sb-leve', Moderado: 'sb-mod', 'Crítico': 'sb-crit' };
const SEV_ICON = { Leve: '🟢', Moderado: '🟡', 'Crítico': '🔴' };

let rows = [];
let _cardExpanded = null;   // celular: qué tarjetas están abiertas (por índice de fila)
const esMovil = () => innerWidth <= 900;

// ── Fechas ──────────────────────────────────
const p2 = n => String(n).padStart(2, '0');
const isoToDMY = iso => { const [y, m, d] = (iso || '').split('-'); return y && m && d ? `${d}/${m}/${y}` : ''; };
const fmtDate = iso => { const [y, m, d] = (iso || '').split('-'); return y && m && d ? `${d}/${m}/${y.slice(2)}` : ''; };   // DD/MM/YY (impresión)
// dd/mm/aaaa (o dd/mm/aa) → aaaa-mm-dd; si ya viene en ISO lo deja
function toISO(s) {
  s = (s || '').trim();
  if (!s) return '';
  if (s.includes('/')) { const p = s.split('/'); return p.length === 3 ? `${p[2].length === 2 ? '20' + p[2] : p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : ''; }
  return s;
}
// Suma días hábiles en hora local (evita el corrimiento de un día que da new Date('aaaa-mm-dd') en UTC).
function sumarHabiles(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  for (let a = 0; a < n;) { dt.setDate(dt.getDate() + 1); if (dt.getDay() !== 0 && dt.getDay() !== 6) a++; }
  return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`;
}

// ════════════════════════════════════════════
// PERSISTENCIA — cada fila tocada se guarda sola (con un pequeño retardo) en IndexedDB
// ════════════════════════════════════════════
function setSave(estado, texto) {
  $('saveDot').className = 'save-dot' + (estado === 'saving' ? ' saving' : estado === 'error' ? ' error' : '');
  const msg = $('saveMsg');
  if (texto) msg.textContent = texto;
  else if (estado === 'ok') msg.textContent = '✅ Guardado — ' + new Date().toLocaleTimeString('es-AR');
  else if (estado === 'saving') msg.textContent = 'Guardando...';
  else if (estado === 'error') msg.textContent = '⚠ Error al guardar. Exportá un backup como respaldo.';
}
const pendientes = new Set();
let timerGuardado = null;
function marcar(i) {
  rows[i]._m = Date.now();
  pendientes.add(rows[i].id);
  setSave('saving');
  clearTimeout(timerGuardado);
  timerGuardado = setTimeout(guardarPendientes, 500);
}
async function guardarPendientes() {
  clearTimeout(timerGuardado);
  if (!pendientes.size) return;
  const ids = new Set(pendientes); pendientes.clear();
  try { await DB.guardarVarias(rows.filter(r => ids.has(r.id))); setSave('ok'); }
  catch (e) { ids.forEach(id => pendientes.add(id)); setSave('error'); }
}
// En el celular el sistema puede cerrar la pestaña sin aviso: guardar al salir.
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardarPendientes(); });
addEventListener('pagehide', guardarPendientes);

const siguienteOrden = () => rows.reduce((m, r) => Math.max(m, r._o || 0), 0) + 1;

// ════════════════════════════════════════════
// FILAS: alta, anulación, duplicados, borrado total
// ════════════════════════════════════════════
function addRow() {
  rows.push(DB.nuevaFila(siguienteOrden()));
  if (esMovil()) { if (_cardExpanded === null) _cardExpanded = rows.map((_, k) => k === rows.length - 1); else _cardExpanded.push(true); }
  render(); marcar(rows.length - 1);
  if (esMovil()) scrollTo({ top: 0 });
}
function anular(idx) {
  const r = rows[idx];
  if (!r) return;
  if (r.est === 'Anulado') { alert('Esa NC ya está anulada.'); return; }
  if (!confirm(`¿Anular la NC N°${idx + 1}? Queda registrada con estado "Anulado" (no se borra).\n\nPara eliminar definitivamente usá 🗑 Borrar todo (reinicio de mes).`)) return;
  r.est = 'Anulado';
  render(); marcar(idx);
}
function anularSeleccionada() {
  const idx = parseInt($('sel-del-row').value);
  if (!isNaN(idx)) anular(idx);
}
function actualizarSelectorAnular() {
  const sel = $('sel-del-row');
  const prev = parseInt(sel.value);
  sel.innerHTML = '';
  if (!rows.length) { const o = document.createElement('option'); o.textContent = 'Sin filas'; sel.appendChild(o); return; }
  rows.forEach((r, i) => {
    const o = document.createElement('option');
    o.value = i;
    const raw = '#' + (i + 1) + ' ' + (r.lote || r.prod || r.fecha || 'Fila ' + (i + 1));
    o.textContent = raw.length > 22 ? raw.slice(0, 21) + '…' : raw;
    sel.appendChild(o);
  });
  sel.value = (!isNaN(prev) && prev < rows.length) ? prev : rows.length - 1;
}

// Firma de contenido: dos NC con la misma firma son la misma NC cargada dos veces.
const firma = r => ['fecha', 'lote', 'cliente', 'prod', 'tipo', 'sev', 'detec', 'desc', 'litNC', 'litTot', 'pallets']
  .map(k => (r[k] == null ? '' : '' + r[k]).trim().toLowerCase()).join('|');
const tieneContenido = r => !!(r.lote || r.prod || r.tipo || r.desc || r.cliente);

async function quitarDuplicados() {
  const vistos = new Map(); const resultado = []; let elim = 0;
  for (const r of rows) {
    if (!tieneContenido(r)) { resultado.push(r); continue; }   // filas en blanco, intactas
    const f = firma(r);
    if (!vistos.has(f)) { vistos.set(f, resultado.length); resultado.push(r); continue; }
    const idx = vistos.get(f);
    if (resultado[idx].est === 'Anulado' && r.est !== 'Anulado') resultado[idx] = r;   // si la guardada está anulada y esta no, queda la activa
    elim++;
  }
  if (!elim) { toast('No se encontraron duplicados ✓'); return; }
  if (!confirm(`Se encontraron ${elim} NC duplicada/s.\n\nSe conserva una de cada una y se eliminan las repetidas.\n\n¿Continuar?`)) return;
  rows = resultado; _cardExpanded = null;
  await DB.reemplazarTodo(rows);
  render(); setSave('ok', elim + ' duplicada/s eliminada/s.');
  toast('🧹 ' + elim + ' duplicada/s eliminada/s');
}

async function borrarTodo() {
  // Doble confirmación: borra TODO (reinicio de mes / empezar de cero)
  if (!confirm('⚠ BORRAR TODO\n\nEsto elimina TODAS las NC del registro. Se usa solo para reiniciar el mes o empezar de cero.\n\nAntes de seguir, descargá el Excel (⬇) y un backup (💾) si querés conservar el mes.\n\n¿Continuar?')) return;
  if (prompt('Para confirmar, escribí la palabra BORRAR (en mayúsculas):') !== 'BORRAR') { setSave('ok', 'Borrado cancelado.'); return; }
  rows = []; _cardExpanded = null; pendientes.clear();
  await DB.borrarTodo();
  render(); setSave('ok', 'Datos borrados.');
}

// ════════════════════════════════════════════
// RENDER — reconstruye la tabla (o las tarjetas) desde rows[]
// ════════════════════════════════════════════
function render() {
  const tb = $('tBody');
  tb.innerHTML = '';
  const movil = esMovil();
  if (movil) {
    if (_cardExpanded === null) _cardExpanded = rows.map((_, k) => k === rows.length - 1);
    else { while (_cardExpanded.length < rows.length) _cardExpanded.push(true); _cardExpanded = _cardExpanded.slice(0, rows.length); }
  }
  const orden = rows.map((_, k) => k);
  if (movil) orden.reverse();   // celular: la última NC arriba

  orden.forEach(i => {
    const r = rows[i];
    const tr = document.createElement('tr');
    tr.dataset.rowIdx = i;
    if (r.est === 'Anulado') tr.classList.add('anulada');

    if (movil) {
      if (!_cardExpanded[i]) tr.classList.add('nc-collapsed');
      const hdr = document.createElement('td');
      hdr.className = 'nc-card-hdr';
      hdr.appendChild(span('nc-hdr-num', '#' + (i + 1)));
      if (r.lote) hdr.appendChild(span('nc-hdr-lote', r.lote));
      if (r.prod) hdr.appendChild(span('nc-hdr-prod', r.prod));
      if (r.sev) hdr.appendChild(span('sev-badge ' + (SEV_CLS[r.sev] || ''), (SEV_ICON[r.sev] || '') + ' ' + r.sev));
      if (r.est === 'Anulado') hdr.appendChild(span('nc-hdr-anulada', 'ANULADA'));
      else {
        const btn = document.createElement('button');
        btn.textContent = '⊘'; btn.title = 'Anular NC'; btn.setAttribute('aria-label', 'Anular NC');
        btn.setAttribute('style', 'background:none;border:none;color:#f59e0b;font-size:18px;padding:0 8px;cursor:pointer;line-height:1');
        btn.addEventListener('click', e => { e.stopPropagation(); anular(i); });
        hdr.appendChild(btn);
      }
      hdr.appendChild(span('nc-hdr-chev', '▼'));
      hdr.addEventListener('click', () => toggleCard(i));
      tr.appendChild(hdr);
    }

    mkTd(tr, 'c0', String(i + 1));
    mkInp(tr, 'c1', 'date', r.fecha, v => { r.fecha = v; autoPlazo(i); marcar(i); updateKPIs(); }, 'Fecha detección');
    mkInp(tr, 'c2', 'text', r.lote, v => { r.lote = v; marcar(i); }, 'N° Lote');
    mkInp(tr, 'c3', 'text', r.prod, v => { r.prod = v; marcar(i); }, 'Producto');

    const tdT = mkTdEl(tr, 'c4', 'Tipo de desvío');
    tdT.dataset.val = r.tipo || '';
    tdT.appendChild(mkSelect(TIPOS.map(t => ({ v: t.label, l: t.label || '—' })), r.tipo, e => {
      r.tipo = e.target.value;
      const t = TIPOS.find(x => x.label === r.tipo);
      if (t && t.sev) r.sev = t.sev;
      marcar(i); renderConScroll();
    }));

    const tdG = mkTdEl(tr, 'c5', 'Gravedad');
    tdG.dataset.val = r.sev || '';
    tdG.appendChild(mkSelect(SEVS.map(s => ({ v: s, l: s || '—' })), r.sev, e => { r.sev = e.target.value; tdG.dataset.val = r.sev; marcar(i); renderConScroll(); }));

    const tdD = mkTdEl(tr, 'c5b', 'Detección');
    tdD.dataset.detec = r.detec || '';
    tdD.appendChild(mkSelect(DETEC.map(s => ({ v: s, l: s || '—' })), r.detec, e => { r.detec = e.target.value; tdD.dataset.detec = r.detec; marcar(i); }));

    mkInp(tr, 'c6', 'text', r.desc, v => { r.desc = v; marcar(i); }, 'Descripción');
    mkInp(tr, 'c7', 'number', r.litNC, v => { r.litNC = v; marcar(i); updateKPIs(); }, 'Litros NC');
    mkInp(tr, 'c8', 'number', r.litTot, v => { r.litTot = v; marcar(i); updateKPIs(); }, 'Litros totales del lote');
    mkInp(tr, 'c9', 'text', r.ac, v => { r.ac = v; marcar(i); }, 'Acción correctiva / disposición');
    mkInp(tr, 'c10', 'date', r.plazo, v => { r.plazo = v; marcar(i); updateKPIs(); }, 'Plazo reproceso');

    const tdE = mkTdEl(tr, 'c11', 'Estado');
    tdE.appendChild(mkSelect(ESTADOS.map(s => ({ v: s, l: s })), r.est, e => { r.est = e.target.value; marcar(i); renderConScroll(); }));
    tdE.appendChild(document.createElement('span'));
    badge(tdE, r.est, BADGES, 'b-pend');

    mkInp(tr, 'c12', 'date', r.cierre, v => { r.cierre = v; marcar(i); updateKPIs(); }, 'Fecha cierre');
    mkInp(tr, 'c13', 'number', r.pallets, v => { r.pallets = v; marcar(i); }, 'Pallets NC');
    mkInp(tr, 'c14', 'text', r.resp, v => { r.resp = v; marcar(i); }, 'Responsable');

    const tdF = mkTdEl(tr, 'c15', 'Verif. eficacia (ISO 10.2.2)');
    tdF.appendChild(mkSelect(EFICACIA.map(s => ({ v: s, l: s })), r.eficacia, e => { r.eficacia = e.target.value; badge(tdF, r.eficacia, EF_BADGES, 'b-efpend'); marcar(i); }));
    tdF.appendChild(document.createElement('span'));
    badge(tdF, r.eficacia, EF_BADGES, 'b-efpend');

    tb.appendChild(tr);
  });
  $('vacio').hidden = rows.length > 0;
  updateKPIs();
  actualizarSelectorAnular();
  renderPrintAcciones();
}
// Re-render sin saltar de posición (los selects que cambian badges/gravedad reconstruyen la lista).
function renderConScroll() { const y = scrollY; render(); scrollTo({ top: y }); }

function span(cls, txt) { const s = document.createElement('span'); s.className = cls; s.textContent = txt; return s; }
function toggleCard(idx) {
  if (!_cardExpanded) return;
  const abrir = !_cardExpanded[idx];
  const y = scrollY;
  _cardExpanded[idx] = abrir;
  render();
  requestAnimationFrame(() => {
    const tr = document.querySelector(`#tBody tr[data-row-idx="${idx}"]`);
    if (abrir && tr) tr.scrollIntoView({ block: 'center' }); else scrollTo({ top: y });
  });
}
function mkTdEl(tr, cls, label) { const el = document.createElement('td'); el.className = cls; if (label) el.dataset.label = label; tr.appendChild(el); return el; }
function mkTd(tr, cls, text) { const el = document.createElement('td'); el.className = cls; el.textContent = text; tr.appendChild(el); return el; }
function mkInp(tr, cls, type, val, cb, label) {
  const el = mkTdEl(tr, cls, label);
  el.dataset.val = type === 'date' ? fmtDate(val) : (val || '');
  const inp = document.createElement('input');
  inp.type = type; inp.value = val || '';
  if (type === 'number') { inp.min = 0; inp.step = 'any'; inp.inputMode = 'decimal'; }
  inp.addEventListener('input', e => { el.dataset.val = type === 'date' ? fmtDate(e.target.value) : e.target.value; cb(e.target.value); });
  el.appendChild(inp);
}
function mkSelect(opts, val, cb) {
  const s = document.createElement('select');
  opts.forEach(o => { const op = document.createElement('option'); op.value = o.v; op.textContent = o.l; if (val === o.v) op.selected = true; s.appendChild(op); });
  s.addEventListener('change', cb);
  return s;
}
function badge(td, val, mapa, porDefecto) {
  td.dataset.val = val || 'Pendiente';
  let b = td.querySelector('.badge');
  if (!b) { b = document.createElement('span'); td.appendChild(b); }
  b.className = 'badge ' + (mapa[val] || porDefecto);
  b.textContent = val || 'Pendiente';
}
// Plazo automático (días hábiles desde la detección). No pisa un plazo que se haya puesto a mano.
function autoPlazo(i) {
  const r = rows[i];
  if (!r.fecha || (r.plazo && r.plazo !== r._plazoAuto)) return;
  r.plazo = r._plazoAuto = sumarHabiles(r.fecha, BRAND.plazoDias);
  const inp = document.querySelector(`#tBody tr[data-row-idx="${i}"] td.c10 input`);
  if (inp) { inp.value = r.plazo; inp.closest('td').dataset.val = fmtDate(r.plazo); }
}

// ════════════════════════════════════════════
// KPIs
// AQ-IND-01: NC activas · AQ-IND-02: ΣL NC / ΣL totales · AQ-IND-03: desvío más frecuente
// AQ-IND-04: % de reprocesos (litNC>0 con plazo) finalizados dentro del plazo
// ════════════════════════════════════════════
function updateKPIs() {
  const a = rows.filter(r => r.est !== 'Anulado');
  $('kpi1').textContent = a.length;

  const sNC = a.reduce((x, r) => x + (parseFloat(r.litNC) || 0), 0);
  const sT = a.reduce((x, r) => x + (parseFloat(r.litTot) || 0), 0);
  if (sT > 0) { const t = sNC / sT * 100; $('kpi2').textContent = t.toFixed(1) + '%'; $('kpi2-card').className = 'kpi-card' + (t > 5 ? ' warn' : ''); }
  else { $('kpi2').textContent = '—'; $('kpi2-card').className = 'kpi-card'; }

  const freq = {};
  a.forEach(r => { if (r.tipo) freq[r.tipo] = (freq[r.tipo] || 0) + 1; });
  const orden = Object.entries(freq).sort((x, y) => y[1] - x[1]);
  if (orden.length && a.length) {
    const pct = orden[0][1] / a.length * 100;
    $('kpi3').textContent = orden[0][0]; $('kpi3-sub').textContent = pct.toFixed(0) + '% (' + orden[0][1] + ' eventos)';
    $('kpi3-card').className = 'kpi-card' + (pct >= 40 ? ' warn' : '');
  } else { $('kpi3').textContent = '—'; $('kpi3-sub').textContent = 'sin datos'; $('kpi3-card').className = 'kpi-card'; }

  const conPlazo = a.filter(r => r.plazo && parseFloat(r.litNC) > 0);
  const enPlazo = conPlazo.filter(r => r.est === 'Finalizado' && r.cierre && toISO(r.cierre) <= toISO(r.plazo));
  if (conPlazo.length) {
    const t = enPlazo.length / conPlazo.length * 100;
    $('kpi4').textContent = t.toFixed(0) + '%'; $('kpi4-card').className = 'kpi-card' + (t < 90 ? (t < 70 ? ' warn' : ' mid') : '');
  } else { $('kpi4').textContent = '—'; $('kpi4-card').className = 'kpi-card'; }

  $('sev-leve').textContent = a.filter(r => r.sev === 'Leve').length;
  $('sev-mod').textContent = a.filter(r => r.sev === 'Moderado').length;
  $('sev-crit').textContent = a.filter(r => r.sev === 'Crítico').length;
}

// ════════════════════════════════════════════
// ENCABEZADO / PERÍODO / IMPRESIÓN
// ════════════════════════════════════════════
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function periodo() {
  let guardado = '';
  try { guardado = (localStorage.getItem('nc_periodo') || '').trim(); } catch (e) { }
  const h = new Date();
  return guardado || MESES[h.getMonth()] + ' ' + h.getFullYear();
}
function pintarEncabezados() {
  const set = (id, v) => { $(id).textContent = v; };
  set('ph-proceso', 'Proceso: ' + BRAND.proceso);
  set('ph-codigo', BRAND.codigo); set('ph-version', BRAND.version); set('ph-area', BRAND.area);
  set('ph-elaboro', BRAND.elaboro); set('ph-aprobo', BRAND.aprobo); set('periodo-val', periodo());
  set('pc-codigo', BRAND.codigo); set('pc-version', BRAND.version); set('pc-area', BRAND.area);
  set('pc-elaboro', BRAND.elaboro); set('pc-aprobo', BRAND.aprobo); set('pc-proceso', BRAND.proceso);
  $('in-periodo').value = (() => { try { return localStorage.getItem('nc_periodo') || ''; } catch (e) { return ''; } })();
  $('brand').innerHTML = `<span>${esc(BRAND.empresa)}</span>`;
}

// Segunda hoja de impresión: Acciones Correctivas / Disposición (solo NC no anuladas, con su N° original)
function renderPrintAcciones() {
  const el = $('print-acciones');
  const activas = rows.map((r, i) => ({ r, n: i + 1 })).filter(x => x.r.est !== 'Anulado');
  const celdas = activas.map(({ r, n }) => {
    const cls = r.est === 'Finalizado' ? 'pac-final' : r.est === 'En proceso' ? 'pac-proc' : 'pac-pend';
    return `<tr>
      <td style="text-align:center;font-weight:700">${n}</td>
      <td>${esc(isoToDMY(r.fecha))}</td><td>${esc(r.lote)}</td><td>${esc(r.prod)}</td><td>${esc(r.tipo)}</td>
      <td>${esc(r.ac)}</td><td>${esc(r.resp)}</td><td>${esc(isoToDMY(r.plazo))}</td>
      <td style="text-align:center"><span class="pac-badge ${cls}">${esc(r.est || 'Pendiente')}</span></td>
      <td>${esc(isoToDMY(r.cierre))}</td></tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center;color:#555;padding:12px">Sin NC registradas para este período</td></tr>';
  el.innerHTML = `
  <div class="pac-header">
    <div class="pac-logo"><img src="logo.png" alt="${esc(BRAND.empresa)}" style="max-width:110px;max-height:46px;display:block"></div>
    <div class="pac-title">
      <span class="pac-title-main">Registro de No Conformidades</span>
      <span class="pac-title-sub">Acciones Correctivas y Disposición — ${esc(BRAND.proceso)}</span>
    </div>
    <div class="pac-meta">
      <div class="pac-meta-row"><span class="pac-meta-lbl">Código</span><span class="pac-meta-val">${esc(BRAND.codigo)}</span></div>
      <div class="pac-meta-row"><span class="pac-meta-lbl">Versión</span><span class="pac-meta-val">${esc(BRAND.version)}</span></div>
      <div class="pac-meta-row"><span class="pac-meta-lbl">Período</span><span class="pac-meta-val">${esc(periodo())}</span></div>
      <div class="pac-meta-row"><span class="pac-meta-lbl">Elab.</span><span class="pac-meta-val">${esc(BRAND.elaboro)}</span></div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;border:2px solid #555;">
    <thead><tr>
      <th style="width:3%">#</th><th style="width:7%">Fecha Det.</th><th style="width:9%">N° Lote</th><th style="width:10%">Producto</th>
      <th style="width:10%">Tipo de Desvío</th><th style="width:28%">Acción Correctiva / Disposición</th><th style="width:12%">Responsable</th>
      <th style="width:7%">Plazo</th><th style="width:7%">Estado</th><th style="width:7%">Fecha Cierre</th>
    </tr></thead>
    <tbody>${celdas}</tbody>
  </table>
  <div class="pac-sigs">
    <div class="pac-sig-box">Checker de Calidad<br><br>&nbsp;</div>
    <div class="pac-sig-box">Coordinadora de Calidad<br><br>&nbsp;</div>
    <div class="pac-sig-box">Revisión SGC / Gerencia<br><br>&nbsp;</div>
  </div>`;
}
function prepararImpresion() {
  pintarEncabezados();
  renderPrintAcciones();
  document.querySelectorAll('#tBody input[type="date"]').forEach(inp => { inp.closest('td').dataset.val = fmtDate(inp.value); });
}
addEventListener('beforeprint', prepararImpresion);

// ════════════════════════════════════════════
// EXCEL — registro completo (todas las filas con datos, anuladas incluidas con su estado)
// ════════════════════════════════════════════
const MINS_POR_PALLET = { 'Bidón/es por inducción': 5, 'Inducción débil': 20, 'Pérdida (bidón/es pinchados)': 20, 'Palét chocado': 20 };
function exportarExcel() {
  if (typeof XLSX === 'undefined') { toast('⚠ No cargó la librería de Excel.'); return; }
  const filas = rows.map((r, i) => ({ r, n: i + 1 })).filter(x => x.r.lote || x.r.prod || x.r.tipo);
  if (!filas.length) { toast('⚠ No hay datos para exportar.'); return; }
  const datos = [[
    '#', 'Fecha Detección', 'N° Lote', 'Producto', 'Cliente', 'Tipo de Desvío', 'Gravedad', 'Detección',
    'Descripción NC', 'Litros NC', 'Litros Tot. Lote', 'Acción Correctiva', 'Plazo Reproceso', 'Estado',
    'Fecha Cierre', 'Pallets NC', 'HH estimadas (min)', 'Responsable', 'Verif. Eficacia'
  ]];
  filas.forEach(({ r, n }) => {
    const pallets = parseInt(r.pallets) || 0;
    const base = MINS_POR_PALLET[r.tipo] !== undefined ? MINS_POR_PALLET[r.tipo] : 20;
    datos.push([n, isoToDMY(r.fecha), r.lote, r.prod, r.cliente, r.tipo, r.sev, r.detec, r.desc, r.litNC, r.litTot,
      r.ac, isoToDMY(r.plazo), r.est, isoToDMY(r.cierre), r.pallets, pallets > 0 ? pallets * base : '', r.resp, r.eficacia].map(v => v ?? ''));
  });
  const ws = XLSX.utils.aoa_to_sheet(datos);
  ws['!cols'] = [4, 14, 14, 24, 14, 26, 10, 16, 36, 10, 14, 32, 14, 12, 14, 10, 18, 20, 14].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'REGISTRO NC');
  const nombre = `Registro_NC_${periodo().replace(/\s+/g, '_')}.xlsx`;
  XLSX.writeFile(wb, nombre);
  toast(`✅ ${filas.length} registro/s exportados → ${nombre}`);
}

// ════════════════════════════════════════════
// PUENTE REG-01 → registro (localStorage 'reg01_nc_pendientes', mismo origen)
// ════════════════════════════════════════════
function verificarImportPendiente() {
  try {
    const raw = localStorage.getItem('reg01_nc_pendientes');
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (!payload || !payload.filas || !payload.filas.length) return;
    const banner = $('import-banner');
    banner.style.display = 'flex';
    $('import-titulo').textContent = `📥 Desvíos desde REG-01 — ${payload.origen || ''}`;
    const ab = payload.resumen?.abiertas ?? payload.filas.filter(f => f.est === 'Pendiente').length;
    const co = payload.resumen?.correccionesLinea ?? payload.filas.filter(f => f.est === 'Finalizado').length;
    const ts = payload.timestamp ? new Date(payload.timestamp).toLocaleString('es-AR') : '';
    const partes = [];
    if (ab) partes.push(`⚠ ${ab} NC abierta(s) → estado Pendiente`);
    if (co) partes.push(`✔ ${co} corrección(es) en línea → estado Finalizado`);
    $('import-detalle').textContent = partes.join('  ·  ') + (ts ? '  ·  Generado: ' + ts : '');
  } catch (e) { }
}
function importarDesdeReg01() {
  try {
    const payload = JSON.parse(localStorage.getItem('reg01_nc_pendientes'));
    const existentes = new Set(rows.filter(tieneContenido).map(firma));
    let omitidas = 0;
    const nuevas = [];
    payload.filas.forEach(f => {
      const r = DB.nuevaFila(siguienteOrden() + nuevas.length);
      ['lote', 'cliente', 'prod', 'tipo', 'sev', 'detec', 'desc', 'litNC', 'litTot', 'ac', 'pallets', 'resp'].forEach(k => { r[k] = f[k] || ''; });
      r.fecha = toISO(f.fecha);
      r.est = f.est || 'Pendiente';
      r.eficacia = f.eficacia || 'Pendiente';
      if (r.fecha) r.plazo = r._plazoAuto = sumarHabiles(r.fecha, BRAND.plazoDias);
      const fr = firma(r);
      if (existentes.has(fr)) { omitidas++; return; }   // ya estaba cargada: no se duplica
      existentes.add(fr); nuevas.push(r);
    });
    const desde = rows.length;
    rows = rows.concat(nuevas);
    render(); nuevas.forEach((_, k) => marcar(desde + k));
    localStorage.removeItem('reg01_nc_pendientes');
    $('import-banner').style.display = 'none';
    toast(`✅ ${nuevas.length} fila(s) importadas` + (omitidas ? ` · ${omitidas} ya existían` : ''));
  } catch (e) { toast('⚠ Error al importar. Intentá de nuevo.'); }
}
function descartarImport() {
  try { localStorage.removeItem('reg01_nc_pendientes'); } catch (e) { }
  $('import-banner').style.display = 'none';
  toast('Importación descartada');
}

// ════════════════════════════════════════════
// BACKUP (.json)
// ════════════════════════════════════════════
async function importarBackup(e) {
  const archivo = e.target.files[0]; if (!archivo) return;
  try {
    const nuevas = await Backup.leer(archivo, siguienteOrden());
    const porId = new Map(rows.map(r => [r.id, r]));
    nuevas.forEach(n => { porId.set(n.id, n); });   // por id: la del backup reemplaza, las que ya tenías y no están se conservan
    rows = [...porId.values()].sort((a, b) => (a._o || 0) - (b._o || 0));
    _cardExpanded = null;
    await DB.reemplazarTodo(rows);
    render(); setSave('ok', 'Backup importado — ' + nuevas.length + ' registro/s');
    toast('✅ Backup importado');
  } catch (err) { toast('⚠ No se pudo importar: ' + err.message); }
  e.target.value = '';
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Tema claro/oscuro (oscuro por defecto, como el registro original) ──
const ICONO_LUNA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
const ICONO_SOL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-14.07 1.41 1.41M18.66 18.66l1.41 1.41M2 12h2M20 12h2m-4.34-5.66 1.41-1.41M5.34 18.66l-1.41 1.41"/></svg>';
function pintarTema() { $('btn-theme').innerHTML = document.documentElement.classList.contains('light') ? ICONO_LUNA : ICONO_SOL; }
$('btn-theme').addEventListener('click', () => {
  const claro = document.documentElement.classList.toggle('light');
  try { localStorage.setItem('nc_tema', claro ? 'light' : 'dark'); } catch (e) { }
  pintarTema();
});

// ── Eventos de la barra de herramientas ──
$('btn-add').addEventListener('click', addRow);
$('btn-guardar').addEventListener('click', async () => { await guardarPendientes(); setSave('ok'); toast('💾 Datos guardados'); });
$('btn-anular').addEventListener('click', anularSeleccionada);
$('btn-print').addEventListener('click', () => { prepararImpresion(); print(); });
$('btn-excel').addEventListener('click', exportarExcel);
$('btn-backup').addEventListener('click', () => Backup.exportar(rows));
$('file-backup').addEventListener('change', importarBackup);
$('btn-dups').addEventListener('click', quitarDuplicados);
$('btn-clear').addEventListener('click', borrarTodo);
$('btn-cod').addEventListener('click', () => { const p = $('panel-codificacion'); p.style.display = p.style.display === 'block' ? 'none' : 'block'; });
$('btn-importar').addEventListener('click', importarDesdeReg01);
$('btn-descartar').addEventListener('click', descartarImport);
$('in-periodo').addEventListener('input', e => { try { localStorage.setItem('nc_periodo', e.target.value.trim()); } catch (err) { } pintarEncabezados(); renderPrintAcciones(); });
// Cambio de orientación / tamaño: pasar de tabla a tarjetas
let _modoMovil = esMovil();
addEventListener('resize', () => { if (esMovil() !== _modoMovil) { _modoMovil = esMovil(); _cardExpanded = null; render(); } });

// ── Arranque ──
async function iniciar() {
  pintarTema();
  pintarEncabezados();
  $('legend-tipos').innerHTML = TIPOS.filter(t => t.label).map(t => `<span>${SEV_ICON[t.sev]} ${esc(t.label)}</span>`).join('');
  try {
    rows = (await DB.listar()).sort((a, b) => (a._o || 0) - (b._o || 0));
    setSave('ok', rows.length ? '✅ Datos restaurados — ' + rows.length + ' registro/s' : 'Registro vacío — listo para cargar NCs del mes.');
  } catch (e) { rows = []; setSave('error'); }
  render();
  verificarImportPendiente();
  // Pedir al navegador que no borre los datos si falta espacio
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
}
iniciar();

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=2'));
