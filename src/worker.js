export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) {
      return new Response('Origin not allowed', { status: 403, headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
        'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff',
      } });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Vary': 'Origin', 'Access-Control-Allow-Origin': url.origin,
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Max-Age': '600',
      } });
    }
    const response = await env.ASSETS.fetch(request);
    const pathname = url.pathname;
    if (pathname.startsWith('/assets/') && /text\/html/i.test(response.headers.get('content-type') || '')) {
      return new Response('Asset not found', { status: 404, headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      } });
    }
    return response;
  },
};
