import { post, authTeacher, json, unauthorized, BUCKET } from '../lib/common.mjs';

/* Step 2: after the browser uploaded the file, record it in the database. */
export default post(async (b, sb) => {
  const t = await authTeacher(sb, b.teacher, b.password);
  if (!t) return unauthorized();
  const student = String(b.student || '').trim().slice(0, 40);
  if (!student) return json({ error: 'اكتبي اسم الطالبة' }, 400);
  if (!t.grades.includes(String(b.grade))) return json({ error: 'صف غير مسموح لهذه المعلمة' }, 400);
  if (!['photo', 'audio'].includes(b.kind)) return json({ error: 'نوع غير صحيح' }, 400);
  const path = String(b.path || '');
  if (!/^[a-z0-9]+\/w[a-f0-9]{16}\.[a-z0-9]{2,5}$/.test(path) || !path.startsWith(`${t.id}/${b.id}.`)) {
    return json({ error: 'مسار غير صحيح' }, 400);
  }
  const { data: files } = await sb.storage.from(BUCKET).list(t.id, { search: path.split('/')[1] });
  if (!files || !files.length) return json({ error: 'لم يتم العثور على الملف' }, 400);
  const { error } = await sb.from('works').insert({
    id: b.id, teacher_id: t.id, grade: String(b.grade), kind: b.kind, student, path,
  });
  if (error) throw error;
  return json({ ok: true });
});
export const config = { path: '/api/work-create' };
