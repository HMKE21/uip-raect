# بناء نسخة الأندرويد (APK)

المتطلبات: Node 20.19+ ، JDK 21 ، Android Studio (أو Android SDK).

```bash
npm install
npm run android:sync        # يبني نسخة الموبايل + يحدّث مجلد android + يضيف كود وضع الامتحان (scripts/patch-android.mjs)
npm run android:open        # يفتح Android Studio  ->  Build > Build APK(s)
```

أو من الـ terminal:

```bash
cd android
./gradlew assembleDebug     # الملف: android/app/build/outputs/apk/debug/app-debug.apk
```

## ما تم إصلاحه
- أيقونة التطبيق (عادية + adaptive) وشاشة بداية (Splash) بلوجو UIP، تختفي بعد أول رسم للصفحة.
- الصفحة لم تعد تُرسم تحت شريط الحالة وأزرار النظام (تم حذف `viewport-fit=cover` من بناء الموبايل فقط).
- اختفاء رابط "Skip to form" داخل التطبيق.
- زر الرجوع في أندرويد يرجع للصفحة السابقة، ويخرج من الصفحة الرئيسية.
- طلبات `/api` و `/uploads` بتروح مباشرة للسيرفر (`.env.native`) بدل ما تفشل داخل التطبيق.
- صلاحيات الكاميرا والميكروفون (الامتحانات والاجتماعات).

## وضع الامتحان في التطبيق (ملء الشاشة + تثبيت الشاشة)
أثناء محاولة امتحان شغّالة فقط:
- التطبيق يملأ الشاشة كلها (شريط الحالة وأزرار التنقل الثلاثة مخفية).
- تثبيت الشاشة (Screen pinning): زر Home و Recents يتعطلوا ولوحة الإشعارات متنزلش. أندرويد بيسأل الطالب مرة واحدة يوافق على التثبيت.
- لو الطالب فك التثبيت (ضغطة طويلة على Back + Overview) بتظهر شاشة "ملء الشاشة مطلوب"، وبتتسجل مخالفة لو الامتحان Secure Mode.
- الكود في `native/android/` (ExamLockPlugin.java + MainActivity.java) وبيتنسخ تلقائياً داخل `android/` عند `npm run android:sync`. لو شغّلت `cap sync` يدوياً شغّل `npm run android:patch` بعده.
- لازم تبني APK جديد بعد التحديث (Build > Build APK).

## لو غيّرت اللوجو
استبدل الملفات في `resources/` ثم `npm run android:icons` ثم `npm run android:sync`.
اللوجو الحالي 256px فقط؛ لو عندك نسخة أكبر (1024px) الأيقونة هتبقى أحدّ.

## عنوان السيرفر
غيّره في `.env.native` لو الـ API اتنقل.

## الدخول بحساب جوجل (Google Sign-In)
نفس الـ endpoints (`/api/v1/auth/google` و `/auth/google/complete`) بتخدم الموقع والـ APK. في الموقع بيظهر زرار جوجل الرسمي، وفي الـ APK بيفتح اختيار حسابات جوجل بتاع الموبايل (Credential Manager) عن طريق `@capgo/capacitor-social-login` — لأن جوجل بيمنع تسجيل الدخول جوه الـ WebView.

الإعداد (مرة واحدة) من [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)، في نفس الـ project:
1. **OAuth consent screen**: اختار External وضيف الـ scopes `email` و `profile` (وانشر التطبيق Publish عشان أي حساب يقدر يدخل).
2. اعمل **OAuth client ID** من نوع **Web application** → انسخ الـ Client ID وحطه في `.env` بتاع الـ API: `GOOGLE_CLIENT_IDS=xxxx.apps.googleusercontent.com`. الفرونت بيقراه من الـ API (`GET /api/v1/auth/google/config`) فمفيش متغير بيئة في الفرونت.
   - في الـ Web client ضيف **Authorized JavaScript origins** = دومين الموقع (و `http://localhost:5173` للتجربة).
3. اعمل **OAuth client ID** من نوع **Android**: Package name = `com.uip.platform` + **SHA-1** بتاع الشهادة اللي بتوقّع بيها الـ APK (`cd android && ./gradlew signingReport`). اعمل واحد لكل شهادة (debug وrelease). الـ Android client ده **مش** بيتحط في أي مكان في الكود — لازم يكون موجود في الـ project وبس.
4. `npm run android:sync` وابني APK جديد.

لو ظهر خطأ `[28444] Developer console is not set up correctly`: يبقى الـ SHA-1 أو الـ package name في الـ Android client مش مطابق للـ APK المتثبّت.
