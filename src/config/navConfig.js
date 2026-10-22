/**
 * Sidebar nav sections per role. Each role is a list of titled groups; the
 * ordering rules are documented above RAW_CONFIGS and enforced by
 * getNavConfig() (Account is always last).
 */

const COMMON_ACCOUNT_ITEMS = [
  { key: 'messages', en: 'Messages', ar: 'الرسائل', icon: 'message', perm: 'messaging.use', built: true },
  { key: 'notifications', en: 'Notifications', ar: 'الإشعارات', icon: 'bell', built: true },
  { key: 'settings', en: 'Settings', ar: 'الإعدادات', icon: 'settings', built: true },
];

/*
 * Sidebar ordering rules (same in every portal):
 *   1. Dashboard / "Workspace" always comes first.
 *   2. The role's day-to-day work comes next, grouped by topic under a
 *      titled section, and each group follows the real workflow order.
 *   3. Insights (analytics / reports) come after the operational groups.
 *   4. "Account" is always LAST: Public Profile (when the role has one),
 *      Messages, Notifications, Settings. getNavConfig() enforces this, so
 *      a new section added to a role can never end up below Account.
 *   5. No two entries point at the same route, and no two entries in a
 *      portal share an icon.
 * Per-role `account` entries below are the personal extras that sit in
 * front of the common Messages / Notifications / Settings.
 */
const PUBLIC_PROFILE = (prefix) => ({
  key: 'portfolio', en: 'Public Profile', ar: 'الملف العام', icon: 'globe', route: `/${prefix}/portfolio`, built: true,
});

