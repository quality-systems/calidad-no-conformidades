// db.js — capa de datos local (IndexedDB). Una fila del registro = un registro propio (keyPath: id),
// así cada cambio reescribe solo esa NC y no un array gigante.
// Los stores "no_conformidades" y "meta" son de la Fase 1 (fichas) y se dejan intactos por si hay datos.
const DB = (() => {
  const NOMBRE_DB = 'calidad_nc_v1';
  const VERSION_DB = 2;
  let dbPromise = null;

  function abrir() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOMBRE_DB, VERSION_DB);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('no_conformidades')) db.createObjectStore('no_conformidades', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'clave' });
        if (!db.objectStoreNames.contains('filas')) db.createObjectStore('filas', { keyPath: 'id' });
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  // Corre una operación sobre el store "filas" y espera a que la transacción termine.
  async function tx(modo, fn) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const t = db.transaction('filas', modo);
      let res;
      fn(t.objectStore('filas'), v => { res = v; });
      t.oncomplete = () => resolve(res);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const nuevoId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'nc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  // Modelo de una fila del registro. `_o` es el orden de carga, `_m` la última modificación,
  // `_plazoAuto` el último plazo calculado solo (para no pisar uno puesto a mano).
  function nuevaFila(orden) {
    return { id: nuevoId(), _o: orden || Date.now(), _m: Date.now(), fecha: '', lote: '', cliente: '', prod: '', tipo: '', sev: '', detec: '',
      desc: '', litNC: '', litTot: '', ac: '', plazo: '', _plazoAuto: '', est: 'Pendiente', cierre: '', pallets: '', resp: '', eficacia: 'Pendiente' };
  }

  const listar = () => tx('readonly', (s, out) => { s.getAll().onsuccess = e => out(e.target.result || []); });
  const guardarVarias = filas => tx('readwrite', s => filas.forEach(f => s.put(f)));
  const borrarTodo = () => tx('readwrite', s => s.clear());
  // Reemplaza todo el contenido (quitar duplicados, borrar todo).
  const reemplazarTodo = filas => tx('readwrite', s => { s.clear(); filas.forEach(f => s.put(f)); });

  return { nuevoId, nuevaFila, listar, guardarVarias, borrarTodo, reemplazarTodo };
})();
