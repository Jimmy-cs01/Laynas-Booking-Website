import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { hashPassword, digest, keyedDigest, validHash, verifyPassword, COOKIE, ITERATIONS } from '../lib/security.js';

const origin = 'https://salon.test';
const password = randomBytes(4).toString('hex');
const secret = randomBytes(32).toString('hex');
let mf, db, hash;
let address = 0;

before(async () => {
  await mkdir('.test-output', { recursive: true });
  const build = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', 'wrangler.local.jsonc', '--dry-run', '--outdir', '.test-output/worker'], {
    encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: '.test-output/wrangler.log' }
  });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  hash = await hashPassword(password, secret);
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'reviews',
    modules: true,
    scriptPath: '.test-output/worker/worker.js',
    compatibilityDate: '2026-11-06', compatibilityFlags: ['nodejs_compat'],
    bindings: { ADMIN_PASSWORD_HASH: hash, SESSION_SECRET: secret },
    d1Databases: { REVIEWS_DB: 'test-reviews' }
  }] }));
  db = await mf.getD1Database('REVIEWS_DB');
  const sql = (await readFile('migrations/0001_reviews.sql', 'utf8')).replace(/^--.*$/gm, '');
  for (const statement of sql.split(';').filter(s => s.trim())) await db.prepare(statement).run();
});
after(async () => { await mf?.dispose(); });

