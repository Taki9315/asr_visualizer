/**
 * Cloudflare Worker entry for the static Three.js application.
 * Sites binds the Vite client output to `env.ASSETS`.
 */
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== 'GET') return response;

    const url = new URL(request.url);
    if (url.pathname.includes('.')) return response;

    const fallbackUrl = new URL('/index.html', request.url);
    return env.ASSETS.fetch(new Request(fallbackUrl, request));
  }
};
