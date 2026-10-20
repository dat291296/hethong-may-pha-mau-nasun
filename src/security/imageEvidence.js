export const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_EVIDENCE_IMAGES = 6;
export function validateInlineImage(value) {
  if (typeof value !== 'string' || value.length > 2796250 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Ảnh chỉ hỗ trợ JPEG, PNG hoặc WEBP hợp lệ.');
  const [header,payload]=value.split(',');
  if (payload.length % 4) throw new Error('Nội dung ảnh không hợp lệ.');
  let binary;
  try { binary=atob(payload); } catch { throw new Error('Nội dung ảnh không hợp lệ.'); }
  if (binary.length > MAX_INLINE_IMAGE_BYTES) throw new Error('Ảnh sau xử lý vượt quá 2 MB. Vui lòng chọn ảnh nhỏ hơn.');
  const bytes=Array.from(binary.slice(0,12),c=>c.charCodeAt(0));
  const starts=(...expected)=>expected.every((n,i)=>bytes[i]===n);
  if (!(header==='data:image/jpeg;base64' && starts(255,216,255)
    || header==='data:image/png;base64' && starts(137,80,78,71,13,10,26,10)
    || header==='data:image/webp;base64' && binary.slice(0,4)==='RIFF' && binary.slice(8,12)==='WEBP')) throw new Error('Nội dung ảnh không khớp định dạng.');
  return value;
}
