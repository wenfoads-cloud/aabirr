import { createClient } from '@supabase/supabase-js';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export const BUCKET = 'works';
export const db = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/* password hashing: scrypt$<salt hex>$<hash hex> */
export function hashPassword(pw) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(String(pw), salt, 32).toString('hex')}`;
}
function checkHash(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const want = Buffer.from(hashHex, 'hex');
  const got = scryptSync(String(pw), Buffer.from(saltHex, 'hex'), want.length);
  return want.length === got.length && timingSafeEqual(want, got);
}

/* Returns the teacher row if the password is right, otherwise null. */
export async function authTeacher(sb, teacherId, password) {
  if (typeof teacherId !== 'string' || typeof password !== 'string' || !password || password.length > 100) return null;
  const { data } = await sb.from('teachers').select('id,name,grades,password_hash').eq('id', teacherId).maybeSingle();
  const ok = data ? checkHash(password, data.password_hash) : false;
  if (!ok) await new Promise((r) => setTimeout(r, 700)); // slow down guessing
  return ok ? data : null;
}

export const publicUrl = (sb, path) => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/* wrap a handler: POST + JSON body + error handling */
export const post = (fn) => async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  try { return await fn(body, db()); }
  catch (e) { console.error(e); return json({ error: 'server' }, 500); }
};
export const unauthorized = () => json({ error: 'كلمة السر غير صحيحة' }, 401);
