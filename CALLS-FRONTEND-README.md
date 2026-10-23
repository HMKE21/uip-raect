# المكالمات الصوتية (1:1) — الفرونت

بيشتغل مع الباك إند اللي في `calls-backend-changes.zip` (لازم `php artisan migrate` + مفاتيح TURN).

## الملفات
**جديد**
- `src/lib/calls/callEngine.js` — محرك المكالمات (polling + WebRTC + إعادة الاتصال + كتم + جودة الاتصال). مفيهوش React.
- `src/lib/calls/ringtone.js` — نغمات الرنين/الانتظار/الاتصال والإنهاء (Web Audio، من غير ملفات صوت).
- `src/lib/calls/callText.js` — نصوص المكالمة (سطر الشات، معاينة الـ inbox) عربي/إنجليزي.
- `src/context/CallContext.jsx` + `src/context/callCtx.js` — `<CallProvider>` و `useCall()`.
- `src/components/calls/CallUI.jsx` — كارت الرنّة، شاشة المكالمة، الشريط المصغّر، رسائل النهاية.
- `src/components/calls/CallBubble.jsx` — سطر المكالمة جوه الشات + زرار "اتصال".
- `src/styles/css/calls.css`
- `tests/calls/engine.test.mjs` — اختبارات المحرك: `node --test "tests/calls/*.test.mjs"`

**معدّل (تعديلات صغيرة)**
- `src/App.jsx` — `<CallProvider>` جوه `MfaGate` (الرنّة بتجيلك في أي صفحة).
- `src/api/client.js` — `api.postQuiet` (POST من غير ما يطلّع `MUTATION_EVENT`، عشان إشارات المكالمة ماتعملش refetch للصفحات).
- `src/components/Icon.jsx` — أيقونتين: `phone` و `mic-off`.
- `src/components/messaging/ThreadPanel.jsx` — زرار الاتصال في الهيدر، عرض رسائل `call`.
- `src/components/messaging/ConversationRail.jsx` — معاينة المكالمة في الـ inbox.
- `src/styles/index.css` — import لـ `calls.css`.

## السلوك
- الزرار بيظهر في المحادثات المباشرة بس، ومش بيظهر لو حظر أو حساب محذوف أو مفيش صلاحية `messaging.use`.
- Polling كل 3 ثواني وانت فاضي (8 لو التبويب في الخلفية)، وكل ثانية أثناء المكالمة. ده جوه حد الـ 300/دقيقة.
- لو اتفتح الموقع في تبويبين، أول واحد يرد يكسب والتاني الرنّة بتتقفل من غير رسالة.
- انقطاع الشبكة: المتصل بيعمل ICE restart، ولو ماتصلحش خلال 15 ثانية المكالمة بتنتهي بـ "انقطع الاتصال".
- لو الميكروفون محظور وانت بترد، الكارت بيفضل ويرجع يرن عشان تسمح وتجرب تاني.
- لو التبويب في الخلفية والإذن بتاع الإشعارات اتدّى قبل كده، بيطلع إشعار نظام + عنوان التبويب بيومض. الكود مابيطلبش الإذن لوحده.
- الفيديو متقفل (`CALLS_VIDEO_ENABLED=false`)، والفرونت صوت بس.

## تم اختباره
- 18 اختبار للمحرك (مع بدائل WebRTC والسيرفر): مكالمة صادرة/واردة، رفض، إلغاء، فائتة، مشغول، تبويب تاني، رفض الميكروفون، ICE restart، انقطاع.
- اختبار render للواجهة في jsdom (كل المراحل، عربي/RTL، الـ bubble).
- اختبار تكامل `CallProvider` بمكالمة واردة كاملة لحد الاتصال والإنهاء.
- `vite build` نجح.

## لسه محتاج تجربة يدوية (مش ممكن من بيئتي)
مكالمة حقيقية بين جهازين على شبكتين مختلفتين (موبايل ↔ واي فاي) بعد ما تحط مفاتيح TURN، وتجربة الصوت على Android WebView وSafari.
