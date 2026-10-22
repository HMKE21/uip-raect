# تحديث: أمان إعادة التهيئة (نسخة احتياطية + قفل الامتحان + مهلة تراجع 24 ساعة)

## Laravel (انسخ فوق uip-laravel) — فيه migration جديدة: php artisan migrate
- جديد: database/migrations/2026_12_30_100000_create_desktop_resets_table.php
- جديد: app/Services/DesktopResetService.php · app/Console/Commands/DrivePurgeResets.php
- معدّل: routes/api.php · routes/console.php (drive:purge-resets كل ساعة — لازم الـ scheduler شغال) · DesktopSettingsApiController · DriveApiController · DriveService
Endpoints: GET /desktop/reset (الحالة + exam_active) · POST /desktop/reset · POST /desktop/reset/undo · GET /drive/archive-all (ZIP لكل الملفات)

## React (انسخ فوق uip-raect)
- جديد: src/desktop/ResetUndoBar.jsx
- معدّل: src/desktop/{apps.jsx, DesktopOS.jsx, desktopApi.js, mac.css} · src/lib/driveApi.js

## السلوك
1) زرار "نزّل نسخة ZIP من كل ملفاتي" جوه تحذير إعادة التهيئة (لو الملفات أكبر من DRIVE_MAX_ZIP_MB بيطلع خطأ واضح).
2) امتحان شغّال => إعادة التهيئة مقفولة (409 من السيرفر + الزرار متعطل)، و"خروج ومسح بياناتي" بيختفي من حوار الخروج.
3) الملفات بتروح السلة 24 ساعة وبعدها مسح نهائي. "تراجع" بيرجّع الملفات + الإعدادات + الويدجت + باسورد القفل. شريط تذكير بيظهر على السطح.
   إعادة تهيئة تانية وفيه مهلة شغالة = المهلة القديمة بتتقفل ومسحها بيبقى نهائي.