const RAW_CONFIGS = {
  // Student portal. Company Discovery / Internships / Hackathons / Events are
  // in the design but have no backend, so they are intentionally NOT listed.
  student: {
    main: [
      { key: 'dashboard', en: 'Dashboard', ar: 'لوحة التحكم', icon: 'dashboard', route: '/student/dashboard', built: true },
      { key: 'projects', en: 'My Projects', ar: 'مشاريعي', icon: 'projects', route: '/student/projects', built: true },
      { key: 'my-pc', en: 'My PC', ar: 'جهازي', icon: 'monitor', route: '/student/my-pc', built: true },
      { key: 'ai-analysis', en: 'AI Analysis', ar: 'تحليل الذكاء الاصطناعي', icon: 'sparkles', route: '/student/ai-analysis', perm: 'ai.request_analysis', built: true },
      { key: 'github', en: 'GitHub Integration', ar: 'ربط GitHub', icon: 'github', route: '/student/github', built: true },
      { key: 'patents', en: 'Patent Portal', ar: 'بوابة براءات الاختراع', icon: 'shield', route: '/student/patents', built: true },
      { key: 'portfolio', en: 'Portfolio', ar: 'ملفي الإبداعي', icon: 'folder', route: '/student/portfolio', built: true },
    ],
    academics: [
      { key: 'courses', en: 'My Courses', ar: 'موادي', icon: 'layers', route: '/student/courses', built: true },
      { key: 'timetable', en: 'Timetable', ar: 'جدول المحاضرات', icon: 'calendar', route: '/student/timetable', built: true },
      { key: 'my-exams', en: 'Exams', ar: 'الامتحانات', icon: 'file', route: '/student/my-exams', built: true },
      { key: 'graduation', en: 'Graduation Requirements', ar: 'متطلبات التخرج', icon: 'check-circle', route: '/student/graduation', built: true },
    ],
    community: [
      { key: 'feed', en: 'University Feed', ar: 'موجز الجامعة', icon: 'globe', route: '/student/feed', built: true },
      { key: 'announcements', en: 'Announcements', ar: 'الإعلانات', icon: 'info', route: '/student/announcements', built: true },
      { key: 'discovery', en: 'Project Discovery', ar: 'استكشاف المشاريع', icon: 'search', route: '/student/discovery', built: true },
      { key: 'group-hub', en: 'Group Hub', ar: 'مركز المجموعة', icon: 'users', route: '/student/group-hub', built: true },
      { key: 'group-chat', en: 'Group Chat', ar: 'دردشة المجموعة', icon: 'message-square', route: '/student/group-chat', built: true },
      { key: 'contacts', en: 'My Contacts', ar: 'جهات اتصالي', icon: 'inbox', route: '/student/contacts', built: true },
    ],
  },
  university: {
    main: [
      { key: 'dashboard', en: 'Dashboard', ar: 'لوحة التحكم', icon: 'dashboard', route: '/university/dashboard', built: true },
      { key: 'approvals', en: 'Project Approvals', ar: 'اعتماد المشاريع', icon: 'check-circle', route: '/university/approvals', built: true },
      { key: 'graduation', en: 'Graduation Records', ar: 'سجلات التخرج', icon: 'award', route: '/university/graduation', built: true },
    ],
    people: [
      { key: 'students', en: 'Students', ar: 'الطلاب', icon: 'users', route: '/university/students', built: true },
      { key: 'academic-staff', en: 'Academic Staff', ar: 'أعضاء هيئة التدريس', icon: 'user', route: '/university/academic-staff', built: true },
      { key: 'join-requests', en: 'Join Requests', ar: 'طلبات الانضمام', icon: 'inbox', route: '/university/join-requests', built: true },
      { key: 'verification', en: 'Verification', ar: 'التحقق', icon: 'shield', route: '/university/verification', built: true },
    ],
    academics: [
      { key: 'faculties', en: 'Faculties', ar: 'الكليات', icon: 'building', route: '/university/faculties', built: true },
      { key: 'courses', en: 'Courses', ar: 'المواد', icon: 'layers', route: '/university/courses', built: true },
      { key: 'timetable', en: 'Timetable', ar: 'جدول المحاضرات', icon: 'calendar', route: '/university/timetable', built: true },
    ],
    community: [
      { key: 'feed', en: 'University Feed', ar: 'موجز الجامعة', icon: 'chat', route: '/university/feed', built: true },
      { key: 'announcements', en: 'Announcements', ar: 'الإعلانات', icon: 'info', route: '/university/announcements', built: true },
      { key: 'chat-reports', en: 'Chat Reports', ar: 'بلاغات الشات', icon: 'flag', route: '/university/chat-reports', built: true },
    ],
    insights: [
      { key: 'analytics', en: 'Analytics', ar: 'التحليلات', icon: 'chart', route: '/university/analytics', perm: 'analytics.view', built: true },
      { key: 'reports', en: 'Reports', ar: 'التقارير', icon: 'file', route: '/university/reports', built: true },
    ],
    account: [PUBLIC_PROFILE('university')],
  },
  // Faculty Portal — a "mini university" scoped to one faculty_id, so it
  // mirrors the University portal's groups (same keys, same order).
  faculty: {
    main: [
      { key: 'dashboard', en: 'Dashboard', ar: 'لوحة التحكم', icon: 'dashboard', route: '/faculty/dashboard', built: true },
      { key: 'approvals', en: 'Project Approvals', ar: 'اعتماد المشاريع', icon: 'check-circle', route: '/faculty/approvals', built: true },
      { key: 'graduation', en: 'Graduation Records', ar: 'سجلات التخرج', icon: 'award', route: '/faculty/graduation', built: true },
    ],
    people: [
      { key: 'students', en: 'Students', ar: 'الطلاب', icon: 'users', route: '/faculty/students', built: true },
      { key: 'academic-staff', en: 'Academic Staff', ar: 'أعضاء هيئة التدريس', icon: 'user', route: '/faculty/academic-staff', built: true },
    ],
    academics: [
      { key: 'courses', en: 'Courses', ar: 'المواد', icon: 'layers', route: '/faculty/courses', built: true },
      { key: 'timetable', en: 'Timetable', ar: 'جدول المحاضرات', icon: 'calendar', route: '/faculty/timetable', built: true },
    ],
    community: [
      { key: 'chat-reports', en: 'Chat Reports', ar: 'بلاغات الشات', icon: 'flag', route: '/faculty/chat-reports', built: true },
    ],
    account: [PUBLIC_PROFILE('faculty')],
  },
  // Exam & Assessment System. The exam entries follow the life-cycle of an
  // exam: build the bank → build the exam → target & publish → grade → analyse.
  // Append new rounds to the `exams` group in that same flow order.
  academic_staff: {
    main: [
      { key: 'dashboard', en: 'Dashboard', ar: 'لوحة التحكم', icon: 'dashboard', route: '/academic-staff/dashboard', built: true },
      { key: 'courses', en: 'Courses', ar: 'المواد', icon: 'layers', route: '/academic-staff/courses', built: true },
      { key: 'timetable', en: 'Timetable', ar: 'جدول المحاضرات', icon: 'calendar', route: '/academic-staff/timetable', built: true },
      { key: 'projects', en: "Students' Projects", ar: 'مشاريع الطلبة', icon: 'projects', route: '/academic-staff/projects', built: true },
    ],
    exams: [
      { key: 'question-banks', en: 'Question Banks', ar: 'بنوك الأسئلة', icon: 'archive', route: '/academic-staff/question-banks', built: true },
      { key: 'exams', en: 'Exams', ar: 'الامتحانات', icon: 'file', route: '/academic-staff/exams', built: true },
      { key: 'targets', en: 'Targeting & Publish', ar: 'الاستهداف والنشر', icon: 'send', route: '/academic-staff/targets', built: true },
      { key: 'attempts', en: 'Attempts & Grading', ar: 'المحاولات والتصحيح', icon: 'edit', route: '/academic-staff/attempts', built: true },
      { key: 'analytics', en: 'Analytics', ar: 'الإحصائيات', icon: 'bar-chart', route: '/academic-staff/analytics', built: true },
      { key: 'results', en: 'Exam Results', ar: 'نتائج الامتحانات', icon: 'award', route: '/academic-staff/results', built: true },
      { key: 'students-results', en: "Students' Results", ar: 'نتائج الطلبة', icon: 'users', route: '/academic-staff/students-results', built: true },
      { key: 'exports', en: 'Exports', ar: 'التصدير والتقارير', icon: 'download', route: '/academic-staff/exports', built: true },
    ],
    account: [PUBLIC_PROFILE('academic-staff')],
  },
  // Supervisor / TA — same surface as the doctor (academic_staff): courses +
  // the whole exam life-cycle, plus the supervisor-only items (My Students and
  // the scope-based project review queue). The exam/course pages live under
  // /academic-staff/* and are served to supervisors through the backend's
  // `uip.staff_alias` middleware (UipSupervisorAsStaffMiddleware).
  supervisor: {
    main: [
      { key: 'dashboard', en: 'Dashboard', ar: 'لوحة التحكم', icon: 'dashboard', route: '/supervisor/dashboard', built: true },
      { key: 'courses', en: 'Courses', ar: 'المواد', icon: 'layers', route: '/academic-staff/courses', built: true },
      { key: 'timetable', en: 'Timetable', ar: 'جدول المحاضرات', icon: 'calendar', route: '/academic-staff/timetable', built: true },
      { key: 'students', en: 'My Students', ar: 'طلابي', icon: 'users', route: '/supervisor/students', built: true },
      { key: 'projects', en: 'My Projects', ar: 'مشاريعي', icon: 'projects', route: '/supervisor/projects', built: true },
    ],
    exams: [
      { key: 'question-banks', en: 'Question Banks', ar: 'بنوك الأسئلة', icon: 'archive', route: '/academic-staff/question-banks', built: true },
      { key: 'exams', en: 'Exams', ar: 'الامتحانات', icon: 'file', route: '/academic-staff/exams', built: true },
      { key: 'targets', en: 'Targeting & Publish', ar: 'الاستهداف والنشر', icon: 'send', route: '/academic-staff/targets', built: true },
      { key: 'attempts', en: 'Attempts & Grading', ar: 'المحاولات والتصحيح', icon: 'edit', route: '/academic-staff/attempts', built: true },
      { key: 'analytics', en: 'Analytics', ar: 'الإحصائيات', icon: 'bar-chart', route: '/academic-staff/analytics', built: true },
      { key: 'results', en: 'Exam Results', ar: 'نتائج الامتحانات', icon: 'award', route: '/academic-staff/results', built: true },
      { key: 'students-results', en: "Students' Results", ar: 'نتائج الطلبة', icon: 'users', route: '/academic-staff/students-results', built: true },
      { key: 'exports', en: 'Exports', ar: 'التصدير والتقارير', icon: 'download', route: '/academic-staff/exports', built: true },
    ],
    account: [PUBLIC_PROFILE('supervisor')],
  },
  // Data analyst — grouped by the analyst's workflow:
  // find the data → analyse it → report it out.
  data_analyst: {
    main: [
      { key: 'dashboard', en: 'Dashboard', ar: 'لوحة التحكم', icon: 'dashboard', route: '/data-analysis/dashboard', perm: 'data_analysis.dashboard.view', built: true },
      { key: 'da-dashboards', en: 'Saved Dashboards', ar: 'اللوحات المحفوظة', icon: 'grid', route: '/data-analysis/dashboards', perm: 'data_analysis.dashboard.view', built: true },
      { key: 'da-workspace', en: 'Team Workspace', ar: 'مساحة الفريق', icon: 'users', route: '/data-analysis/workspace', perm: 'data_analysis.dashboard.view', built: true },
    ],
    explore: [
      { key: 'da-explorer', en: 'Data Explorer', ar: 'مستكشف البيانات', icon: 'search', route: '/data-analysis/data-explorer', perm: 'data_analysis.dashboard.view', built: true },
      { key: 'da-queries', en: 'SQL Query Builder', ar: 'أداة بناء استعلامات SQL', icon: 'terminal', route: '/data-analysis/queries', perm: 'data_analysis.dashboard.view', built: true },
      { key: 'da-segments', en: 'Data Segments', ar: 'تقسيمات البيانات', icon: 'filter', route: '/data-analysis/segments', perm: 'data_analysis.segments.manage', built: true },
      { key: 'da-data-quality', en: 'Data Quality', ar: 'جودة البيانات', icon: 'shield', route: '/data-analysis/data-quality', perm: 'data_analysis.dashboard.view', built: true },
    ],
    analysis: [
      { key: 'da-advanced-analytics', en: 'Advanced Analytics', ar: 'التحليلات المتقدمة', icon: 'bar-chart', route: '/data-analysis/advanced-analytics', perm: 'data_analysis.trends.view', built: true },
      { key: 'da-exam-analytics', en: 'Exam Analytics', ar: 'تحليلات الامتحانات', icon: 'award', route: '/data-analysis/exam-analytics', perm: 'data_analysis.dashboard.view', built: true },
      { key: 'da-forecasting', en: 'Forecasting', ar: 'التنبؤات', icon: 'trend', route: '/data-analysis/forecasting', perm: 'data_analysis.trends.view', built: true },
      { key: 'da-kpis', en: 'KPI Management', ar: 'إدارة المؤشرات', icon: 'award', route: '/data-analysis/kpis', perm: 'data_analysis.trends.view', built: true },
      { key: 'da-ai-insights', en: 'AI Insights', ar: 'رؤى الذكاء الاصطناعي', icon: 'sparkles', route: '/data-analysis/ai-insights', perm: 'data_analysis.trends.view', built: true },
    ],
    reporting: [
      { key: 'da-reports', en: 'Reports', ar: 'التقارير', icon: 'file', route: '/data-analysis/reports', perm: 'data_analysis.reports.manage', built: true },
      { key: 'da-report-files', en: 'Report Files', ar: 'ملفات التقارير', icon: 'archive', route: '/data-analysis/report-files', perm: 'data_analysis.reports.manage', built: true },
      { key: 'da-exports', en: 'Exports', ar: 'التصدير', icon: 'download', route: '/data-analysis/exports', perm: 'data_analysis.export', built: true },
    ],
    account: [PUBLIC_PROFILE('data-analysis')],
  },
  admin: {
    main: [
      { key: 'dashboard', en: 'Dashboard', ar: 'لوحة التحكم', icon: 'dashboard', route: '/admin/dashboard', built: true },
      { key: 'universities', en: 'Institutions', ar: 'المؤسسات', icon: 'building', route: '/admin/universities', built: true },
      { key: 'approvals', en: 'Verification & Approvals', ar: 'التحقق والاعتماد', icon: 'check-circle', route: '/admin/approvals', built: true },
      { key: 'projects', en: 'Projects & Moderation', ar: 'المشاريع والإشراف', icon: 'projects', route: '/admin/projects', built: true },
      { key: 'featured-projects', en: 'Featured Projects', ar: 'المشاريع المميزة', icon: 'star', route: '/admin/featured-projects', built: true },
    ],
    access: [
      { key: 'users', en: 'Users & Roles', ar: 'المستخدمون والأدوار', icon: 'users', route: '/admin/users', built: true },
      { key: 'roles', en: 'Roles & Permissions', ar: 'الأدوار والصلاحيات', icon: 'key', route: '/admin/roles', built: true },
      { key: 'team', en: 'Team Management', ar: 'إدارة فريق الإشراف', icon: 'user', route: '/admin/team', built: true },
    ],
    insights: [
      { key: 'system-activity', en: 'System Activity', ar: 'نشاط النظام', icon: 'pulse', route: '/admin/activity', built: true },
      { key: 'analytics', en: 'Platform Analytics', ar: 'تحليلات المنصة', icon: 'chart', route: '/admin/analytics', built: true },
      { key: 'statistics', en: 'Innovation Statistics', ar: 'إحصاءات الابتكار', icon: 'bar-chart', route: '/admin/statistics', built: true },
      { key: 'reports', en: 'Reports', ar: 'التقارير', icon: 'file', route: '/admin/reports', built: true },
    ],
    // Security Portal pages are reachable by admin too (config/roles.php
    // portal_prefixes.security includes 'admin'). Keys are prefixed 'sec-' so
    // they never collide with the admin items above.
    // The combined "Audit & Security Logs" page (/security/logs) is not listed
    // separately: Security Logs + Audit Logs below already cover it.
    securityPortal: [
      { key: 'sec-incidents', en: 'Incidents', ar: 'الحوادث', icon: 'shield', route: '/security/incidents', built: true },
      { key: 'sec-vulnerabilities', en: 'Vulnerabilities', ar: 'الثغرات', icon: 'alert', route: '/security/vulnerabilities', built: true },
      { key: 'sec-alerts', en: 'Alerts', ar: 'التنبيهات', icon: 'alert-triangle', route: '/security/alerts', built: true },
      { key: 'sec-sessions', en: 'Sessions', ar: 'الجلسات', icon: 'monitor', route: '/security/sessions', built: true },
    ],
    security: [
      { key: 'security-logs', en: 'Security Logs', ar: 'سجلات الأمان', icon: 'history', route: '/admin/security-logs', built: true },
      { key: 'audit-logs', en: 'Audit Logs', ar: 'سجلات التدقيق', icon: 'note', route: '/admin/audit-logs', built: true },
      { key: 'sec-policies', en: 'Security Policies', ar: 'سياسات الأمان', icon: 'lock', route: '/security/policies', built: true },
      { key: 'sec-reports', en: 'Security Reports', ar: 'تقارير الأمان', icon: 'archive', route: '/security/reports', built: true },
    ],
    messaging: [
      { key: 'chat-reports', en: 'Chat Reports', ar: 'بلاغات الشات', icon: 'flag', route: '/admin/chat-reports', built: true },
      { key: 'messaging-oversight', en: 'Messaging Oversight', ar: 'إشراف الرسائل', icon: 'eye', route: '/admin/messaging/oversight', built: true },
      { key: 'ai-conversations', en: 'AI Conversations', ar: 'محادثات الـ AI', icon: 'message-square', route: '/admin/messaging/ai', built: true },
      { key: 'messaging-analytics', en: 'Messaging Analytics', ar: 'تحليلات الرسائل', icon: 'trend', route: '/admin/messaging/analytics', built: true },
      { key: 'messaging-settings', en: 'Messaging Settings', ar: 'إعدادات الرسائل', icon: 'wrench', route: '/admin/messaging/settings', built: true },
      { key: 'notification-settings', en: 'Notification Settings', ar: 'إعدادات الإشعارات', icon: 'mail', route: '/admin/notifications/settings', built: true },
    ],
    ai: [
      { key: 'code-review', en: 'AI Code Review', ar: 'مراجعة الكود بالذكاء الاصطناعي', icon: 'terminal', route: '/admin/ai-code-review', built: true },
      { key: 'ai-assistant-settings', en: 'AI Assistant Settings', ar: 'إعدادات المساعد الذكي', icon: 'sparkles', route: '/admin/ai-assistant-settings', built: true },
      { key: 'faq-intents', en: 'FAQ / Smart Answers', ar: 'الأسئلة الشائعة والإجابات الذكية', icon: 'message-square', route: '/admin/faq-intents', built: true },
    ],
    platform: [
      { key: 'mobile', en: 'Mobile App Management', ar: 'إدارة تطبيق الجوال', icon: 'smartphone', route: '/admin/mobile', built: true },
      { key: 'platform-policy', en: 'Platform Policy', ar: 'سياسة المنصة', icon: 'x-circle', route: '/admin/platform-policy', built: true },
    ],
    account: [PUBLIC_PROFILE('admin')],
  },
  // Security Portal — security_admin additionally gets Security Policies
  // (SecurityPolicyController::canEdit() is admin-only for policy edits).
  security_admin: {
    main: [
      { key: 'dashboard', en: 'Dashboard', ar: 'لوحة التحكم', icon: 'dashboard', route: '/security/dashboard', perm: 'security.dashboard.view', built: true },
    ],
    securityPortal: [
      { key: 'incidents', en: 'Incidents', ar: 'الحوادث', icon: 'shield', route: '/security/incidents', perm: 'security.incidents.manage', built: true },
      { key: 'vulnerabilities', en: 'Vulnerabilities', ar: 'الثغرات', icon: 'alert', route: '/security/vulnerabilities', perm: 'security.vulnerabilities.manage', built: true },
      { key: 'alerts', en: 'Alerts', ar: 'التنبيهات', icon: 'alert-triangle', route: '/security/alerts', perm: 'security.notifications.manage', built: true },
      { key: 'sessions', en: 'Sessions', ar: 'الجلسات', icon: 'monitor', route: '/security/sessions', perm: 'security.sessions.manage', built: true },
    ],
    security: [
      { key: 'logs', en: 'Audit & Security Logs', ar: 'سجلات الأمان والتدقيق', icon: 'note', route: '/security/logs', perm: 'logs.view_security', built: true },
      { key: 'policies', en: 'Security Policies', ar: 'سياسات الأمان', icon: 'lock', route: '/security/policies', perm: 'security.policies.manage', built: true },
      { key: 'reports', en: 'Security Reports', ar: 'تقارير الأمان', icon: 'file', route: '/security/reports', perm: 'security.reports.generate', built: true },
      { key: 'report-files', en: 'Report Files', ar: 'ملفات التقارير', icon: 'archive', route: '/security/report-files', perm: 'security.reports.generate', built: true },
    ],
    account: [PUBLIC_PROFILE('security')],
  },
  security_officer: {
    main: [
      { key: 'dashboard', en: 'Dashboard', ar: 'لوحة التحكم', icon: 'dashboard', route: '/security/dashboard', perm: 'security.dashboard.view', built: true },
    ],
    securityPortal: [
      { key: 'incidents', en: 'Incidents', ar: 'الحوادث', icon: 'shield', route: '/security/incidents', perm: 'security.incidents.manage', built: true },
      { key: 'vulnerabilities', en: 'Vulnerabilities', ar: 'الثغرات', icon: 'alert', route: '/security/vulnerabilities', perm: 'security.vulnerabilities.manage', built: true },
      { key: 'alerts', en: 'Alerts', ar: 'التنبيهات', icon: 'alert-triangle', route: '/security/alerts', perm: 'security.notifications.manage', built: true },
      { key: 'sessions', en: 'Sessions', ar: 'الجلسات', icon: 'monitor', route: '/security/sessions', perm: 'security.sessions.manage', built: true },
    ],
    security: [
      { key: 'logs', en: 'Audit & Security Logs', ar: 'سجلات الأمان والتدقيق', icon: 'note', route: '/security/logs', perm: 'logs.view_security', built: true },
      { key: 'reports', en: 'Security Reports', ar: 'تقارير الأمان', icon: 'file', route: '/security/reports', perm: 'security.reports.generate', built: true },
      { key: 'report-files', en: 'Report Files', ar: 'ملفات التقارير', icon: 'archive', route: '/security/report-files', perm: 'security.reports.generate', built: true },
    ],
    account: [PUBLIC_PROFILE('security')],
  },
};

