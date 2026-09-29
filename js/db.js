// db.js — capa de datos: IndexedDB con dos object stores.
// "no_conformidades": cada NC es un registro propio (keyPath: id). A diferencia del
// registro viejo de Agrofacil, acá cada NC se guarda y se borra individualmente,
// en vez de reescribir un único array gigante en cada cambio.
// "meta": un solo registro con el contador correlativo del año, para armar NC-AAAA-001.
const DB = (() => {
  const NOMBRE_DB = 'calidad_nc_v1';
  const VERSION_DB = 1;
  let dbPromise = null;

  function abrir() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOMBRE_DB, VERSION_DB);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('no_conformidades')) db.createObjectStore('no_conformidades', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'clave' });
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function nuevoId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'nc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  async function guardarNC(nc) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('no_conformidades', 'readwrite');
      tx.objectStore('no_conformidades').put(nc);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function borrarNC(id) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('no_conformidades', 'readwrite');
      tx.objectStore('no_conformidades').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function listarNC() {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('no_conformidades', 'readonly');
      const req = tx.objectStore('no_conformidades').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function obtenerNC(id) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('no_conformidades', 'readonly');
      const req = tx.objectStore('no_conformidades').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // Genera el próximo número correlativo del año actual: NC-AAAA-001, NC-AAAA-002, ...
  async function proximoNumero() {
    const db = await abrir();
    const anio = new Date().getFullYear();
    const clave = 'contador_' + anio;
    let siguiente = 1;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      const store = tx.objectStore('meta');
      const req = store.get(clave);
      req.onsuccess = () => {
        const actual = (req.result && req.result.valor) || 0;
        siguiente = actual + 1;
        store.put({ clave, valor: siguiente });
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve(`NC-${anio}-${String(siguiente).padStart(3, '0')}`);
      tx.onerror = () => reject(tx.error);
    });
  }

  return { nuevoId, guardarNC, borrarNC, listarNC, obtenerNC, proximoNumero };
})();
