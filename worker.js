import { handleApi, HttpError, requireConfiguration } from './lib/api.js';
import { readSession } from './lib/security.js';
import { adminPage } from './lib/admin-page.js';

const securityHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Robots-Tag': 'noindex, nofollow'
};

async function fetch(request, env) {
  const path = new URL(request.url).pathname;
  const isApi = path === '/api' || path.startsWith('/api/');
  const isAdmin = path === '/admin' || path.startsWith('/admin/') || path === '/admin.html';
  if (!isApi && !isAdmin) return env.ASSETS.fetch(request);

  let response;
  try {
    if (isApi) response = await handleApi(request, env);
    else if (path === '/admin' || path === '/admin/') {
      if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'Method not allowed.');
      requireConfiguration(env, true);
      const session = await readSession(request, env);
      response = new Response(request.method === 'HEAD' ? null : adminPage(!!session), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } else throw new HttpError(404, 'Page not found.');
  } catch (error) {
    const known = error instanceof HttpError;
    // Never send exception details, SQL, request bodies or environment values to clients/logs.
    if (!known) {
      const passwordLimit = path === '/api/admin/login' && error instanceof Error &&
        /pbkdf2 failed: iteration counts above \d+ are not supported/i.test(error.message);
      console.error(passwordLimit ? 'Admin login failed: the runtime rejected the PBKDF2 iteration count.' : 'Review service request failed.');
    }
    response = Response.json({ error: known ? error.message : 'The review service is temporarily unavailable. Please try again later.' }, {
      status: known ? error.status : 503, headers: known ? error.headers : {}
    });
  }
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

export default { fetch };