export const ROLE_LABELS = {
  student: { en: 'Student Portal', ar: 'بوابة الطالب' },
  university: { en: 'University Portal', ar: 'بوابة الجامعة' },
  faculty: { en: 'Faculty Portal', ar: 'بوابة الكلية' },
  supervisor: { en: 'Supervisor Portal', ar: 'بوابة المشرف' },
  admin: { en: 'Admin Dashboard', ar: 'لوحة تحكم المشرف' },
  data_analyst: { en: 'Data Analysis Portal', ar: 'بوابة تحليل البيانات' },
  security_admin: { en: 'Security Portal', ar: 'بوابة الأمان' },
  security_officer: { en: 'Security Portal', ar: 'بوابة الأمان' },
  academic_staff: { en: 'Academic Staff Portal', ar: 'بوابة عضو هيئة التدريس' },
};

export const SECTION_TITLES = {
  main: { en: 'Workspace', ar: 'مساحة العمل' },
  academics: { en: 'Academics', ar: 'الأكاديمي' },
  people: { en: 'People', ar: 'الأفراد' },
  access: { en: 'Users & Access', ar: 'المستخدمون والصلاحيات' },
  exams: { en: 'Exam System', ar: 'نظام الامتحانات' },
  explore: { en: 'Explore Data', ar: 'استكشاف البيانات' },
  analysis: { en: 'Analysis', ar: 'التحليل' },
  reporting: { en: 'Reporting', ar: 'التقارير والتصدير' },
  community: { en: 'Community', ar: 'المجتمع' },
  insights: { en: 'Insights', ar: 'الإحصاءات والتقارير' },
  securityPortal: { en: 'Threat Monitoring', ar: 'رصد التهديدات' },
  security: { en: 'Security & Audit', ar: 'الأمان والتدقيق' },
  messaging: { en: 'Messaging Admin', ar: 'إدارة الرسائل' },
  ai: { en: 'AI & Assistant', ar: 'الذكاء الاصطناعي والمساعد' },
  platform: { en: 'Platform', ar: 'المنصة' },
  account: { en: 'Account', ar: 'الحساب' },
};

