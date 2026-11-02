export function pageWindow(total, requestedPage, requestedSize) {
  const size = Number.isSafeInteger(requestedSize) && requestedSize > 0 && requestedSize <= 100 ? requestedSize : 10;
  const pages = Math.max(1, Math.ceil(total / size));
  const candidate = Number(requestedPage);
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(candidate) ? candidate : 1));
  return { page, pages, size, start: (page - 1) * size, end: Math.min(page * size, total) };
}
