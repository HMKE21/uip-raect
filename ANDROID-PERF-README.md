# تخفيف الـ APK وإزالة الهنج

الملفات المعدّلة (انسخها بنفس المسار): `vite.config.js`, `package.json`, `src/native.js`, `src/lib/motionPolicy.js`, `src/styles/css/native.css`, وملف جديد `scripts/slim-native.mjs`.

- الأنيميشن الزخرفية متقفلة داخل الـ APK (فيه 114 أنيميشن infinite كانت بتخلي الـ WebView يعيد الرسم طول الوقت).
- خطوط Google بقت بتتحمّل بعد أول رسم بدل ما تعطّل ظهور الصفحة.
- `SLIM_NATIVE=1 npm run android:sync` يشيل OCR وموديل ضبابية الخلفية (~28MB) من الـ APK. الميزتين دول يقفلوا في الـ APK فقط.
- بعد النسخ: `npm run android:sync` وابني APK جديد (Release مش Debug).
