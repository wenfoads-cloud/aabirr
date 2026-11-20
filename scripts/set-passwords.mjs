// Sets/changes teacher passwords (stored hashed). Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
//   node scripts/set-passwords.mjs                # test passwords: t1=1111 t2=2222 t3=3333
//   node scripts/set-passwords.mjs t2 newSecret   # change one teacher
import { db, hashPassword } from '../netlify/lib/common.mjs';

const args = process.argv.slice(2);
const list = args.length ? [[args[0], args[1]]] : [['t1', '1111'], ['t2', '2222'], ['t3', '3333']];
const sb = db();
for (const [id, pw] of list) {
  if (!pw) { console.error('usage: node scripts/set-passwords.mjs <t1|t2|t3> <new password>'); process.exit(1); }
  const { data, error } = await sb.from('teachers').update({ password_hash: hashPassword(pw) }).eq('id', id).select('id');
  if (error || !data.length) { console.error('failed for', id, error?.message || 'no such teacher'); process.exit(1); }
  console.log('updated', id);
}
