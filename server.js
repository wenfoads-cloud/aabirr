// أعبر - سيرفر واحد بدون أي مكتبات: صفحات + قاعدة بيانات SQLite + ملفات على القرص.
import http from 'node:http';
import { createWriteStream, createReadStream, mkdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const PORT = Number(process.env.PORT || 3000);
const MAX_BYTES = 25 * 1024 * 1024;
mkdirSync(UPLOADS, { recursive: true });

const db = new DatabaseSync(path.join(DATA, 'aabir.db'));
db.exec(`
  create table if not exists teachers (id text primary key, name text not null, grades text not null, password_hash text not null);
  create table if not exists works (
    id text primary key, teacher_id text not null references teachers(id), grade text not null,
    kind text not null, student text not null, file text not null, created_at integer not null);
`);

/* ---- passwords: scrypt$salt$hash ---- */
const hashPw = (pw) => { const s = randomBytes(16); return `scrypt$${s.toString('hex')}$${scryptSync(String(pw), s, 32).toString('hex')}`; };
function checkPw(pw, stored) {
  const [a, s, h] = String(stored).split('$'); if (a !== 'scrypt' || !s || !h) return false;
  const want = Buffer.from(h, 'hex'), got = scryptSync(String(pw), Buffer.from(s, 'hex'), want.length);
  return timingSafeEqual(want, got);
}

/* ---- first run: create the 3 teachers with test passwords ---- */
const SEED = [['t1', 'أسماء الفلاج', '5', '1111'], ['t2', 'لطيفة الشمري', '3,4', '2222'], ['t3', 'وئام الوشيل', '3', '3333']];
if (!db.prepare('select count(*) n from teachers').get().n) {
  for (const [id, name, grades, pw] of SEED)
    db.prepare('insert into teachers values (?,?,?,?)').run(id, name, grades, hashPw(pw));
  console.log('تم إنشاء المعلمات بكلمات السر التجريبية 1111 / 2222 / 3333');
}

/* ---- command line: node server.js set-password t2 newpass ---- */
if (process.argv[2] === 'set-password') {
  const [, , , id, pw] = process.argv;
  if (!id || !pw) { console.log('الاستخدام: node server.js set-password t1|t2|t3 كلمة_السر_الجديدة'); process.exit(1); }
  const r = db.prepare('update teachers set password_hash=? where id=?').run(hashPw(pw), id);
  console.log(r.changes ? 'تم تغيير كلمة السر' : 'المعلمة غير موجودة'); process.exit(r.changes ? 0 : 1);
}

/* ---- helpers ---- */
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readJson = (req) => new Promise((ok, no) => {
  let b = ''; req.on('data', (c) => { b += c; if (b.length > 20000) { req.destroy(); no(new Error('big')); } });
  req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } });
});

/* slow down password guessing: 10 wrong tries per 10 minutes per IP */
const fails = new Map();
const blocked = (ip) => { const f = fails.get(ip); return f && f.reset > Date.now() && f.n >= 10; };
const fail = (ip) => { const f = fails.get(ip); if (!f || f.reset < Date.now()) fails.set(ip, { n: 1, reset: Date.now() + 600000 }); else f.n++; };
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();

function auth(req, res, teacherId, pw) {
  const ip = clientIp(req);
  if (blocked(ip)) { send(res, 429, { error: 'محاولات كثيرة' }); return null; }
  const t = db.prepare('select * from teachers where id=?').get(String(teacherId));
  if (!t || !pw || String(pw).length > 100 || !checkPw(pw, t.password_hash)) { fail(ip); send(res, 401, { error: 'كلمة السر غير صحيحة' }); return null; }
  return t;
}

