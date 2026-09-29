// fotos.js — redimensiona fotos a JPEG liviano antes de guardarlas.
// Mismo patrón que informeCalidad: máximo 1200px de lado mayor, calidad .75.
// Así una foto de 4-8MB del celular queda en unos pocos cientos de KB antes de ir a IndexedDB.
const Fotos = (() => {
  function redimensionar(archivo) {
    return new Promise(resolve => {
      const lector = new FileReader();
      lector.onload = () => {
        const img = new Image();
        img.onload = () => {
          const escala = Math.min(1, 1200 / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * escala);
          canvas.height = Math.round(img.height * escala);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ d: canvas.toDataURL('image/jpeg', 0.75), w: canvas.width, h: canvas.height });
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  return { redimensionar };
})();
