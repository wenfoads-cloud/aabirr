import { post, authTeacher, json, unauthorized } from '../lib/common.mjs';

export default post(async (b, sb) => {
  const t = await authTeacher(sb, b.teacher, b.password);
  return t ? json({ ok: true }) : unauthorized();
});
export const config = { path: '/api/verify' };
