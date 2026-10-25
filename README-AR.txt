إصلاح طقطقة / عدم استقرار الصوت في التسجيل الصوتي
ادمج الملفات دي فوق مشروع الـ React بنفس المسارات (3 ملفات فقط، مفيش تغيير في Laravel ولا RUN):
  src/components/messaging/voiceEngine.js
  src/components/messaging/ThreadPanel.jsx
  src/components/ai-assistant/aiRecorder.jsx
بعدها أعد البناء (npm run build). لو عايز ترجّع معالجة RNNoise الحية: LIVE_PROCESSING = true في voiceEngine.js.
