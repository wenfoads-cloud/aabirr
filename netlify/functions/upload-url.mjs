import { randomUUID } from 'node:crypto';
import { post, authTeacher, json, unauthorized, BUCKET } from '../lib/common.mjs';

const TYPES = {
  photo: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic' },
  audio: { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
           'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/webm': 'webm' },
};

/* Step 1 of an upload: check the password, hand back a one-time signed upload URL. */
export default post(async (b, sb) => {
  if (!(await authTeacher(sb, b.teacher, b.password))) return unauthorized();
  const types = TYPES[b.kind];
  if (!types) return json({ error: 'نوع غير صحيح' }, 400);
  let ext = types[String(b.contentType).toLowerCase()];
  if (!ext) { // some phones send an empty type for audio; fall back to the file extension
    const e = String(b.name || '').split('.').pop().toLowerCase();
    if (Object.values(types).includes(e)) ext = e;
  }
  if (!ext) return json({ error: 'نوع الملف غير مدعوم' }, 400);
  const id = 'w' + randomUUID().replace(/-/g, '').slice(0, 16);
  const path = `${b.teacher}/${id}.${ext}`;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return json({ id, path, signedUrl: data.signedUrl });
});
export const config = { path: '/api/upload-url' };
