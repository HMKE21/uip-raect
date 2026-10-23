الاستوري (Status) — الفرونت
============================
انسخ الفولدر src فوق مشروع React بنفس المسارات.

جديد:
  src/components/messaging/stories/StoriesStrip.jsx    الشريط فوق قايمة المحادثات (بيمتلك الفيد + العارض + شاشة النشر)
  src/components/messaging/stories/StoryViewer.jsx     العارض ملء الشاشة (تفاعل، رد، المشاهدين، حذف، كتم)
  src/components/messaging/stories/StoryComposer.jsx   النشر (نص/صورة/فيديو، الجمهور، المدة، السماح بالرد)
  src/components/messaging/stories/Face.jsx            صورة دايرية مع الحروف الأولى كبديل
  src/components/messaging/stories/storyUtils.js       ثوابت وأدوات مشتركة
  src/styles/css/messaging-stories.css

معدّل (إضافة بس):
  src/components/messaging/ConversationRail.jsx   import + سطر <StoriesStrip /> تحت الهيدر (بيختفي أثناء البحث والتحديد)
  src/components/messaging/ThreadPanel.jsx        StoryReplyCard: بطاقة صغيرة فوق الرد اللي جاي من استوري (metadata.story_reply)
  src/styles/index.css                            سطر @import للـ CSS الجديد

مفيش dependencies جديدة. بيتكلم مع /api/v1/messaging/stories (الباك إند في uip-stories-backend.zip).
