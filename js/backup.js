// backup.js — exporta/importa todas las NC como un archivo .json de respaldo.
// Existe porque si se borra el navegador (o se cambia de celular) se pierde todo
// lo que está en IndexedDB: este archivo es la copia de seguridad manual.
const Backup = (() => {
  async function exportar() {
    const registros = await DB.listarNC();
    const blob = new Blob([JSON.stringify(registros, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup_nc_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // Fusiona por id: si una NC del backup ya existe, la reemplaza; si es nueva, la agrega.
  // No borra las NC que ya tenías y no están en el archivo.
  async function importar(archivo) {
    const texto = await archivo.text();
    const registros = JSON.parse(texto);
    if (!Array.isArray(registros)) throw new Error('el archivo no tiene el formato esperado');
    for (const nc of registros) await DB.guardarNC(nc);
  }

  return { exportar, importar };
})();
