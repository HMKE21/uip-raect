# محرر الإكسيل — اختصارات حقيقية + واجهة شبه Microsoft Excel

انسخ الملفات فوق المشروع (نفس المسارات) وأعد تشغيل `npm run dev`. مفيش باكدجات جديدة ولا تغيير في الـ API.

## المشكلة كانت إيه
- المحرر كان بيقارن الحرف المطبوع (`e.key === 's'`). على الكيبورد العربي Ctrl+S بيطلع `س` فمبيتمسكش ويوصل للمتصفح (Save As للصفحة).
- كمان كان بيتجاهل الضغطة لو الفوكس خارج الشيت (شريط عنوان النافذة، الدوك…).

## الحل
- `src/lib/sheet/keys.js`: بيحدد الزرار الفعلي بغض النظر عن لغة الكيبورد (عربي/فرنسي/…)، وقايمة الاختصارات اللي المتصفح بيمتلكها.
- `SheetApp.jsx`: مستمع على مستوى الصفحة بيشتغل طول ما نافذة الشيت هي النشطة، فـ Ctrl+S / P / F / G / H / D / U / B … مبتوصلش للمتصفح أبدًا.
- ملحوظة: Ctrl+N / T / W / Q / Tab بيمتلكها المتصفح نفسه ومفيش موقع يقدر يمسكها.

## الجديد
- Ctrl+S حفظ · Ctrl+Shift+S تنزيل نسخة · Ctrl+P طباعة الشيت نفسه (مش الصفحة) · Ctrl+1 تنسيق الخلايا · F1 قايمة الاختصارات · Ctrl+G/F5 اذهب إلى · Shift+F3 إدراج دالة · Shift+F11 ورقة جديدة · Ctrl+PgUp/PgDn بين الأوراق · Ctrl+Shift+1/4/5… تنسيقات أرقام · Ctrl+9/0 إخفاء · Ctrl+F1 طيّ الشريط.
- شريط Excel: File / Home / Insert / Page Layout / Formulas / Data / View / Help بمجموعات مسمّاة وأزرار كبيرة.
- قائمة File (معلومات، حفظ، حفظ نسخة xlsx/csv، طباعة بإعدادات).
- Format Cells (5 تبويبات)، Cell Styles، Format as Table، Format Painter، AutoSum (متوسط/عدّ/أكبر/أصغر)، Insert Function، Go To، شريط حالة (Ready + إحصائيات + Zoom).
- نوافذ داخلية بدل `window.prompt`.

## الملفات
جديدة: `src/lib/sheet/{keys,presets,print}.js` · `src/components/sheet/{SheetIcons,SheetDialogs,SheetFileMenu}.jsx`
معدّلة: `src/components/sheet/{SheetApp,SheetRibbon,SheetEditor}.jsx` · `src/components/editor/OfficeShell.jsx` · `src/styles/css/sheet.css`

## مش موجود لسه
Conditional Formatting, Filter, Charts, Alt key-tips (الـ Alt محجوز لاختصارات سطح المكتب).
