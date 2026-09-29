// pdf.js — exporta una No Conformidad individual a PDF.
// Mismo motor jsPDF que informeCalidad: encabezado con logo (o nombre de empresa),
// línea de acento, contenido en flujo continuo y pie de página con numeración.
const PDF = (() => {
  const hex2rgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] };

  function exportarNC(nc) {
    if (!window.jspdf) { alert('No cargó el generador de PDF. Revisá la conexión.'); return }
    const logoImgEl = document.getElementById('logoImg');
    const logoOk = logoImgEl && logoImgEl.complete && logoImgEl.naturalWidth > 0;
    const accentRGB = hex2rgb(BRAND.colorAcento);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20, CW = W - 2 * M;
    let y = 0;

    function drawHeader() {
      let bottom = 20;
      if (logoOk) {
        const maxH = 14, ratio = logoImgEl.naturalWidth / logoImgEl.naturalHeight;
        let h = maxH, w = h * ratio;
        if (w > 70) { w = 70; h = w / ratio }
        doc.addImage(logoImgEl, 'PNG', M, 12, w, h);
        bottom = 12 + h;
      } else {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(40);
        doc.text(BRAND.empresa, M, 20); doc.setTextColor(0);
        bottom = 22;
      }
      doc.setDrawColor(200); doc.setLineWidth(.3); doc.line(M, bottom + 4, W - M, bottom + 4);
      y = bottom + 16;
    }
    const need = h => { if (y + h > 278) { const f = doc.getFont(), sz = doc.internal.getFontSize(); doc.addPage(); drawHeader(); doc.setFont(f.fontName, f.fontStyle); doc.setFontSize(sz) } };
    const lines = (t, size, style) => {
      doc.setFont('helvetica', style === 'bold' ? 'bold' : style === 'italic' ? 'italic' : 'normal'); doc.setFontSize(size);
      for (const l of doc.splitTextToSize(t || '-', CW)) { need(6); doc.text(l, M, y); y += 5.6 }
    };
    function campo(etiqueta, valor) {
      need(6);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text(etiqueta + ':', M, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(valor || '-'), M + 42, y);
      y += 6;
    }
    function photoGrid(fs) {
      if (!fs || !fs.length) return;
      lines('Registro fotográfico', 10.5, 'italic'); y += 1;
      const n = fs.length, cols = n === 1 ? 1 : 2, gap = 6, cellW = cols === 1 ? CW * .55 : (CW - gap) / 2;
      for (let k = 0; k < n; k += cols) {
        const row = fs.slice(k, k + cols).map(f => { let w = cellW, h = w * f.h / f.w; if (h > 120) { h = 120; w = h * f.w / f.h } return { f, w, h } });
        const rowH = Math.max(...row.map(r => r.h));
        need(rowH + 6);
        row.forEach((r, idx) => { const x = M + idx * (cellW + gap) + (cellW - r.w) / 2; doc.addImage(r.f.d, 'JPEG', x, y, r.w, r.h) });
        y += rowH + 6;
      }
      y += 1;
    }

    drawHeader();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text('NO CONFORMIDAD ' + (nc.numero || ''), M, y);
    doc.setDrawColor(...accentRGB); doc.setLineWidth(.6); doc.line(M, y + 3, W - M, y + 3);
    y += 12;

    campo('Fecha/hora', nc.fechaHora);
    campo('Detectado por', nc.detectadoPor);
    campo('Línea/sector', nc.lineaSector);
    campo('Producto', nc.producto);
    campo('Lote', nc.lote);
    campo('Tipo', (TIPO_LABEL[nc.tipo] || nc.tipo) + (nc.tipoDetalle ? ' — ' + nc.tipoDetalle : ''));
    campo('Gravedad', GRAVEDAD_LABEL[nc.gravedad] || nc.gravedad);
    campo('Estado', ESTADOS_LABEL[nc.estado] || nc.estado);
    y += 4;

    if (nc.descripcion) { lines('Descripción:', 10.5, 'italic'); lines(nc.descripcion, 10.5, 'normal'); y += 3 }
    photoGrid(nc.fotos);

    if (nc.accionInmediata) {
      lines('Acción inmediata:', 10.5, 'bold');
      lines((INMEDIATA_LABEL[nc.accionInmediata.tipo] || nc.accionInmediata.tipo) + (nc.accionInmediata.detalle ? ' — ' + nc.accionInmediata.detalle : ''), 10.5, 'normal');
      y += 3;
    }
    if (nc.accionCorrectiva) {
      lines('Acción correctiva:', 10.5, 'bold');
      lines(nc.accionCorrectiva.descripcion, 10.5, 'normal');
      campo('Responsable', nc.accionCorrectiva.responsable);
      campo('Fecha compromiso', nc.accionCorrectiva.fechaCompromiso);
      y += 3;
    }
    if (nc.verificacion) {
      lines('Verificación de eficacia:', 10.5, 'bold');
      campo('Fecha', nc.verificacion.fecha);
      campo('Resultado', nc.verificacion.resultado === 'eficaz' ? 'Eficaz' : 'No eficaz');
      if (nc.verificacion.comentario) lines(nc.verificacion.comentario, 10.5, 'normal');
      y += 3;
    }

    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`${BRAND.departamento} · ${nc.numero || ''} | Página ${p}`, W / 2, 290, { align: 'center' });
      doc.setTextColor(0);
    }

    const filename = `${nc.numero || 'NC'}.pdf`;
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(doc.output('blob'));
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      alert('No se pudo generar el PDF.');
    }
  }

  return { exportarNC };
})();
