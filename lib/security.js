import { pbkdf2, timingSafeEqual } from 'node:crypto';

export const COOKIE = '__Host-layna_admin';
export const SESSION_SECONDS = 8 * 60 * 60;
// Hosted Workers rejects PBKDF2 iteration counts above 100,000.
export const ITERATIONS = 100_000;
const passwordFormat = `pbkdf2-sha256-peppered-v1$${ITERATIONS}$`;
export const ADMIN_PASSWORD_MIN_LENGTH = 8;
export const ADMIN_PASSWORD_MAX_LENGTH = 256;
const encoder = new TextEncoder();

export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export async function keyedDigest(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

async function derivePassword(password, salt, secret) {
  const peppered = await keyedDigest(secret, `layna:admin-password:v1\0${password}`);
  return new Promise((resolve, reject) => {
    pbkdf2(Buffer.from(peppered, 'hex'), salt, ITERATIONS, 32, 'sha256', (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password, secret) {
  const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(16)));
  const key = await derivePassword(password, salt, secret);
  return `${passwordFormat}${salt.toString('hex')}$${key.toString('hex')}`;
}

export function validHash(value) {
  return typeof value === 'string' && value.startsWith(passwordFormat) &&
    /^[a-f0-9]{32}\$[a-f0-9]{64}$/.test(value.slice(passwordFormat.length));
}

export function validPasswordLength(value) {
  return typeof value === 'string' && value.length >= ADMIN_PASSWORD_MIN_LENGTH && value.length <= ADMIN_PASSWORD_MAX_LENGTH;
}

export async function verifyPassword(password, stored, secret) {
  if (!validPasswordLength(password) || !validHash(stored)) return false;
  const [, , salt, hash] = stored.split('$');
  const actual = await derivePassword(password, Buffer.from(salt, 'hex'), secret);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

export function cookie(value, maxAge = SESSION_SECONDS) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function readSession(request, env) {
  const token = (request.headers.get('Cookie') || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return env.REVIEWS_DB.prepare(`SELECT token_hash, csrf_hash, expires_at FROM admin_sessions
    WHERE token_hash = ? AND expires_at > ? AND credential_version = ?`)
    .bind(await digest(token), Math.floor(Date.now() / 1000), await keyedDigest(env.SESSION_SECRET, env.ADMIN_PASSWORD_HASH)).first();
}

export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return origin === new URL(request.url).origin && request.headers.get('Sec-Fetch-Site') !== 'cross-site';
}

export async function validCsrf(request, session) {
  const token = request.headers.get('X-CSRF-Token');
  return sameOrigin(request) && !!token && token.length === 64 && await digest(token) === session.csrf_hash;
}