async function request(path, { method = 'GET', body, cookie, csrf, ip, originHeader = origin, headers = {} } = {}) {
  const result = await mf.dispatchFetch(origin + path, { method, headers: {
    'Origin': originHeader, 'CF-Connecting-IP': ip || `192.0.2.${++address}`,
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers
  }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  return result;
}

function review(overrides = {}) {
  return { client_name: 'Local test client', rating: 5, title: 'Local test', review_text: 'This is a synthetic review used only in automated local tests.', website: '', submission_key: randomUUID(), ...overrides };
}
async function login() {
  const response = await request('/api/admin/login', { method: 'POST', body: { password } });
  assert.equal(response.status, 200, await response.clone().text());
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: (await response.json()).csrf_token, response };
}
async function insert(status, rating = 5, created = new Date().toISOString()) {
  const id = randomUUID();
  await db.prepare('INSERT INTO reviews (id, client_name, rating, title, review_text, status, created_at, updated_at, submission_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, 'Synthetic client', rating, 'Synthetic title', 'A synthetic review for local testing purposes only.', status, created, created, randomUUID()).run();
  return id;
}
async function clear() { await db.prepare('DELETE FROM reviews').run(); await db.prepare('DELETE FROM rate_limits').run(); }

test('existing pages and booking integration are preserved; private files are not published', async () => {
  const html = await readFile('dist/services.html', 'utf8');
  assert.equal((html.match(/class="service-row"/g) || []).length, 31);
  const square = 'https://app.squareup.com/appointments/buyer/widget/ilxxm8exqeyrdu/LBKGD7WKE51YD';
  for (const file of ['index', 'about', 'portfolio', 'services', 'policies', 'reviews']) {
    const source = await readFile(`dist/${file}.html`, 'utf8');
    assert.ok(source.includes(square), `${file} Square booking link`);
    assert.ok(source.includes('href="/reviews"'), `${file} Reviews link`);
  }
  const files = await readdir('dist');
  for (const privateFile of ['lib', 'worker.js', '.dev.vars', 'wrangler.local.jsonc', 'migrations', 'admin.html', 'package.json', 'tests']) assert.ok(!files.includes(privateFile));
  assert.ok(!(await readdir('dist/images')).includes('insert.py'));
  const css = await readFile('dist/style.css', 'utf8');
  assert.match(css, /@media \(max-width: 1100px\)/);
});

test('valid submission is pending, ignores supplied status, and supports idempotent retry', async () => {
  await clear();
  const body = review({ status: 'approved' });
  for (let i = 0; i < 2; i++) {
    const response = await request('/api/reviews', { method: 'POST', body });
    assert.equal(response.status, 202);
    assert.match((await response.json()).message, /once it has been approved/);
  }
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM reviews').first()).count, 1);
  assert.equal((await db.prepare('SELECT status FROM reviews').first()).status, 'pending');
  const data = await (await request('/api/reviews')).json();
  assert.deepEqual(data.reviews, []);
  assert.deepEqual(data.stats, { total: 0, average: null, distribution: [0, 0, 0, 0, 0] });
});

test('server validation, spam controls, origin checks and request size limits reject invalid input', async () => {
  for (const fields of [{ client_name: '' }, { client_name: 'x'.repeat(81) }, { rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: '5' }, { review_text: 'Too short' }, { review_text: 'x'.repeat(3001) }, { title: 'x'.repeat(121) }, { website: 'spam.example' }, { website: undefined }, { submission_key: 'bad' }, { review_text: 'https://a.test https://b.test https://c.test' }]) {
    const response = await request('/api/reviews', { method: 'POST', body: review(fields) });
    assert.equal(response.status, 400, JSON.stringify(fields).slice(0, 120));
  }
  assert.equal((await request('/api/reviews', { method: 'POST', body: review(), originHeader: 'https://evil.test' })).status, 403);
  assert.equal((await request('/api/reviews', { method: 'POST', body: review({ review_text: 'x'.repeat(20000) }) })).status, 413);
  assert.equal((await request('/api/reviews', { method: 'POST', body: review(), headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await mf.dispatchFetch(origin + '/api/reviews', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
});

test('database constraints reject invalid ratings, lengths, and moderation states', async () => {
  await clear();
  const id = await insert('pending');
  for (const [column, value] of [['rating', 0], ['rating', 2.5], ['status', 'published'], ['client_name', ''], ['review_text', 'short'], ['title', 'x'.repeat(121)]]) {
    await assert.rejects(db.prepare(`UPDATE reviews SET ${column} = ? WHERE id = ?`).bind(value, id).run());
  }
});

test('public list and rating statistics include approved reviews only, newest first, with pagination', async () => {
  await clear();
  await insert('pending', 1); await insert('rejected', 1);
  for (let i = 0; i < 13; i++) await insert('approved', i === 0 ? 1 : 5, new Date(Date.UTC(2026, 0, i + 1)).toISOString());
  const firstResponse = await request('/api/reviews');
  assert.match(firstResponse.headers.get('cache-control'), /no-store/);
  const first = await firstResponse.json();
  assert.equal(first.stats.total, 13);
  assert.equal(first.stats.average, 61 / 13);
  assert.deepEqual(first.stats.distribution, [1, 0, 0, 0, 12]);
  assert.equal(first.reviews.length, 12); assert.equal(first.has_more, true);
  assert.equal(first.reviews[0].created_at, new Date(Date.UTC(2026, 0, 13)).toISOString());
  assert.ok(!('submission_key' in first.reviews[0])); assert.ok(!('status' in first.reviews[0]));
  const second = await (await request('/api/reviews?page=2')).json();
  assert.equal(second.reviews.length, 1); assert.equal(second.has_more, false);
  assert.equal((await request('/api/reviews?page=-1')).status, 400);
  assert.equal((await (await request('/api/reviews?status=pending')).json()).stats.total, 13);
});

test('submission rate limit is atomic across concurrent requests and stores no raw IP', async () => {
  await clear();
  const ip = '198.51.100.10';
  const responses = await Promise.all(Array.from({ length: 9 }, () => request('/api/reviews', { method: 'POST', body: review(), ip })));
  assert.equal(responses.filter(r => r.status === 202).length, 5);
  assert.equal(responses.filter(r => r.status === 429).length, 4);
  assert.ok(Number(responses.find(r => r.status === 429).headers.get('retry-after')) > 0);
  const limits = (await db.prepare('SELECT key FROM rate_limits').all()).results;
  assert.ok(limits.every(row => !row.key.includes(ip)));
});

test('admin page serves login only until authenticated; every private endpoint rejects anonymous requests', async () => {
  const page = await request('/admin');
  const html = await page.text();
  assert.match(html, /id="login-form"/); assert.doesNotMatch(html, /id="dashboard"/);
  assert.match(html, /<form id="login-form" method="post"/);
  assert.match(html, /minlength="8" maxlength="256"/);
  assert.match(page.headers.get('cache-control'), /no-store/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  for (const [path, method] of [['/api/admin/session', 'GET'], ['/api/admin/reviews?status=pending', 'GET'], ['/api/admin/logout', 'POST'], [`/api/admin/reviews/${randomUUID()}`, 'PATCH']]) {
    assert.equal((await request(path, { method, body: method === 'PATCH' ? { status: 'approved' } : undefined })).status, 401);
  }
  assert.equal((await request('/admin.html')).status, 404);
});

test('incorrect passwords and cross-site logins fail, with per-IP and global login limits', async () => {
  await clear();
  for (let i = 0; i < 5; i++) assert.equal((await request('/api/admin/login', { method: 'POST', body: { password: 'incorrect' }, ip: '198.51.100.20' })).status, 401);
  assert.equal((await request('/api/admin/login', { method: 'POST', body: { password }, ip: '198.51.100.20' })).status, 429);
  assert.equal((await request('/api/admin/login', { method: 'POST', body: { password }, originHeader: 'https://evil.test' })).status, 403);
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / 900);
  const key = `login-global:${bucket}:${await keyedDigest(secret, 'login-global:all')}`;
  await db.prepare('INSERT OR REPLACE INTO rate_limits (key, attempts, expires_at) VALUES (?, 50, ?)').bind(key, (bucket + 1) * 900).run();
  assert.equal((await request('/api/admin/login', { method: 'POST', body: { password } })).status, 429);
});

test('password verification enforces the 8–256 character range even for matching hashes', async () => {
  for (const [length, accepted] of [[7, false], [8, true], [256, true], [257, false]]) {
    const candidate = 'a'.repeat(length);
    assert.equal(await verifyPassword(candidate, await hashPassword(candidate, secret), secret), accepted);
  }
});

test('password hashes use the hosted PBKDF2 ceiling and require the matching secret', async () => {
  assert.equal(ITERATIONS, 100_000);
  assert.equal(validHash(hash), true);
  assert.ok(hash.startsWith('pbkdf2-sha256-peppered-v1$100000$'));
  assert.ok(hash !== await hashPassword(password, secret));
  assert.equal(await verifyPassword(password, hash, randomBytes(32).toString('hex')), false);
  const [, , salt, key] = hash.split('$');
  for (const incompatible of [
    `pbkdf2-sha256-peppered-v1$100001$${salt}$${key}`,
    `pbkdf2-sha256$600000$${salt}$${key}`
  ]) {
    assert.equal(validHash(incompatible), false);
    assert.equal(await verifyPassword(password, incompatible, secret), false);
  }
});

test('eight-character password works inside workerd, creates secure expiring opaque session, and validates CSRF', async () => {
  await clear();
  const session = await login();
  const setCookie = session.response.headers.get('set-cookie');
  for (const flag of [COOKIE, 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) assert.ok(setCookie.includes(flag));
  const stored = await db.prepare('SELECT * FROM admin_sessions WHERE token_hash = ?').bind(await digest(session.cookie.split('=')[1])).first();
  assert.ok(stored); assert.notEqual(stored.token_hash, session.cookie.split('=')[1]);
  assert.ok(stored.expires_at > Date.now() / 1000);
  const data = await (await request('/api/admin/session', session)).json();
  assert.equal(data.csrf_token, session.csrf);
  const page = await request('/admin', session); assert.match(await page.text(), /id="dashboard"/);
  assert.equal((await request('/api/admin/logout', { method: 'POST', cookie: session.cookie })).status, 403);
  assert.equal((await request('/api/admin/logout', { ...session, method: 'POST', csrf: 'x'.repeat(64) })).status, 403);
  assert.equal((await request('/api/admin/logout', { ...session, method: 'POST', originHeader: 'https://evil.test' })).status, 403);
});

test('admin can approve, reject, and restore; public results and summaries update immediately', async () => {
  await clear();
  const id = await insert('pending', 4);
  const session = await login();
  let expected = 'pending';
  for (const status of ['approved', 'rejected', 'pending', 'rejected', 'approved']) {
    const response = await request(`/api/admin/reviews/${id}`, { ...session, method: 'PATCH', body: { status, expected_status: expected } });
    assert.equal(response.status, 200);
    const publicData = await (await request('/api/reviews')).json();
    assert.equal(publicData.stats.total, status === 'approved' ? 1 : 0);
    assert.equal(publicData.reviews.length, status === 'approved' ? 1 : 0);
    const privateData = await (await request(`/api/admin/reviews?status=${status}`, session)).json();
    assert.equal(privateData.stats[status], 1); assert.equal(privateData.stats.total, 1);
    assert.equal(privateData.reviews[0].id, id);
    assert.ok(privateData.reviews[0].moderated_at);
    expected = status;
  }
  assert.equal((await request(`/api/admin/reviews/${id}`, { ...session, method: 'PATCH', body: { status: 'rejected', expected_status: 'pending' } })).status, 409);
  assert.equal((await request(`/api/admin/reviews/${id}`, { ...session, method: 'PATCH', body: { status: 'deleted', expected_status: 'approved' } })).status, 400);
  assert.equal((await request('/api/admin/reviews?status=invalid', session)).status, 400);
});

test('expired sessions, tampered cookies, credential rotation and logout invalidate access', async () => {
  await clear();
  const expired = await login();
  await db.prepare('UPDATE admin_sessions SET expires_at = 1 WHERE token_hash = ?').bind(await digest(expired.cookie.split('=')[1])).run();
  assert.equal((await request('/api/admin/session', expired)).status, 401);
  assert.equal((await request('/api/admin/session', { cookie: `${COOKIE}=${'a'.repeat(64)}` })).status, 401);
  const rotated = await login();
  await db.prepare('UPDATE admin_sessions SET credential_version = ? WHERE token_hash = ?').bind('old-credential', await digest(rotated.cookie.split('=')[1])).run();
  assert.equal((await request('/api/admin/session', rotated)).status, 401);
  const session = await login();
  const response = await request('/api/admin/logout', { ...session, method: 'POST' });
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await request('/api/admin/session', session)).status, 401);
});

test('admin lists paginate each status and reauthentication rotates the previous session', async () => {
  await clear();
  for (let i = 0; i < 21; i++) await insert('pending');
  await insert('approved'); await insert('rejected');
  const session = await login();
  const first = await (await request('/api/admin/reviews?status=pending', session)).json();
  assert.equal(first.reviews.length, 20); assert.equal(first.has_more, true);
  assert.deepEqual(first.stats, { pending: 21, approved: 1, rejected: 1, total: 23 });
  assert.ok(!('submission_key' in first.reviews[0]));
  const second = await (await request('/api/admin/reviews?status=pending&page=2', session)).json();
  assert.equal(second.reviews.length, 1); assert.equal(second.has_more, false);
  assert.ok(!first.reviews.some(row => row.id === second.reviews[0].id));
  const response = await request('/api/admin/login', { cookie: session.cookie, method: 'POST', body: { password } });
  assert.equal(response.status, 200);
  assert.notEqual(response.headers.get('set-cookie').split(';')[0], session.cookie);
  assert.equal((await request('/api/admin/session', session)).status, 401);
});

test('HTML and SQL-shaped content stays data and internal failures do not expose details', async () => {
  await clear();
  const payload = review({ client_name: "Robert'); DROP TABLE reviews;--", title: '<img src=x onerror=alert(1)>', review_text: '<script>alert("synthetic local test")</script>' });
  assert.equal((await request('/api/reviews', { method: 'POST', body: payload })).status, 202);
  await db.prepare("UPDATE reviews SET status = 'approved'").run();
  const data = await (await request('/api/reviews')).json();
  assert.equal(data.reviews[0].title, payload.title);
  const renderer = await readFile('assets/shared.js', 'utf8');
  assert.match(renderer, /node.textContent = text/); assert.doesNotMatch(renderer, /innerHTML/);
  await db.prepare('DROP TABLE reviews').run();
  const response = await request('/api/reviews');
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /SQL|SELECT|table|credential|stack/i);
});
