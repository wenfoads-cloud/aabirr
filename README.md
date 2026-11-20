# أعبر

موقع عرض أعمال الطالبات (صور وأصوات). الواجهة على Netlify، والبيانات والملفات في Supabase.
كلمات سر المعلمات تُفحص في دوال Netlify وتُحفظ مشفّرة (scrypt) في جدول `teachers`.

## الإعداد
1. **Supabase**: أنشئي مشروعًا، ثم شغّلي `supabase/schema.sql` في SQL Editor (ينشئ الجداول وحاوية الملفات `works`).
2. **Netlify**: اربطي المستودع، وأضيفي متغيرين في Site settings → Environment variables:
   `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` (من Supabase → Project Settings → API). مفتاح service_role سري، لا يوضع في الواجهة.
3. **كلمات السر للتجربة** (1111 / 2222 / 3333): من جهازك بعد `npm install`:
   `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run set-passwords`
4. **تغيير كلمة سر**: `npm run set-passwords -- t2 كلمة_جديدة` (t1 أسماء، t2 لطيفة، t3 وئام).
5. ضعي `logo.jpg` داخل مجلد `public/`.

## التشغيل محليًا
`cp .env.example .env` وعدّليه، ثم `npx netlify dev`.

## ملاحظات
- القراءة للجميع بدون دخول؛ الرفع والحذف يمرّان بكلمة سر المعلمة صاحبة العمل فقط (الخادم يتحقق).
- الرفع: الدالة تتحقق من كلمة السر وتُصدر رابط رفع مؤقتًا، ثم يرفع المتصفح الملف مباشرة إلى Supabase (حد 25MB).