const EXT = {
  photo: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic' },
  audio: { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/wav': 'wav',
           'audio/x-wav': 'wav', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/webm': 'webm' },
};
const MIME = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.webm': 'audio/webm', '.ico': 'image/x-icon' };

function serveFile(req, res, file, cache) {
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  const size = statSync(file).size, type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' };
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');   // lets audio seek on phones
  if (m) {
    const s = m[1] ? +m[1] : Math.max(0, size - +m[2]), e = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (s > e || s >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...h, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Content-Length': e - s + 1 });
    return createReadStream(file, { start: s, end: e }).pipe(res);
  }
  res.writeHead(200, { ...h, 'Content-Length': size });
  createReadStream(file).pipe(res);
}

/* ---- routes ---- */
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname;

    if (req.method === 'GET' && p === '/api/works') {
      const rows = db.prepare('select * from works order by created_at desc limit 2000').all();
      return send(res, 200, { works: rows.map((w) => ({ id: w.id, teacher: w.teacher_id, grade: w.grade, kind: w.kind,
        student: w.student, url: '/files/' + w.file, createdAt: w.created_at })) });
    }

    if (req.method === 'POST' && p === '/api/verify') {
      const b = await readJson(req);
      return auth(req, res, b.teacher, b.password) && send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && p === '/api/upload') {
      // the file is the body; details come in headers
      const h = req.headers, teacher = h['x-teacher'], pw = decodeURIComponent(h['x-password'] || '');
      const t = auth(req, res, teacher, pw); if (!t) return req.resume();
      const kind = h['x-kind'], grade = String(h['x-grade']), student = decodeURIComponent(h['x-student'] || '').trim().slice(0, 40);
      const type = String(h['content-type'] || '').split(';')[0].toLowerCase();
      let ext = (EXT[kind] || {})[type];
      if (!ext && EXT[kind]) { const e = decodeURIComponent(h['x-filename'] || '').split('.').pop().toLowerCase(); if (Object.values(EXT[kind]).includes(e)) ext = e; }
      const bad = !EXT[kind] ? 'نوع غير صحيح' : !ext ? 'نوع الملف غير مدعوم' : !student ? 'اكتبي اسم الطالبة'
        : !t.grades.split(',').includes(grade) ? 'صف غير مسموح لهذه المعلمة' : +h['content-length'] > MAX_BYTES ? 'الملف كبير جدًا' : '';
      if (bad) { req.resume(); return send(res, 400, { error: bad }); }
      const id = 'w' + randomBytes(8).toString('hex'), file = `${id}.${ext}`, full = path.join(UPLOADS, file);
      let size = 0; const out = createWriteStream(full);
      req.on('data', (c) => { size += c.length; if (size > MAX_BYTES) req.destroy(); });
      try { await pipeline(req, out); } catch { try { unlinkSync(full); } catch {} return send(res, 413, { error: 'تعذّر رفع الملف' }); }
      db.prepare('insert into works values (?,?,?,?,?,?,?)').run(id, t.id, grade, kind, student, file, Date.now());
      return send(res, 200, { ok: true, id });
    }

    if (req.method === 'POST' && p === '/api/delete') {
      const b = await readJson(req);
      const w = db.prepare('select * from works where id=?').get(String(b.id));
      if (!w) return send(res, 404, { error: 'غير موجود' });
      if (!auth(req, res, w.teacher_id, b.password)) return;   // only the owner teacher
      db.prepare('delete from works where id=?').run(w.id);
      try { unlinkSync(path.join(UPLOADS, w.file)); } catch {}
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && p.startsWith('/files/')) {
      const name = path.basename(decodeURIComponent(p.slice(7)));
      return serveFile(req, res, path.join(UPLOADS, name), 'public, max-age=31536000, immutable');
    }

    if (req.method === 'GET') {
      const name = p === '/' ? 'index.html' : path.basename(p);
      return serveFile(req, res, path.join(ROOT, 'public', name), 'no-cache');
    }
    res.writeHead(405); res.end();
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'server' }); }
}).listen(PORT, () => console.log(`أعبر شغّال على http://localhost:${PORT}`));
