# نظام الخزرجي — الربط Online

هذه حزمة Backend جاهزة للرفع إلى GitHub ثم النشر على استضافة Node.js.

## التشغيل
npm install
npm start

## الحساب الأول
Username: admin
Password: ChangeMe_Immediately_123!

يجب تغيير كلمة المرور قبل الاستخدام الحقيقي.

## API
GET /api/health
POST /api/auth/login
POST /api/sync/push
GET /api/sync/pull?after=0
GET /api/audit

`online-sync.js` هو ملف الربط الذي يوضع مع الواجهة الحالية.

في الإنتاج يجب ضبط `JWT_SECRET` قوياً واستخدام HTTPS وقاعدة PostgreSQL/نسخ احتياطية.
