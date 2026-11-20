import { db, json, publicUrl } from '../lib/common.mjs';

export default async () => {
  try {
    const sb = db();
    const { data, error } = await sb
      .from('works')
      .select('id,teacher_id,grade,kind,student,path,created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    return json({
      works: data.map((w) => ({
        id: w.id, teacher: w.teacher_id, grade: w.grade, kind: w.kind, student: w.student,
        url: publicUrl(sb, w.path), createdAt: Date.parse(w.created_at),
      })),
    });
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
};
export const config = { path: '/api/works' };