// Roles whose URL prefix differs from their role slug — mirrors
// config('roles.portal_prefixes') on the backend (data_analyst's portal
// lives at /data-analysis/*, not /data_analyst/*; academic_staff's portal
// lives at /academic-staff/*, not /academic_staff/* — same reason).
const PORTAL_PREFIX_OVERRIDES = {
  data_analyst: 'data-analysis',
  security_admin: 'security',
  security_officer: 'security',
  academic_staff: 'academic-staff',
};

// Per-role overrides for COMMON_ACCOUNT_ITEMS. Faculty Settings now has
// its React page (FacultySettings.jsx, wired to FacultySettingsApiController)
// so it no longer needs a `built: false` override here — left as an empty
// entry so a future portal-specific override has somewhere obvious to go.
const ACCOUNT_ITEM_OVERRIDES = {
  student: { messages: { icon: 'chat' } },
  // بند 18 (Messaging)/19 (Notifications) — supervisor.messages/notifications
  // اتقفلوا هنا قبل كده لأن /supervisor/messages و/supervisor/notifications
  // ما كانوش مسجلين في App.jsx، رغم إن الـ API (/api/v1/messaging،
  // /api/v1/notifications) شغال ومشترك بين كل الأدوار من غير قيد role.
  // دلوقتي الراوتس اتسجلت (زي أي بورتال تاني)، فالـ override اتشال.
  // AcademicStaffSettingsApiController now exists (routes/api.php
  // '/academic-staff/settings/*') and AcademicStaffSettings.jsx is wired
  // up — Settings is no longer locked, so this override is gone. Left as
  // a comment (not an empty entry) so it's clear why academic_staff isn't
  // listed here anymore, same as the Faculty note above.
};


