function createHandbookPdf(images, pageWidth = 595.28, pageHeight = 841.89) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let size = 0;
  const append = value => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    parts.push(bytes);
    size += bytes.byteLength;
  };
  const object = (id, contents) => {
    offsets[id] = size;
    append(`${id} 0 obj\n`);
    for (const part of contents) append(part);
    append('\nendobj\n');
  };

  append('%PDF-1.4\n');
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  const pageRefs = images.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
  object(2, [`<< /Type /Pages /Count ${images.length} /Kids [${pageRefs}] >>`]);
  images.forEach(({ bytes, width, height }, index) => {
    const id = 3 + index * 3;
    const commands = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /PageImage Do Q`;
    object(id, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /PageImage ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`]);
    object(id + 1, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`, bytes, '\nendstream']);
    object(id + 2, [`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`]);
  });
  const xref = size;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(offset => append(`${String(offset).padStart(10, '0')} 00000 n \n`));
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

export async function downloadReportPdf(title, metadata, sections, charts = [], summary = null) {
  if (summary) {
    const blob = await buildDashboardReportPdf(title, metadata, sections, charts, summary);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[^\p{L}\p{N} -]/gu, '').trim().slice(0, 100) || 'NASUN'}-${summary.paperSize === 'A3' ? 'A3' : 'A4'}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  try {
    const images = [];
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    const margin = 95;
    let y = margin;
    const clearPage = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      y = margin;
    };
    const addPageImage = () => {
      if (summary) {
        ctx.fillStyle = '#dce6ed';
        ctx.fillRect(margin, 1664, canvas.width - margin * 2, 2);
        ctx.fillStyle = '#456075';
        ctx.font = '20px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(`NASUN  /  Báo cáo nội bộ                                              Trang ${images.length + 1}`, margin, 1680);
      }

      const encoded = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      images.push({ width: canvas.width, height: canvas.height, bytes: Uint8Array.from(atob(encoded), char => char.charCodeAt(0)) });
    };
    const write = (value, size = 24, bold = false) => {
      ctx.font = `${bold ? 700 : 400} ${size}px sans-serif`;
      const lineHeight = Math.ceil(size * 1.45);
      const draw = line => {
        if (y + lineHeight > canvas.height - margin) {
          addPageImage();
          clearPage();
        }
        ctx.fillStyle = bold ? '#155e75' : '#172033';
        ctx.textBaseline = 'top';
        ctx.fillText(line, margin, y);
        y += lineHeight;
      };
      for (const paragraph of String(value).split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(candidate).width > canvas.width - margin * 2) {
            draw(line);
            line = '';
          }
          if (ctx.measureText(word).width > canvas.width - margin * 2) {
            for (const character of word) {
              if (ctx.measureText(line + character).width > canvas.width - margin * 2) {
                draw(line);
                line = '';
              }
              line += character;
            }
          } else {
            line = line ? `${line} ${word}` : word;
          }
        }
        draw(line);
      }
    };
    clearPage();
    if (summary) {
      ctx.fillStyle = '#102e47';
      ctx.fillRect(0, 0, canvas.width, 320);
      ctx.fillStyle = '#2dd4bf';
      ctx.fillRect(0, 310, canvas.width, 10);
      ctx.textBaseline = 'top';
      ctx.font = '700 26px sans-serif';
      ctx.fillText('NASUN  /  VẬN HÀNH KỸ THUẬT', margin, 72);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 50px sans-serif';
      ctx.fillText('Báo cáo hệ thống máy pha màu', margin, 123);
      ctx.font = '26px sans-serif';
      ctx.fillText(summary.period, margin, 207);
      ctx.fillText(metadata.filter(Boolean).join(' · '), margin, 251, canvas.width - margin * 2);
      y = 356;
      const gap = 18;
      const tileWidth = (canvas.width - margin * 2 - gap * 2) / 3;
      summary.metrics.forEach(([label, value], index) => {
        const x = margin + index * (tileWidth + gap);
        ctx.fillStyle = '#edf5f8';
        ctx.fillRect(x, y, tileWidth, 114);
        ctx.fillStyle = '#155e75';
        ctx.font = '700 42px sans-serif';
        ctx.fillText(Number(value).toLocaleString('vi-VN'), x + 18, y + 14);
        ctx.fillStyle = '#304b60';
        ctx.font = '22px sans-serif';
        ctx.fillText(label, x + 18, y + 72, tileWidth - 36);
      });
      if (summary.metrics.length) y += 145;
    } else {
      write('NASUN', 24, true);
      write(title, 42, true);
      write(metadata.filter(Boolean).join(' · '));
    }
    for (const [heading, content] of sections) {
      const entries = (Array.isArray(content) ? content : [content]).filter(Boolean);
      if (!entries.length) continue;
      y += 18;
      write(heading, 30, true);
      entries.forEach((entry, index) => write(Array.isArray(content) ? `${index + 1}. ${entry}` : entry));
    }
    for (const [heading, rows] of charts) {
      if (y + 130 > canvas.height - margin) {
        addPageImage();
        clearPage();
      }
      y += 20;
      write(heading, 30, true);
      if (!rows.length) write('Không có dữ liệu.');
      const maximum = Math.max(1, ...rows.map(row => row.count));
      for (const row of rows) {
        write(`${row.label} · ${row.count}`);
        if (y + 24 > canvas.height - margin) {
          addPageImage();
          clearPage();
        }
        ctx.fillStyle = '#edf2f6';
        ctx.fillRect(margin, y, canvas.width - margin * 2, 12);
        ctx.fillStyle = '#087e8b';
        ctx.fillRect(margin, y, (canvas.width - margin * 2) * row.count / maximum, 12);
        y += 24;
      }
    }
    for (const [heading, headers, rows] of summary?.tables ?? []) {
      if (y + 140 > canvas.height - margin) {
        addPageImage();
        clearPage();
      }
      y += 24;
      const columnWidth = (canvas.width - 2 * margin) / headers.length;
      const renderRow = (values, background, color, bold = false) => {
        ctx.font = `${bold ? 700 : 400} 21px sans-serif`;
        const cells = values.map(value => {
          const lines = [''];
          for (const character of String(value ?? '—')) {
            const last = lines.length - 1;
            if (ctx.measureText(lines[last] + character).width > columnWidth - 24) lines.push('');
            lines[lines.length - 1] += character;
          }
          return lines;
        });
        const lineCount = Math.max(...cells.map(lines => lines.length));
        const height = lineCount * 29 + 20;
        if (y + height > canvas.height - margin && !bold) {
          addPageImage();
          clearPage();
          write(heading + ' · tiếp theo', 30, true);
          renderRow(headers, '#153b56', '#ffffff', true);
          ctx.font = '400 21px sans-serif';
        }
        ctx.fillStyle = background;
        ctx.fillRect(margin, y, columnWidth * headers.length, height);
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';
        cells.forEach((lines, column) => lines.forEach((line, index) =>
          ctx.fillText(line, margin + column * columnWidth + 12, y + 10 + index * 29)));
        y += height;
      };
      write(heading, 30, true);
      renderRow(headers, '#153b56', '#ffffff', true);
      if (!rows.length) write('Không có dữ liệu.');
      rows.forEach((row, index) => renderRow(row, index % 2 ? '#ffffff' : '#eef5f8', '#172033'));
    }
    if (summary?.photos) {
      write('Ảnh minh họa từ phiếu', 30, true);
      if (!summary.photos.length) write('Không có ảnh trong kỳ.');
      let unavailable = 0;
      for (const { src, label } of summary.photos) {
        const photo = new Image();
        photo.crossOrigin = 'anonymous';
        photo.src = src;
        try {
          await photo.decode();
        } catch {
          unavailable++;
          continue;
        }
        const scale = Math.min((canvas.width - margin * 2) / photo.naturalWidth, 450 / photo.naturalHeight);
        const height = photo.naturalHeight * scale;
        if (y + height + 90 > canvas.height - margin) {
          addPageImage();
          clearPage();
        }
        write(label, 24, true);
        ctx.drawImage(photo, margin, y, photo.naturalWidth * scale, height);
        y += height + 28;
      }
      if (unavailable) write(`${unavailable} ảnh không tải được.`);
    }
    addPageImage();
    const link = document.createElement('a');
    const url = URL.createObjectURL(createHandbookPdf(images));
    link.href = url;
    link.download = `${title.replace(/[^\p{L}\p{N} -]/gu, '').trim().slice(0, 100) || 'NASUN'}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    console.error('Handbook PDF export failed', error);
    window.alert('Không tạo được tệp PDF. Hãy thử lại.');
  }
}


