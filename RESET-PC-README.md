# إعادة تهيئة الجهاز (Settings ▸ النظام ▸ إعادة تهيئة الجهاز)

React (انسخ فوق uip-raect): src/desktop/{apps.jsx,desktopApi.js,mac.css} + src/lib/wipeLocalData.js
Laravel (انسخ فوق uip-laravel): routes/api.php + app/Http/Controllers/Api/DesktopSettingsApiController.php + app/Services/DriveService.php
مفيش migration.

Endpoint جديد: POST /api/v1/desktop/reset  { confirm: "RESET", account_password }  (throttle 5/دقيقة، الغلط بيتحسب في OtpGuard)
بيمسح نهائيًا: كل ملفات "جهازي" + السلة + النسخ القديمة + روابط المشاركة + إعدادات سطح المكتب + الويدجت + صورة الخلفية + باسورد القفل.
الحساب والجلسة بيفضلوا. بعدها الواجهة بتمسح بيانات المتصفح المحلية (من غير تسجيل خروج) وتعمل reload.
