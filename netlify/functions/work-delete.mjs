import { post, authTeacher, json, unauthorized, BUCKET } from '../lib/common.mjs';

/* Only the teacher who owns the work (and knows her password) can delete it. */
export default post(async (b, sb) => {
  const { data: w } = await sb.from('works').select('id,teacher_id,path').eq('id', String(b.id)).maybeSingle();
  if (!w) return json({ error: 'غير موجود' }, 404);
  if (!(await authTeacher(sb, w.teacher_id, b.password))) return unauthorized();
  await sb.storage.from(BUCKET).remove([w.path]);
  const { error } = await sb.from('works').delete().eq('id', w.id);
  if (error) throw error;
  return json({ ok: true });
});
export const config = { path: '/api/work-delete' };
