export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const pathname = new URL(request.url).pathname;
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
