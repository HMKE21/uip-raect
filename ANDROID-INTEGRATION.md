# تعديلات الأندرويد على مشروع الويب — أماكنها

كل تعديل جوه ملف موجود متعلّم بـ `[ANDROID]` (ابحث عنه). الباقي ملفات جديدة منفصلة ومش بتأثر على الويب
(`isNative` بيرجع false في المتصفح فكل حاجة no-op).

## ملفات جديدة (مفيش فيها كود ويب)
- `src/native.js` · `src/hooks/useNativeExamLock.js` · `src/components/StaffAccessButton.jsx`
- `src/styles/css/native.css` (كله تحت `html.is-native`) · `src/styles/css/exam-mobile.css` (تحت `.app-shell--exam-lock` فقط)
- `native/android/*.java` · `scripts/patch-android.mjs` · `resources/` · `android/` · `capacitor.config.ts` · `.env.native`

## سطور اتضافت جوه ملفات موجودة
| الملف | التعديل |
|---|---|
| `src/main.jsx` | import + `initNative()` + `hideSplash` (3 أماكن) |
| `src/styles/index.css` | سطرين `@import` في الآخر |
| `src/pages/Login.jsx` | import + `<StaffAccessButton />` |
| `src/components/Topbar.jsx` | import + `nativeNotify(...)` جوه if الصوت |
| `src/pages/student/StudentExamAttempt.jsx` | import (2) + `useNativeExamLock` + فرع `isNative` في `handleEnterSecureMode` + `fullscreenOk` |
| `vite.config.js` | `nativeHtml` plugin (بيشتغل فقط مع `--mode native`) |
| `package.json` | scripts `android:*` + مكتبات `@capacitor/*` |
| `.gitignore` | `!.env.native` |

## لما تخلّص تطوير وتبني APK
```bash
npm install
npm run android:sync     # build native + cap sync + patch (كود وضع الامتحان + صلاحيات الـ manifest)
npm run android:open     # Android Studio -> Build > Build APK(s)
```
- لو غيّرت اللوجو: استبدل `resources/*` ثم `npm run android:icons` ثم `android:sync`.
- لو عدّلت `StudentExamAttempt.jsx` أو نقلت أجزاءه: الجزء الوحيد المهم فيها هو `useNativeExamLock` و`fullscreenOk`.
- عنوان السيرفر في `.env.native`.