// Render Vietnamese text using browser fonts, then embed each page as a high-resolution image.
// This also keeps exports independent of remote font services and PDF font encodings.
export async function buildDashboardReportPdf(title, metadata, sections, charts, summary) {
  await document.fonts?.ready;
  const large = summary.paperSize === 'A3';
  const width = large ? 1754 : 1240;
  const height = large ? 2480 : 1754;
  const margin = 76;
  const usable = width - margin * 2;
  const bottom = height - 100;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is unavailable');
  const palette = ['#087f8c', '#284f79', '#ce8a27', '#7661a6', '#399886', '#ba6475'];
  const pages = [];
  let y = 0;
  let sectionIndex = 0;
  const font = (size = 24, bold = false) => { ctx.font = `${bold ? 700 : 400} ${size}px Arial, sans-serif`; };
  const text = (value, x, top, size = 24, color = '#20394c', bold = false, align = 'left') => {
    font(size, bold);
    ctx.textBaseline = 'top';
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(String(value), x, top);
    ctx.textAlign = 'left';
  };
  const rect = (x, top, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, top, w, h); };
  const wrap = (value, maxWidth, size = 24, bold = false) => {
    font(size, bold);
    const lines = [];
    for (const paragraph of String(value ?? '—').split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = ''; }
        if (ctx.measureText(word).width > maxWidth) {
          for (const character of word) {
            if (line && ctx.measureText(line + character).width > maxWidth) { lines.push(line); line = ''; }
            line += character;
          }
        } else line = line ? `${line} ${word}` : word;
      }
      lines.push(line);
    }
    return lines;
  };
  const finishPage = () => {
    rect(margin, height - 76, usable, 1, '#cfdde3');
    text('NASUN  /  BÁO CÁO VẬN HÀNH NỘI BỘ', margin, height - 57, 17, '#647787', true);
    text(`${large ? 'A3' : 'A4'}  ·  ${String(pages.length + 1).padStart(2, '0')}`, width - margin, height - 57, 18, '#647787', false, 'right');
    const encoded = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
    pages.push({ width, height, bytes: Uint8Array.from(atob(encoded), character => character.charCodeAt(0)) });
  };
  const startPage = (first = false) => {
    rect(0, 0, width, height, '#ffffff');
    if (first) {
      rect(0, 0, width, 292, '#102f46');
      rect(margin, 52, 8, 35, '#39c9b2');
      text('NASUN', margin + 24, 48, 35, '#ffffff', true);
      text('TECHNICAL OPERATIONS', width - margin, 58, 18, '#9fc8d6', true, 'right');
      text('BÁO CÁO HỆ THỐNG', margin, 117, 45, '#ffffff', true);
      text('MÁY PHA MÀU', margin, 170, 45, '#ffffff', true);
      text(summary.period || title, margin, 239, 24, '#a8e2dc');
      rect(0, 292, width, 6, '#15a998');
      y = 324;
      for (const line of wrap(metadata.filter(Boolean).join('  |  '), usable, 21)) {
        text(line, margin, y, 21, '#587080'); y += 29;
      }
      y += 16;
    } else {
      rect(margin, 41, 6, 28, '#15a998');
      text('NASUN / BÁO CÁO HỆ THỐNG', margin + 20, 43, 21, '#153c55', true);
      text(summary.period || '', width - margin, 45, 19, '#647787', false, 'right');
      rect(margin, 89, usable, 1, '#d8e3e8');
      y = 119;
    }
  };
  const ensure = required => {
    if (y + required > bottom) { finishPage(); startPage(); return true; }
    return false;
  };
  const paragraph = (value, size = 23, color = '#506776') => {
    const lines = wrap(value, usable, size);
    const paragraphHeight = lines.length * Math.ceil(size * 1.45);
    if (paragraphHeight < bottom - 119) ensure(paragraphHeight);
    for (const line of lines) {
      ensure(size * 1.5);
      text(line, margin, y, size, color);
      y += Math.ceil(size * 1.45);
    }
  };
  const heading = (label, continuation = false) => {
    ensure(110);
    y += 18;
    rect(margin, y, 44, 36, '#e0f2ef');
    text(String(sectionIndex).padStart(2, '0'), margin + 22, y + 6, 21, '#087f8c', true, 'center');
    const lines = wrap(label + (continuation ? ' (tiếp theo)' : ''), usable - 64, 29, true);
    for (const [index, line] of lines.entries()) text(line, margin + 64, y + index * 38, 29, '#153c55', true);
    y += Math.max(36, lines.length * 38) + 22;
  };
  startPage(true);
  for (const [label, content] of sections) {
    if (!content) continue;
    text(label.toUpperCase(), margin, y, 18, '#087f8c', true); y += 29;
    paragraph(Array.isArray(content) ? content.join('\n') : content, 21);
    y += 14;
  }
  if (summary.metrics?.length) {
    const gap = 18;
    const count = Math.min(3, summary.metrics.length);
    const tileWidth = (usable - gap * (count - 1)) / count;
    for (let offset = 0; offset < summary.metrics.length; offset += count) {
      ensure(150);
      summary.metrics.slice(offset, offset + count).forEach(([label, value], index) => {
        const x = margin + index * (tileWidth + gap);
        rect(x, y, tileWidth, 132, '#eff5f7');
        rect(x, y, 5, 132, palette[index % palette.length]);
        text(Number(value).toLocaleString('vi-VN'), x + 22, y + 16, 46, '#123e56', true);
        wrap(label, tileWidth - 44, 21).forEach((line, lineIndex) => text(line, x + 22, y + 77 + lineIndex * 26, 21, '#506776'));
      });
      y += 154;
    }
  }
  const chart = (label, rows, percent = false) => {
    sectionIndex++;
    ensure(180);
    heading(label);
    if (!rows.length) { paragraph('Không có dữ liệu trong phạm vi đã chọn.'); y += 12; return; }
    const maximum = percent ? 100 : Math.max(1, ...rows.map(row => Number(row.count) || 0));
    const drawRows = rows.map(row => ({ ...row, lines: wrap(row.label, usable * 0.66, 23) }));
    for (const [index, row] of drawRows.entries()) {
      const rowHeight = row.lines.length * 30 + 36;
      if (ensure(rowHeight)) heading(label, true);
      row.lines.forEach((line, lineIndex) => text(line, margin, y + lineIndex * 30, 23));
      text(row.count == null ? 'Chưa đủ dữ liệu' : `${Number(row.count).toLocaleString('vi-VN', { maximumFractionDigits: percent ? 1 : 0 })}${percent ? '%' : ''}`, width - margin, y, 24, '#153c55', true, 'right');
      y += row.lines.length * 30 + 8;
      rect(margin, y, usable, 13, '#eaf0f3');
      if (row.count > 0) rect(margin, y, usable * Math.min(1, row.count / maximum), 13, palette[index % palette.length]);
      y += 28;
    }
    y += 12;
  };
  const table = (label, headers, rows, weights) => {
    sectionIndex++;
    ensure(180);
    heading(label);
    const ratios = weights || (headers.length === 6 ? [1.05, 0.95, 1.6, 1.05, 1.05, 1.1] : headers.length === 4 ? [1, 1.7, 1.2, 1] : headers.map(() => 1));
    const total = ratios.reduce((sum, value) => sum + value, 0);
    const widths = ratios.map(value => usable * value / total);
    const cellLines = (values, bold = false) => headers.map((_, index) => wrap(values[index], widths[index] - 26, 22, bold));
    const paintRow = (cells, offset, lineCount, background, bold = false) => {
      const rowHeight = lineCount * 29 + 22;
      rect(margin, y, usable, rowHeight, background);
      let x = margin;
      cells.forEach((lines, column) => {
        lines.slice(offset, offset + lineCount).forEach((line, index) => text(line, x + 13, y + 11 + index * 29, 22, bold ? '#ffffff' : '#20394c', bold));
        x += widths[column];
      });
      y += rowHeight;
      rect(margin, y - 1, usable, 1, '#dce6eb');
    };
    const header = () => {
      const cells = cellLines(headers, true);
      paintRow(cells, 0, Math.max(...cells.map(lines => lines.length)), '#183e56', true);
    };
    header();
    if (!rows.length) { y += 18; paragraph('Không có dữ liệu trong phạm vi đã chọn.'); }
    for (const [index, values] of rows.entries()) {
      const cells = cellLines(values);
      const lines = Math.max(...cells.map(cell => cell.length));
      let offset = 0;
      // Keep ordinary rows together; extremely long cells continue without dropping content.
      if (y + lines * 29 + 22 > bottom && lines * 29 + 22 < bottom - 260) {
        finishPage(); startPage(); heading(label, true); header();
      }
      while (offset < lines) {
        let available = Math.floor((bottom - y - 22) / 29);
        if (available < 1) { finishPage(); startPage(); heading(label, true); header(); available = Math.floor((bottom - y - 22) / 29); }
        const take = Math.min(lines - offset, available);
        paintRow(cells, offset, take, index % 2 ? '#ffffff' : '#f0f5f7');
        offset += take;
      }
    }
    y += 22;
  };
  const chartCards = entries => {
    for (let offset = 0; offset < entries.length; offset += 2) {
      const pair = entries.slice(offset, offset + 2);
      const gap = 24;
      const cardWidth = (usable - gap * (pair.length - 1)) / pair.length;
      const innerWidth = cardWidth - 44;
      const cards = pair.map(([label, rows]) => ({
        title: wrap(label, innerWidth, 26, true),
        rows: rows.map(row => ({ ...row, lines: wrap(row.label, innerWidth - 70, 22) })),
      }));
      const cardHeight = Math.max(...cards.map(card => 60 + card.title.length * 34
        + (card.rows.length ? card.rows.reduce((sum, row) => sum + row.lines.length * 29 + 30, 0) : 70)));
      // Long catalogs use the paginated full-width chart so no category is omitted.
      if (cardHeight > 620) { pair.forEach(([label, rows]) => chart(label, rows)); continue; }
      ensure(cardHeight + 28);
      cards.forEach((card, index) => {
        const x = margin + index * (cardWidth + gap);
        rect(x, y, cardWidth, cardHeight, '#f1f6f8');
        rect(x, y, cardWidth, 4, palette[index]);
        let top = y + 22;
        card.title.forEach(line => { text(line, x + 22, top, 26, '#153c55', true); top += 34; });
        top += 18;
        const maximum = Math.max(1, ...card.rows.map(row => Number(row.count) || 0));
        if (!card.rows.length) text('Không có dữ liệu trong kỳ.', x + 22, top, 21, '#647787');
        card.rows.forEach((row, rowIndex) => {
          row.lines.forEach((line, lineIndex) => text(line, x + 22, top + lineIndex * 29, 22));
          text(Number(row.count).toLocaleString('vi-VN'), x + cardWidth - 22, top, 23, '#153c55', true, 'right');
          top += row.lines.length * 29 + 7;
          rect(x + 22, top, innerWidth, 11, '#dfe9ee');
          if (row.count > 0) rect(x + 22, top, innerWidth * row.count / maximum, 11, palette[rowIndex % palette.length]);
          top += 23;
        });
      });
      y += cardHeight + 28;
    }
  };
  // Overview first, then health and operational detail in the same order as the report options.
  const repairCharts = charts.filter(([label]) => /Xử lý trong kỳ|Phiếu theo loại/.test(label));
  chartCards(charts.filter(item => !repairCharts.includes(item)));
  if (summary.health) {
    sectionIndex++;
    ensure(360);
    heading('Tổng quan sức khỏe hệ thống');
    const total = summary.health.operatingTotal;
    const faulty = summary.health.faultyTotal;
    const centerX = margin + 132;
    const centerY = y + 126;
    const ring = (color, start, end) => {
      ctx.beginPath(); ctx.arc(centerX, centerY, 92, start, end); ctx.strokeStyle = color; ctx.lineWidth = 33; ctx.stroke();
    };
    ring(total ? '#0d9488' : '#e3ebef', 0, Math.PI * 2);
    if (total && faulty) ring('#d68b32', -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * faulty / total);
    text(total ? `${(faulty / total * 100).toFixed(1)}%` : '—', centerX, centerY - 25, 38, '#163c54', true, 'center');
    text('có lỗi trong kỳ', centerX, centerY + 26, 18, '#647787', false, 'center');
    const legendX = margin + 300;
    text('THIẾT BỊ HIỆN ĐANG HOẠT ĐỘNG', legendX, y + 30, 20, '#647787', true);
    text(Number(total).toLocaleString('vi-VN'), legendX, y + 64, 44, '#163c54', true);
    for (const [index, [label, value, color]] of [
      ['Có lỗi trong kỳ', faulty, '#d68b32'],
      ['Chưa ghi nhận lỗi trong kỳ', Math.max(0, total - faulty), '#0d9488'],
    ].entries()) {
      rect(legendX, y + 129 + index * 42, 15, 15, color);
      text(`${label}: ${value}`, legendX + 28, y + 125 + index * 42, 23);
    }
    y += 263;
    chart('Sức khỏe thiết bị đang vận hành', summary.health.operatingStats.map(row => ({ label: row.name, count: row.rate })), true);
    paragraph('Tỷ lệ = thiết bị hiện đang hoạt động có lỗi trong kỳ / thiết bị hiện đang hoạt động đủ dữ liệu liên kết. Không phải tỷ lệ lỗi của toàn bộ lịch sử vận hành.', 20);
    const excluded = summary.health.operatingStats.reduce((sum, row) => sum + row.excluded, 0);
    if (excluded) paragraph(`${excluded} lượt liên kết thiết bị chưa đủ điều kiện tính mẫu số.`, 20, '#8a6127');
    table('Chi tiết sức khỏe thiết bị', ['Thiết bị', 'Đang hoạt động', 'Có lỗi trong kỳ', 'Tỷ lệ'], summary.health.operatingStats.map(row => [row.name, row.operating, row.faulty, row.rate == null ? 'Chưa đủ dữ liệu' : row.rate.toFixed(1) + '%']), [1.3, 1, 1, 1.1]);
  }
  const reportTables = summary.tables || [];
  for (const item of reportTables.filter(([label]) => !/sửa chữa/i.test(label))) table(...item);
  chartCards(repairCharts);
  for (const item of reportTables.filter(([label]) => /sửa chữa/i.test(label))) table(...item);
  if (summary.photos) {
    sectionIndex++;
    heading('Ảnh từ phiếu trong kỳ');
    if (!summary.photos.length) paragraph('Không có ảnh đính kèm trong kỳ.');
    for (const { src, label } of summary.photos) {
      const photo = new Image();
      photo.crossOrigin = 'anonymous';
      photo.src = src;
      try { await photo.decode(); } catch { paragraph(`${label}: không tải được ảnh.`, 21, '#8a6127'); continue; }
      const scale = Math.min(usable / photo.naturalWidth, 520 / photo.naturalHeight);
      const photoHeight = photo.naturalHeight * scale;
      const labelLines = wrap(label, usable, 23);
      ensure(photoHeight + labelLines.length * 34 + 26);
      paragraph(label, 23, '#153c55');
      ctx.drawImage(photo, margin, y, photo.naturalWidth * scale, photoHeight);
      y += photoHeight + 26;
    }
  }
  finishPage();
  return createHandbookPdf(pages, large ? 841.89 : 595.28, large ? 1190.55 : 841.89);
}
