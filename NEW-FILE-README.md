# إنشاء ملفات جديدة (Word / Excel / PowerPoint / PDF / ...)

انسخ فوق المشروع (نفس المسارات). مفيش تغيير في الـ API ولا باكدجات جديدة (الباك اند زي ما هو).

ملفات جديدة:
- src/lib/officeFmt/create.js      (كتالوج الأنواع + createFile)
- src/lib/officeFmt/newPptx.js     (بناء pptx من الصفر)
- src/components/NewFileDialog.jsx + src/styles/css/new-file.css

ملفات معدّلة: src/pages/student/StudentMyPC.jsx (قائمة New + كليك يمين) ، src/desktop/DesktopOS.jsx (كليك يمين على سطح المكتب)

الأنواع: docx, xlsx, pptx, pdf, png, csv, tsv, json, md, txt, html, css, js, py — لكل نوع قوالب.
الملف بيتحفظ في جهازي (أو على سطح المكتب) وبيتفتح على طول في المحرر الموجود.
لإضافة نوع جديد: ضيف عنصر في NEW_TYPES وفرع في createFile.