/** Portal URL prefix for a role — mirrors uip_portal_prefix() on the backend. */
export function portalPrefix(role) {
  return PORTAL_PREFIX_OVERRIDES[role] || role || 'student';
}

/** Returns { main: [...], <groups>..., account: [...] } for a role.
 *  Section order = the order written in RAW_CONFIGS; `account` is always
 *  appended last (personal extras first, then Messages/Notifications/Settings). */
export function getNavConfig(role, can) {
  const { account: accountExtras = [], ...sections } = RAW_CONFIGS[role] || RAW_CONFIGS.student;
  const prefix = portalPrefix(role);
  const overrides = ACCOUNT_ITEM_OVERRIDES[role] || {};
  const common = COMMON_ACCOUNT_ITEMS.map((item) => ({
    ...item,
    ...(overrides[item.key] || {}),
    route: `/${prefix}/${item.key}`,
  }));
  const all = { ...sections, account: [...accountExtras, ...common] };
  if (typeof can !== 'function') return all;
  // Hide entries whose permission the role no longer has (item.perm); drop sections left empty.
  const out = {};
  for (const [key, items] of Object.entries(all)) {
    const kept = items.filter((item) => !item.perm || can(item.perm));
    if (kept.length) out[key] = kept;
  }
  return out;
}

/** The nav entry (unfiltered) that owns `pathname` — longest matching route wins.
 *  DashboardLayout uses it to close a page whose permission was revoked. */
export function matchNavItem(role, pathname) {
  return Object.values(getNavConfig(role)).flat()
    .filter((i) => i.route && (pathname === i.route || pathname.startsWith(`${i.route}/`)))
    .sort((a, b) => b.route.length - a.route.length)[0] || null;
}
