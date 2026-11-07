import { cookie, digest, keyedDigest, randomToken, readSession, sameOrigin, SESSION_SECONDS, validCsrf, validHash, verifyPassword } from './security.js';

const PUBLIC_FIELDS = 'id, client_name, rating, title, review_text, created_at';
const STATUSES = ['pending', 'approved', 'rejected'];

export class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers });
}

export function requireConfiguration(env, admin = false) {
  if (!env.REVIEWS_DB || (admin && (!validHash(env.ADMIN_PASSWORD_HASH) || !/^[a-f0-9]{64,}$/.test(env.SESSION_SECRET || '')))) {
    throw new HttpError(503, 'The review service is temporarily unavailable. Please try again later.');
  }
}

async function readJson(request) {
  if (!sameOrigin(request)) throw new HttpError(403, 'Please submit this form from this website.');
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    throw new HttpError(415, 'Please send JSON.');
  }
  if (Number(request.headers.get('Content-Length')) > 16384) throw new HttpError(413, 'The submission is too large.');
  // Stream limit also covers chunked requests and inaccurate Content-Length headers.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Please complete the form.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); throw new HttpError(413, 'The submission is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(400, 'The submission could not be read.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Please complete the form.');
  return data;
}

function textField(value, name, min, max) {
  if (typeof value !== 'string') throw new HttpError(400, `${name} is required.`);
  const text = value.trim();
  if (text.length < min || text.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new HttpError(400, `${name} must contain ${min}–${max} characters.`);
  }
  return text;
}

export async function rateLimit(request, env, scope, limit, seconds, global = false) {
  if (!/^[a-f0-9]{64,}$/.test(env.SESSION_SECRET || '')) throw new HttpError(503, 'The review service is temporarily unavailable.');
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / seconds);
  const expires = (bucket + 1) * seconds;
  // Cloudflare sets CF-Connecting-IP at the edge; ignore spoofable forwarding headers.
  const identity = global ? 'all' : request.headers.get('CF-Connecting-IP') || 'local';
  const key = `${scope}:${bucket}:${await keyedDigest(env.SESSION_SECRET, `${scope}:${identity}`)}`;
  const result = await env.REVIEWS_DB.prepare(`INSERT INTO rate_limits (key, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 WHERE attempts < ? RETURNING attempts`)
    .bind(key, expires, limit).first();
  if (!result) throw new HttpError(429, 'Too many attempts. Please try again later.', { 'Retry-After': String(expires - now) });
}

async function cleanup(env) {
  const now = Math.floor(Date.now() / 1000);
  await env.REVIEWS_DB.batch([
    env.REVIEWS_DB.prepare('DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at <= ? LIMIT 100)').bind(now),
    env.REVIEWS_DB.prepare('DELETE FROM admin_sessions WHERE token_hash IN (SELECT token_hash FROM admin_sessions WHERE expires_at <= ? LIMIT 100)').bind(now)
  ]);
}

function pagination(url, size) {
  const raw = url.searchParams.get('page') || '1';
  if (!/^[1-9]\d{0,5}$/.test(raw)) throw new HttpError(400, 'Choose a valid page.');
  const page = Number(raw);
  return { page, size, offset: (page - 1) * size };
}

