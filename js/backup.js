// backup.js — exporta/importa todo el registro como un archivo .json de respaldo.
// Existe porque si se borra el navegador (o se cambia de celular) se pierde lo que está en IndexedDB:
// este archivo es la copia de seguridad manual.
const Backup = (() => {
  async function exportar(filas) {
    const blob = new Blob([JSON.stringify({ app: 'registro_nc', version: 2, filas }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup_registro_nc_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // Convierte una ficha de la Fase 1 (NC-AAAA-001, ciclo de estados) a una fila del registro.
  function desdeFicha(nc, orden) {
    const f = DB.nuevaFila(orden);
    f.id = nc.id || f.id;
    f.fecha = (nc.fechaHora || '').slice(0, 10);
    f.lote = nc.lote || '';
    f.prod = nc.producto || '';
    f.sev = { menor: 'Leve', mayor: 'Moderado', critica: 'Crítico' }[nc.gravedad] || '';
    f.desc = [nc.numero, nc.lineaSector, nc.descripcion].filter(Boolean).join(' · ');
    f.ac = (nc.accionCorrectiva && nc.accionCorrectiva.descripcion) || (nc.accionInmediata && nc.accionInmediata.detalle) || '';
    f.resp = (nc.accionCorrectiva && nc.accionCorrectiva.responsable) || '';
    f.plazo = (nc.accionCorrectiva && nc.accionCorrectiva.fechaCompromiso) || '';
    f.est = nc.estado === 'cerrada' ? 'Finalizado' : (nc.estado === 'abierta' || !nc.estado) ? 'Pendiente' : 'En proceso';
    f.cierre = (nc.verificacion && nc.verificacion.fecha) || '';
    f.eficacia = nc.verificacion ? (nc.verificacion.resultado === 'eficaz' ? 'Eficaz' : 'No eficaz') : 'Pendiente';
    return f;
  }

  // Lee el archivo y devuelve las filas ya normalizadas (acepta backups nuevos y de la Fase 1).
  async function leer(archivo, ordenBase) {
    const datos = JSON.parse(await archivo.text());
    const lista = Array.isArray(datos) ? datos : datos && datos.filas;
    if (!Array.isArray(lista)) throw new Error('el archivo no tiene el formato esperado');
    return lista.map((r, i) => {
      if (!r || typeof r !== 'object') throw new Error('hay un registro inválido');
      if (r.numero && 'descripcion' in r) return desdeFicha(r, ordenBase + i);
      return Object.assign(DB.nuevaFila(ordenBase + i), r);
    });
  }

  return { exportar, leer };
})();