async function publicReviews(url, env) {
  const { page, size, offset } = pagination(url, 12);
  const [reviews, ratings] = await env.REVIEWS_DB.batch([
    env.REVIEWS_DB.prepare(`SELECT ${PUBLIC_FIELDS} FROM reviews WHERE status = 'approved' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(size, offset),
    env.REVIEWS_DB.prepare("SELECT rating, COUNT(*) AS count FROM reviews WHERE status = 'approved' GROUP BY rating")
  ]);
  const distribution = [0, 0, 0, 0, 0];
  for (const row of ratings.results) distribution[row.rating - 1] = row.count;
  const total = distribution.reduce((a, b) => a + b, 0);
  const average = total ? distribution.reduce((sum, n, i) => sum + n * (i + 1), 0) / total : null;
  return json({ reviews: reviews.results, page, has_more: page * size < total, stats: { total, average, distribution } });
}

async function submitReview(request, env) {
  const data = await readJson(request);
  await cleanup(env);
  await rateLimit(request, env, 'submit', 5, 3600);
  if (typeof data.website !== 'string' || data.website.length > 0) {
    throw new HttpError(400, 'Your review could not be submitted. Please try again.');
  }
  const name = textField(data.client_name, 'Client name', 2, 80);
  const title = textField(data.title ?? '', 'Review title', 0, 120);
  const review = textField(data.review_text, 'Your review', 20, 3000);
  if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) throw new HttpError(400, 'Choose a rating from 1 to 5 stars.');
  if ((review.match(/https?:\/\//gi) || []).length > 2) throw new HttpError(400, 'Please remove links from your review.');
  if (typeof data.submission_key !== 'string' || !/^[a-f0-9-]{36}$/.test(data.submission_key)) throw new HttpError(400, 'Please refresh the page and try again.');
  const timestamp = new Date().toISOString();
  // Status is deliberately omitted: the database supplies pending even if the caller sends status.
  await env.REVIEWS_DB.prepare(`INSERT INTO reviews
    (id, client_name, rating, title, review_text, created_at, updated_at, submission_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(submission_key) DO NOTHING`)
    .bind(crypto.randomUUID(), name, data.rating, title, review, timestamp, timestamp, data.submission_key).run();
  return json({ message: 'Thank you for your review! Your feedback has been submitted and will be visible once it has been approved.' }, 202);
}

async function login(request, env) {
  const data = await readJson(request);
  await cleanup(env);
  await rateLimit(request, env, 'login', 5, 900);
  await rateLimit(request, env, 'login-global', 50, 900, true);
  if (!await verifyPassword(data.password, env.ADMIN_PASSWORD_HASH, env.SESSION_SECRET)) {
    throw new HttpError(401, 'The password is incorrect.');
  }
  const token = randomToken();
  const tokenHash = await digest(token);
  const csrf = await keyedDigest(env.SESSION_SECRET, `csrf:${tokenHash}`);
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const oldSession = await readSession(request, env);
  const statements = [env.REVIEWS_DB.prepare('INSERT INTO admin_sessions (token_hash, csrf_hash, credential_version, expires_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, await digest(csrf), await keyedDigest(env.SESSION_SECRET, env.ADMIN_PASSWORD_HASH), expires)];
  if (oldSession) statements.push(env.REVIEWS_DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(oldSession.token_hash));
  await env.REVIEWS_DB.batch(statements);
  return json({ csrf_token: csrf, expires_at: expires }, 200, { 'Set-Cookie': cookie(token) });
}

async function adminReviews(url, env) {
  const status = url.searchParams.get('status') || 'pending';
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Choose a valid review status.');
  const { page, size, offset } = pagination(url, 20);
  const [rows, counts] = await env.REVIEWS_DB.batch([
    env.REVIEWS_DB.prepare(`SELECT ${PUBLIC_FIELDS}, status, updated_at, moderated_at FROM reviews WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(status, size, offset),
    env.REVIEWS_DB.prepare('SELECT status, COUNT(*) AS count FROM reviews GROUP BY status')
  ]);
  const stats = { pending: 0, approved: 0, rejected: 0, total: 0 };
  for (const row of counts.results) { stats[row.status] = row.count; stats.total += row.count; }
  return json({ reviews: rows.results, stats, page, has_more: page * size < stats[status] });
}

export async function handleApi(request, env) {
  requireConfiguration(env);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  if (path === '/api/reviews') {
    if (request.method === 'GET') return publicReviews(url, env);
    if (request.method === 'POST') return submitReview(request, env);
    throw new HttpError(405, 'Method not allowed.', { Allow: 'GET, POST' });
  }
  if (!path.startsWith('/api/admin/')) throw new HttpError(404, 'Page not found.');
  requireConfiguration(env, true);
  if (path === '/api/admin/login' && request.method === 'POST') return login(request, env);
  const session = await readSession(request, env);
  if (!session) throw new HttpError(401, 'Please log in to manage reviews.');
  if (request.method !== 'GET' && !await validCsrf(request, session)) throw new HttpError(403, 'Your session could not be confirmed. Refresh the page and try again.');
  if (path === '/api/admin/session' && request.method === 'GET') {
    return json({ csrf_token: await keyedDigest(env.SESSION_SECRET, `csrf:${session.token_hash}`), expires_at: session.expires_at });
  }
  if (path === '/api/admin/logout' && request.method === 'POST') {
    await env.REVIEWS_DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(session.token_hash).run();
    return json({ message: 'You have been logged out.' }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (path === '/api/admin/reviews' && request.method === 'GET') return adminReviews(url, env);
  const match = path.match(/^\/api\/admin\/reviews\/([a-f0-9-]{36})$/);
  if (match && request.method === 'PATCH') {
    const data = await readJson(request);
    if (!STATUSES.includes(data.status) || !STATUSES.includes(data.expected_status)) throw new HttpError(400, 'Choose a valid review status.');
    const timestamp = new Date().toISOString();
    const result = await env.REVIEWS_DB.prepare('UPDATE reviews SET status = ?, updated_at = ?, moderated_at = ? WHERE id = ? AND status = ?')
      .bind(data.status, timestamp, timestamp, match[1], data.expected_status).run();
    if (!result.meta.changes) throw new HttpError(409, 'This review has changed. Refresh reviews and try again.');
    return json({ message: `Review moved to ${data.status}.` });
  }
  throw new HttpError(404, 'Page not found.');
}
