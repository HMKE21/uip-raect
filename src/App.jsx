import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PageLoading from './components/PageLoading';
import { AuthProvider } from './context/AuthContext';
import { STAFF_LOGIN_PATH } from './config/staffPortal';
import StaffGate from './components/staff/StaffGate';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import SaveCenterHost from './components/savecenter/SaveCenterHost';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import DeviceGate from './components/DeviceGate';
import MfaGate from './components/MfaGate';
import AccountSettingsSync from './lib/accountSync';
import DashboardLayout from './layouts/DashboardLayout';
import { registerVisit } from './lib/siteVisits';
import { BackStackManager } from './lib/backStack';
import usePlatformInspectGuard from './hooks/usePlatformInspectGuard';
// Kept as a regular (non-lazy) import: ErrorBoundary.jsx already imports
// this statically as its fallback UI, so it's in the main bundle either
// way — lazy() here would just add a pointless Suspense round-trip and
// (harmlessly) an INEFFECTIVE_DYNAMIC_IMPORT build warning.
import ServerError from './pages/errors/ServerError';
const NotFound = lazy(() => import('./pages/errors/NotFound'));
const Forbidden = lazy(() => import('./pages/errors/Forbidden'));
const Landing = lazy(() => import('./pages/Landing'));
const ProjectsShowcase = lazy(() => import('./pages/ProjectsShowcase'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const PublicPortfolio = lazy(() => import('./pages/PublicPortfolio'));
const PublicUniversityProfile = lazy(() => import('./pages/PublicUniversityProfile'));
const PublicFacultyProfile = lazy(() => import('./pages/PublicFacultyProfile'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const VerifyCertificate = lazy(() => import('./pages/VerifyCertificate'));
const SharedItem = lazy(() => import('./pages/SharedItem'));
const Login = lazy(() => import('./pages/Login'));
const StaffLogin = lazy(() => import('./pages/StaffLogin'));
const StaffForgotPassword = lazy(() => import('./pages/StaffForgotPassword'));
const StaffResetPassword = lazy(() => import('./pages/StaffResetPassword'));
const StaffTwoFactor = lazy(() => import('./pages/StaffTwoFactor'));
const Register = lazy(() => import('./pages/Register'));
const GoogleComplete = lazy(() => import('./pages/GoogleComplete'));
const RestoreDeletedAccount = lazy(() => import('./pages/RestoreDeletedAccount'));
const RecoverOldAccount = lazy(() => import('./pages/RecoverOldAccount'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const CopyCode = lazy(() => import('./pages/CopyCode'));
const TwoFactor = lazy(() => import('./pages/TwoFactor'));
const AccountRecovery = lazy(() => import('./pages/AccountRecovery'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ConfirmEmailChange = lazy(() => import('./pages/ConfirmEmailChange'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminUserDetails = lazy(() => import('./pages/admin/AdminUserDetails'));
const AdminRoles = lazy(() => import('./pages/admin/AdminRoles'));
const AdminUniversityDetails = lazy(() => import('./pages/admin/AdminUniversityDetails'));
const AdminProjectDetails = lazy(() => import('./pages/admin/AdminProjectDetails'));
const AdminTeam = lazy(() => import('./pages/admin/AdminTeam'));
const AdminUniversities = lazy(() => import('./pages/admin/AdminUniversities'));
const AdminApprovals = lazy(() => import('./pages/admin/AdminApprovals'));
const AdminSystemActivity = lazy(() => import('./pages/admin/AdminSystemActivity'));
const AdminProjects = lazy(() => import('./pages/admin/AdminProjects'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const DataAnalysisReports = lazy(() => import('./pages/data-analysis/DataAnalysisReports'));
const DataAnalysisDashboards = lazy(() => import('./pages/data-analysis/DataAnalysisDashboards'));
const DataAnalysisQueryBuilder = lazy(() => import('./pages/data-analysis/DataAnalysisQueryBuilder'));
const DataAnalysisKpis = lazy(() => import('./pages/data-analysis/DataAnalysisKpis'));
const DataAnalysisExports = lazy(() => import('./pages/data-analysis/DataAnalysisExports'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminAttendanceSettings = lazy(() => import('./pages/admin/AdminAttendanceSettings'));
const AdminFeaturedProjects = lazy(() => import('./pages/admin/AdminFeaturedProjects'));
const AdminAnalyticsDashboard = lazy(() => import('./pages/admin/AdminAnalyticsDashboard'));
const AdminStatistics = lazy(() => import('./pages/admin/AdminStatistics'));
const AdminMobile = lazy(() => import('./pages/admin/AdminMobile'));
const AdminMobileTokenDetail = lazy(() => import('./pages/admin/AdminMobileTokenDetail'));
const AdminPlatformPolicy = lazy(() => import('./pages/admin/AdminPlatformPolicy'));
const AdminNotificationSettings = lazy(() => import('./pages/admin/AdminNotificationSettings'));
const AdminMessagingOversight = lazy(() => import('./pages/admin/AdminMessagingOversight'));
const AdminMessagingConversation = lazy(() => import('./pages/admin/AdminMessagingConversation'));
const AdminAiConversations = lazy(() => import('./pages/admin/AdminAiConversations'));
const AdminAiConversation = lazy(() => import('./pages/admin/AdminAiConversation'));
const AdminMessagingAnalytics = lazy(() => import('./pages/admin/AdminMessagingAnalytics'));
const AdminMessagingSettings = lazy(() => import('./pages/admin/AdminMessagingSettings'));
const AdminAiCodeReview = lazy(() => import('./pages/admin/AdminAiCodeReview'));
const AdminAiCodeReviewHistory = lazy(() => import('./pages/admin/AdminAiCodeReviewHistory'));
const AdminAiCodeReviewCompare = lazy(() => import('./pages/admin/AdminAiCodeReviewCompare'));
const AdminSearchResults = lazy(() => import('./pages/admin/AdminSearchResults'));
const AdminAiAssistantSettings = lazy(() => import('./pages/admin/AdminAiAssistantSettings'));
const AdminFaqIntents = lazy(() => import('./pages/admin/AdminFaqIntents'));
const DataAnalysisDashboard = lazy(() => import('./pages/data-analysis/DataAnalysisDashboard'));
const DataAnalysisSettings = lazy(() => import('./pages/data-analysis/DataAnalysisSettings'));
const DataAnalysisSegments = lazy(() => import('./pages/data-analysis/DataAnalysisSegments'));
const DataAnalysisReportFiles = lazy(() => import('./pages/data-analysis/DataAnalysisReportFiles'));
const DataAnalysisWorkspace = lazy(() => import('./pages/data-analysis/DataAnalysisWorkspace'));
const DataAnalysisDataQuality = lazy(() => import('./pages/data-analysis/DataAnalysisDataQuality'));
const DataAnalysisExplorer = lazy(() => import('./pages/data-analysis/DataAnalysisExplorer'));
const DataAnalysisExplorerShow = lazy(() => import('./pages/data-analysis/DataAnalysisExplorerShow'));
const DataAnalysisAdvancedAnalytics = lazy(() => import('./pages/data-analysis/DataAnalysisAdvancedAnalytics'));
const DataAnalysisAdvancedAnalyticsShow = lazy(() => import('./pages/data-analysis/DataAnalysisAdvancedAnalyticsShow'));
const DataAnalysisForecasting = lazy(() => import('./pages/data-analysis/DataAnalysisForecasting'));
const DataAnalysisForecastingShow = lazy(() => import('./pages/data-analysis/DataAnalysisForecastingShow'));
const DataAnalysisSearchResults = lazy(() => import('./pages/data-analysis/DataAnalysisSearchResults'));
const DataAnalysisExamAnalytics = lazy(() => import('./pages/data-analysis/DataAnalysisExamAnalytics'));
const DataAnalysisAiInsights = lazy(() => import('./pages/data-analysis/DataAnalysisAiInsights'));
const SecurityDashboard = lazy(() => import('./pages/security/SecurityDashboard'));
const SecurityIncidents = lazy(() => import('./pages/security/SecurityIncidents'));
const SecurityIncidentShow = lazy(() => import('./pages/security/SecurityIncidentShow'));
const SecurityVulnerabilities = lazy(() => import('./pages/security/SecurityVulnerabilities'));
const SecurityAlerts = lazy(() => import('./pages/security/SecurityAlerts'));
const SecuritySessions = lazy(() => import('./pages/security/SecuritySessions'));
const SecurityLogs = lazy(() => import('./pages/security/SecurityLogs'));
const SecurityPolicies = lazy(() => import('./pages/security/SecurityPolicies'));
const SecurityReports = lazy(() => import('./pages/security/SecurityReports'));
const SecurityReportFiles = lazy(() => import('./pages/security/SecurityReportFiles'));
const SecuritySettings = lazy(() => import('./pages/security/SecuritySettings'));
const SecuritySearch = lazy(() => import('./pages/security/SecuritySearch'));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const StudentMyExams = lazy(() => import('./pages/student/StudentMyExams'));
const StudentCourses = lazy(() => import('./pages/student/StudentCourses'));
const StudentTimetable = lazy(() => import('./pages/student/StudentTimetable'));
const StudentAttendance = lazy(() => import('./pages/student/StudentAttendance'));
const UniversityCourses = lazy(() => import('./pages/university/UniversityCourses'));
const UniversityTimetable = lazy(() => import('./pages/university/UniversityTimetable'));
const UniversityAttendance = lazy(() => import('./pages/university/UniversityAttendance'));
const FacultyCourses = lazy(() => import('./pages/faculty/FacultyCourses'));
const FacultyTimetable = lazy(() => import('./pages/faculty/FacultyTimetable'));
const FacultyAttendance = lazy(() => import('./pages/faculty/FacultyAttendance'));
const AcademicStaffProjects = lazy(() => import('./pages/academic-staff/AcademicStaffProjects'));
const AcademicStaffProjectDetail = lazy(() => import('./pages/academic-staff/AcademicStaffProjectDetail'));
const CourseContentPage = lazy(() => import('./pages/courses/CourseContentPage'));
const AcademicStaffCourses = lazy(() => import('./pages/academic-staff/AcademicStaffCourses'));
const AcademicStaffTimetable = lazy(() => import('./pages/academic-staff/AcademicStaffTimetable'));
const AcademicStaffAttendance = lazy(() => import('./pages/academic-staff/AcademicStaffAttendance'));
const StudentExamDetail = lazy(() => import('./pages/student/StudentExamDetail'));
const StudentExamAttempt = lazy(() => import('./pages/student/StudentExamAttempt'));
const StudentExamResult = lazy(() => import('./pages/student/StudentExamResult'));
const StudentSettings = lazy(() => import('./pages/student/StudentSettings'));
const StudentFeed = lazy(() => import('./pages/student/StudentFeed'));
const StudentGroupHub = lazy(() => import('./pages/student/StudentGroupHub'));
const StudentAnnouncements = lazy(() => import('./pages/student/StudentAnnouncements'));
const StudentContacts = lazy(() => import('./pages/student/StudentContacts'));
const StudentPortfolio = lazy(() => import('./pages/student/StudentPortfolio'));
const StudentMyPC = lazy(() => import('./pages/student/StudentMyPC'));
const DesktopOS = lazy(() => import('./desktop/DesktopOS'));
const StudentGraduation = lazy(() => import('./pages/student/StudentGraduation'));
const StudentGraduationTranscript = lazy(() => import('./pages/student/StudentGraduationTranscript'));
const StudentGraduationCertificate = lazy(() => import('./pages/student/StudentGraduationCertificate'));
const StudentGroupChat = lazy(() => import('./pages/student/StudentGroupChat'));
const StudentPatents = lazy(() => import('./pages/student/StudentPatents'));
const StudentProjects = lazy(() => import('./pages/student/StudentProjects'));
const StudentProjectCreate = lazy(() => import('./pages/student/StudentProjectCreate'));
const StudentProjectDetail = lazy(() => import('./pages/student/StudentProjectDetail'));
const StudentProjectEdit = lazy(() => import('./pages/student/StudentProjectEdit'));
const StudentProfile = lazy(() => import('./pages/student/StudentProfile'));
const StudentDiscovery = lazy(() => import('./pages/student/StudentDiscovery'));
const StudentGitHub = lazy(() => import('./pages/student/StudentGitHub'));
const StudentAIAnalysis = lazy(() => import('./pages/student/StudentAIAnalysis'));
const SupervisorDashboard = lazy(() => import('./pages/supervisor/SupervisorDashboard'));
const SupervisorStudents = lazy(() => import('./pages/supervisor/SupervisorStudents'));
const SupervisorProjects = lazy(() => import('./pages/supervisor/SupervisorProjects'));
const SupervisorProjectGrade = lazy(() => import('./pages/supervisor/SupervisorProjectGrade'));
const SupervisorSettings = lazy(() => import('./pages/supervisor/SupervisorSettings'));
const UniversitySettings = lazy(() => import('./pages/university/UniversitySettings'));
const UniversityDashboard = lazy(() => import('./pages/university/UniversityDashboard'));
const UniversityApprovals = lazy(() => import('./pages/university/UniversityApprovals'));
const UniversityProjectView = lazy(() => import('./pages/university/UniversityProjectView'));
const UniversityStudents = lazy(() => import('./pages/university/UniversityStudents'));
const UniversitySupervisors = lazy(() => import('./pages/university/UniversitySupervisors'));
const UniversityFaculties = lazy(() => import('./pages/university/UniversityFaculties'));
const UniversityFacultyPortfolio = lazy(() => import('./pages/university/UniversityFacultyPortfolio'));
const UniversityDepartmentPortfolio = lazy(() => import('./pages/university/UniversityDepartmentPortfolio'));
const UniversityAcademicStaff = lazy(() => import('./pages/university/UniversityAcademicStaff'));
const UniversityReports = lazy(() => import('./pages/university/UniversityReports'));
const UniversityAnalytics = lazy(() => import('./pages/university/UniversityAnalytics'));
const UniversityAnnouncements = lazy(() => import('./pages/university/UniversityAnnouncements'));
const UniversityFeed = lazy(() => import('./pages/university/UniversityFeed'));
const ChatReports = lazy(() => import('./pages/ChatReports'));
const UniversityFeedReports = lazy(() => import('./pages/university/UniversityFeedReports'));
const UniversityGraduation = lazy(() => import('./pages/university/UniversityGraduation'));
const UniversityGraduationReview = lazy(() => import('./pages/university/UniversityGraduationReview'));
const UniversityGraduationEdit = lazy(() => import('./pages/university/UniversityGraduationEdit'));
const UniversityGraduationCertificate = lazy(() => import('./pages/university/UniversityGraduationCertificate'));
const UniversityPortfolio = lazy(() => import('./pages/university/UniversityPortfolio'));
const UniversityJoinRequests = lazy(() => import('./pages/university/UniversityJoinRequests'));
const UniversityVerification = lazy(() => import('./pages/university/UniversityVerification'));
const UniversityProfile = lazy(() => import('./pages/university/UniversityProfile'));
const AcademicStaffDashboard = lazy(() => import('./pages/academic-staff/AcademicStaffDashboard'));
const AcademicStaffQuestionBanks = lazy(() => import('./pages/academic-staff/AcademicStaffQuestionBanks'));
const AcademicStaffQuestionBankDetail = lazy(() => import('./pages/academic-staff/AcademicStaffQuestionBankDetail'));
const AcademicStaffExams = lazy(() => import('./pages/academic-staff/AcademicStaffExams'));
const AcademicStaffExamBuilder = lazy(() => import('./pages/academic-staff/AcademicStaffExamBuilder'));
const AcademicStaffExamWizard = lazy(() => import('./pages/academic-staff/AcademicStaffExamWizard'));
const AcademicStaffExamDetail = lazy(() => import('./pages/academic-staff/AcademicStaffExamDetail'));
const AcademicStaffExamTargets = lazy(() => import('./pages/academic-staff/AcademicStaffExamTargets'));
const AcademicStaffExamAttempts = lazy(() => import('./pages/academic-staff/AcademicStaffExamAttempts'));
const AcademicStaffExamAnalytics = lazy(() => import('./pages/academic-staff/AcademicStaffExamAnalytics'));
const AcademicStaffExamGrading = lazy(() => import('./pages/academic-staff/AcademicStaffExamGrading'));
const AcademicStaffExamSimilarity = lazy(() => import('./pages/academic-staff/AcademicStaffExamSimilarity'));
const AcademicStaffExamAppeals = lazy(() => import('./pages/academic-staff/AcademicStaffExamAppeals'));
const AcademicStaffAttemptsHub = lazy(() => import('./pages/academic-staff/AcademicStaffAttemptsHub'));
const AcademicStaffTargetsHub = lazy(() => import('./pages/academic-staff/AcademicStaffTargetsHub'));
const AcademicStaffAnalyticsHub = lazy(() => import('./pages/academic-staff/AcademicStaffAnalyticsHub'));
const AcademicStaffResults = lazy(() => import('./pages/academic-staff/AcademicStaffResults'));
const AcademicStaffStudentResults = lazy(() => import('./pages/academic-staff/AcademicStaffStudentResults'));
const AcademicStaffExports = lazy(() => import('./pages/academic-staff/AcademicStaffExports'));
const AcademicStaffSettings = lazy(() => import('./pages/academic-staff/AcademicStaffSettings'));
const AcademicStaffPortfolio = lazy(() => import('./pages/academic-staff/AcademicStaffPortfolio'));
const AcademicStaffSearchResults = lazy(() => import('./pages/academic-staff/AcademicStaffSearchResults'));
const FacultyDashboard = lazy(() => import('./pages/faculty/FacultyDashboard'));
const FacultyApprovals = lazy(() => import('./pages/faculty/FacultyApprovals'));
const FacultyProjectView = lazy(() => import('./pages/faculty/FacultyProjectView'));
const FacultyStudents = lazy(() => import('./pages/faculty/FacultyStudents'));
const FacultyAcademicStaff = lazy(() => import('./pages/faculty/FacultyAcademicStaff'));
const FacultySettings = lazy(() => import('./pages/faculty/FacultySettings'));
const FacultyGraduation = lazy(() => import('./pages/faculty/FacultyGraduation'));
const FacultyProfile = lazy(() => import('./pages/faculty/FacultyProfile'));
const FacultyPortfolio = lazy(() => import('./pages/faculty/FacultyPortfolio'));
// Shared Public Profile page for portals that had no share link (supervisor, admin, data analyst, security).
const PublicProfileEditor = lazy(() => import('./pages/PublicProfileEditor'));
const FacultyGraduationReview = lazy(() => import('./pages/faculty/FacultyGraduationReview'));
const FacultyGraduationEdit = lazy(() => import('./pages/faculty/FacultyGraduationEdit'));
const FacultyGraduationCertificate = lazy(() => import('./pages/faculty/FacultyGraduationCertificate'));
const Messages = lazy(() => import('./pages/Messages'));
const MessagesRoute = lazy(() => import('./pages/MessagesRoute'));
const JoinGroup = lazy(() => import('./pages/JoinGroup'));
const Notifications = lazy(() => import('./pages/Notifications'));

export default function App() {
  usePlatformInspectGuard(); // blocks Ctrl+U / Ctrl+Shift+I,J,C,K… everywhere (F12, right-click, copy/paste untouched)
  // Count this visit (every page load) no matter which page the link opens.
  useEffect(() => { registerVisit(); }, []);

  return (
    <BrowserRouter>
      <BackStackManager />
      <LanguageProvider>
      <ThemeProvider>
        {/* Device restrictions policy: a blocked device type sees the "blocked" page instead of the platform. */}
        <DeviceGate>
        <AuthProvider>
          <AccountSettingsSync />
          <SaveCenterHost />
          {/* MFA requirements policy: a role that must have 2FA (grace period over) sees the setup page instead of the app. */}
          <MfaGate>
          <ErrorBoundary>
          <Suspense fallback={<PageLoading />}>
          <Routes>
            {/* Public — no auth required. Same pages as the PHP-rendered
                '/', '/projects', '/projects/{slug}' routes in routes/web.php,
                talking to GET /api/v1/public/* (PublicApiController) instead
                of server-rendering. Landing itself redirects an already-
                authenticated visitor to /dashboard (see Landing.jsx). */}
            <Route path="/" element={<Landing />} />
            <Route path="/projects" element={<ProjectsShowcase />} />
            <Route path="/projects/:slug" element={<ProjectDetail />} />
            <Route path="/p/:uuid" element={<PublicPortfolio />} />
            <Route path="/u/:uuid" element={<PublicUniversityProfile />} />
            <Route path="/universities/:universitySlug/faculties/:facultySlug" element={<PublicFacultyProfile />} />
            <Route path="/403" element={<Forbidden />} />
            <Route path="/500" element={<ServerError />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/verify-certificate" element={<VerifyCertificate />} />
            {/* My PC share link — public, no sign-in (GET /api/v1/public/drive-share/{token}) */}
            <Route path="/s/:token" element={<SharedItem />} />

            <Route path="/auth/login" element={<Login />} />
            {/* Hidden staff sign-in (admin / data analyst / security): not linked anywhere. */}
            <Route path={STAFF_LOGIN_PATH} element={<StaffGate><StaffLogin /></StaffGate>} />
            <Route path={`${STAFF_LOGIN_PATH}/forgot-password`} element={<StaffGate><StaffForgotPassword /></StaffGate>} />
            <Route path={`${STAFF_LOGIN_PATH}/reset-password`} element={<StaffResetPassword />} />
            <Route path={`${STAFF_LOGIN_PATH}/two-factor`} element={<StaffTwoFactor />} />
            <Route path="/auth/register" element={<Register />} />
            <Route path="/auth/google/complete" element={<GoogleComplete />} />
            <Route path="/auth/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/auth/copy-code" element={<CopyCode />} />
            <Route path="/auth/two-factor" element={<TwoFactor />} />
            <Route path="/auth/recover-account" element={<AccountRecovery />} />
            <Route path="/auth/restore-account" element={<RestoreDeletedAccount />} />
            <Route path={`${STAFF_LOGIN_PATH}/recover-account`} element={<AccountRecovery portal="staff" />} />
            <Route path="/auth/verify-email" element={<VerifyEmail />} />
            <Route path="/auth/confirm-email-change" element={<ConfirmEmailChange />} />
            <Route path="/auth/select-role" element={<Navigate to="/auth/register" replace />} />

            <Route element={<ProtectedRoute />}>
              {/* Standalone printer-friendly pages — no sidebar/header,
                  same convention as security/logs-print.php. */}
              <Route path="/student/graduation/transcript" element={<StudentGraduationTranscript />} />
              <Route path="/student/graduation/certificate" element={<StudentGraduationCertificate />} />
              {/* Group invite link: /join/group/:token (messaging). Guests sign in first, then come back here. */}
              <Route path="/join/group/:token" element={<JoinGroup />} />

              <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/account/recover-data" element={<RecoverOldAccount />} />

                {/* Student Portal home — mirrors app/Views/student/dashboard.php,
                    backed by the same GET /api/v1/students/dashboard-stats
                    (App\Controllers\Api\StudentsApiController::dashboardStats())
                    used by Student\StudentDashboardController::index(). Matches
                    config/roles.php's home_route for 'student'. */}
                <Route path="/student/dashboard" element={<StudentDashboard />} />
                {/* Student side of the Exam & Assessment System, Round 2 —
                    GET /api/v1/exam-system/my-exams[/:id]
                    (StudentExamApiController -> StudentExamService), see
                    EXAM_SYSTEM_API.md. Metadata only, no question content
                    and no "start attempt" yet — that's Round 3
                    (exam_attempts). */}
                <Route path="/student/courses" element={<StudentCourses />} />
                <Route path="/student/timetable" element={<StudentTimetable />} />
                <Route path="/student/attendance" element={<StudentAttendance />} />
                <Route path="/student/courses/:id/content" element={<CourseContentPage role="student" />} />
                <Route path="/student/my-exams" element={<StudentMyExams />} />
                <Route path="/student/my-exams/:id" element={<StudentExamDetail />} />
                {/* Round 3 — attempts + timer + auto-save + submit, and the
                    student's own result view for one attempt. */}
                <Route path="/student/exam-attempt/:id" element={<StudentExamAttempt />} />
                <Route path="/student/exam-attempt/:id/result" element={<StudentExamResult />} />
                {/* Student Portal profile — was missing (Topbar's generic
                    `/${role}/profile` link had nowhere to go for `student`),
                    unlike every other role. Mirrors app/Views/student/profile.php,
                    backed by GET/PATCH /api/v1/students/me + POST
                    /api/v1/students/me/avatar + POST /api/v1/students/me/join-request
                    (App\Http\Controllers\Api\StudentsApiController). */}
                <Route path="/student/profile" element={<StudentProfile />} />
                <Route path="/student/feed" element={<StudentFeed />} />
                <Route path="/student/announcements" element={<StudentAnnouncements />} />
                <Route path="/student/group-hub" element={<StudentGroupHub />} />
                <Route path="/student/contacts" element={<StudentContacts />} />
                <Route path="/student/portfolio" element={<StudentPortfolio />} />
                <Route path="/student/my-pc" element={<DesktopOS />} />
                <Route path="/student/my-pc/classic" element={<StudentMyPC />} />
                <Route path="/student/graduation" element={<StudentGraduation />} />
                <Route path="/student/group-chat" element={<StudentGroupChat />} />
                <Route path="/student/patents" element={<StudentPatents />} />
                <Route path="/student/projects" element={<StudentProjects />} />
                <Route path="/student/projects/create" element={<StudentProjectCreate />} />
                <Route path="/student/projects/:id" element={<StudentProjectDetail />} />
                <Route path="/student/projects/:id/edit" element={<StudentProjectEdit />} />
                <Route path="/student/ai-analysis" element={<StudentAIAnalysis />} />
                <Route path="/student/discovery" element={<StudentDiscovery />} />
                <Route path="/student/github" element={<StudentGitHub />} />

                {/* Settings — one page per portal (each backed by its own
                    /api/v1/{portal}/settings/* controller — the field set
                    differs too much per role to share one component, unlike
                    Messages/Notifications). University is the one exception:
                    it has no dedicated SettingsApiController, but the same
                    fields (profile/logo/preferences/notifications) already
                    have a JSON surface at /api/v1/universities/me* — see
                    UniversitySettings.jsx's docblock. */}
                {/* Admin — one dedicated page per section (each backed by its
                    own /api/v1/admin/* controller, added alongside these
                    pages where the backend was previously server-rendered
                    only — see each page's docblock for exactly which
                    repository/service calls it reuses). */}
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/profile" element={<Navigate to="/admin/settings?section=profile" replace />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/users/:uuid" element={<AdminUserDetails />} />
                <Route path="/admin/roles" element={<AdminRoles />} />
                <Route path="/admin/team" element={<AdminTeam />} />
                <Route path="/admin/universities" element={<AdminUniversities />} />
                <Route path="/admin/universities/:id" element={<AdminUniversityDetails />} />
                <Route path="/admin/approvals" element={<AdminApprovals />} />
                <Route path="/admin/activity" element={<AdminSystemActivity />} />
                <Route path="/admin/security-logs" element={<AdminSystemActivity initialTab="security" />} />
                <Route path="/admin/projects" element={<AdminProjects />} />
                <Route path="/admin/projects/:id" element={<AdminProjectDetails />} />
                <Route path="/admin/audit-logs" element={<AdminSystemActivity initialTab="audit" />} />
                <Route path="/admin/reports" element={<AdminReports />} />

                {/* Data Analysis Portal — the data_analyst role's OWN
                    portal (backend home_route '/data-analysis/dashboard',
                    portal_prefixes 'data-analysis' => [data_analyst, admin]
                    — see config/roles.php). Admin still has server-side
                    access via each controller's isDataAnalyst() gate
                    (data_analyst OR admin), but there is no separate
                    /admin/data-analysis/* route tree in the SPA — this is
                    the one and only place these pages are mounted.
                    Dashboard, Settings, and Segments are new pages backed
                    by newly-added/newly-registered endpoints — see their
                    own docblocks. */}
                <Route path="/data-analysis/dashboard" element={<DataAnalysisDashboard />} />
                <Route path="/data-analysis/reports" element={<DataAnalysisReports />} />
                <Route path="/data-analysis/dashboards" element={<DataAnalysisDashboards />} />
                <Route path="/data-analysis/queries" element={<DataAnalysisQueryBuilder />} />
                <Route path="/data-analysis/kpis" element={<DataAnalysisKpis />} />
                <Route path="/data-analysis/exports" element={<DataAnalysisExports />} />
                <Route path="/data-analysis/settings" element={<DataAnalysisSettings />} />
                <Route path="/data-analysis/portfolio" element={<PublicProfileEditor />} />
                <Route path="/data-analysis/segments" element={<DataAnalysisSegments />} />
                <Route path="/data-analysis/report-files" element={<DataAnalysisReportFiles />} />
                <Route path="/data-analysis/workspace" element={<DataAnalysisWorkspace />} />

                {/* Data Analysis Portal — React migration continuation:
                    Data Quality Center, Data Explorer, Advanced Analytics,
                    Forecasting, Search Results, AI Insights. Each talks to
                    its own real /api/v1/data-analysis/* JSON controller,
                    wrapping the exact same service the server-rendered
                    view (app/Views/data-analysis/<section>/*.php) already
                    used — see each component's own docblock. */}
                <Route path="/data-analysis/data-quality" element={<DataAnalysisDataQuality />} />
                <Route path="/data-analysis/data-explorer" element={<DataAnalysisExplorer />} />
                <Route path="/data-analysis/data-explorer/:key" element={<DataAnalysisExplorerShow />} />
                <Route path="/data-analysis/advanced-analytics" element={<DataAnalysisAdvancedAnalytics />} />
                <Route path="/data-analysis/advanced-analytics/:key" element={<DataAnalysisAdvancedAnalyticsShow />} />
                <Route path="/data-analysis/forecasting" element={<DataAnalysisForecasting />} />
                <Route path="/data-analysis/forecasting/:key" element={<DataAnalysisForecastingShow />} />
                <Route path="/data-analysis/search" element={<DataAnalysisSearchResults />} />
                <Route path="/data-analysis/exam-analytics" element={<DataAnalysisExamAnalytics />} />
                <Route path="/data-analysis/exam-analytics/:id" element={<DataAnalysisExamAnalytics />} />
                <Route path="/data-analysis/ai-insights" element={<DataAnalysisAiInsights />} />
                <Route path="/data-analysis/profile" element={<Navigate to="/data-analysis/settings?section=profile" replace />} />

                <Route path="/data-analysis/messages" element={<Messages />} />
                <Route path="/data-analysis/messages/:conversationId" element={<MessagesRoute />} />
                <Route path="/data-analysis/notifications" element={<Notifications />} />

                {/* Security Portal — own-portal home for security_admin/
                    security_officer (backend home_route '/security/dashboard',
                    portal_prefixes 'security_admin'/'security_officer' =>
                    'security' — see config/roles.php). Talks to the real
                    /api/v1/security/* JSON REST surface (Dashboard/
                    Incidents/Vulnerabilities/Alerts API controllers), which
                    reuse the exact same repositories/services the existing
                    server-rendered Security Portal already uses. Phase 1:
                    Dashboard, Incidents (list + detail), Vulnerabilities,
                    Alerts, Sessions, Audit & Security Logs, Policies,
                    Reports (generator), Report Files, and Settings
                    (+2FA, inline via the shared settings/shared.jsx
                    cards — same convention as Data Analysis Settings). */}
                <Route path="/security/dashboard" element={<SecurityDashboard />} />
                <Route path="/security/incidents" element={<SecurityIncidents />} />
                <Route path="/security/incidents/:id" element={<SecurityIncidentShow />} />
                <Route path="/security/vulnerabilities" element={<SecurityVulnerabilities />} />
                <Route path="/security/alerts" element={<SecurityAlerts />} />
                <Route path="/security/sessions" element={<SecuritySessions />} />
                <Route path="/security/logs" element={<SecurityLogs />} />
                <Route path="/security/policies" element={<SecurityPolicies />} />
                <Route path="/security/reports" element={<SecurityReports />} />
                <Route path="/security/report-files" element={<SecurityReportFiles />} />
                <Route path="/security/settings" element={<SecuritySettings />} />
                <Route path="/security/portfolio" element={<PublicProfileEditor />} />
                <Route path="/security/search" element={<SecuritySearch />} />
                <Route path="/security/profile" element={<Navigate to="/security/settings?section=profile" replace />} />
                <Route path="/security/messages" element={<Messages />} />
                <Route path="/security/messages/:conversationId" element={<MessagesRoute />} />
                <Route path="/security/notifications" element={<Notifications />} />

                <Route path="/admin/featured-projects" element={<AdminFeaturedProjects />} />
                <Route path="/admin/analytics" element={<AdminAnalyticsDashboard />} />
                <Route path="/admin/statistics" element={<AdminStatistics />} />
                <Route path="/admin/mobile" element={<AdminMobile />} />
                <Route path="/admin/mobile/:id" element={<AdminMobileTokenDetail />} />
                <Route path="/admin/platform-policy" element={<AdminPlatformPolicy />} />
                <Route path="/admin/attendance-settings" element={<AdminAttendanceSettings />} />
                <Route path="/admin/notifications/settings" element={<AdminNotificationSettings />} />
                <Route path="/admin/chat-reports" element={<ChatReports />} />
                <Route path="/admin/messaging/oversight" element={<AdminMessagingOversight />} />
                <Route path="/admin/messaging/oversight/:id" element={<AdminMessagingConversation />} />
                <Route path="/admin/messaging/ai" element={<AdminAiConversations />} />
                <Route path="/admin/messaging/ai/:id" element={<AdminAiConversation />} />
                <Route path="/admin/messaging/analytics" element={<AdminMessagingAnalytics />} />
                <Route path="/admin/messaging/settings" element={<AdminMessagingSettings />} />
                <Route path="/admin/ai-code-review" element={<AdminAiCodeReview />} />
                <Route path="/admin/ai-code-review/project/:projectId/history" element={<AdminAiCodeReviewHistory />} />
                <Route path="/admin/ai-code-review/compare/:idA/:idB" element={<AdminAiCodeReviewCompare />} />
                <Route path="/admin/ai-assistant-settings" element={<AdminAiAssistantSettings />} />
                <Route path="/admin/faq-intents" element={<AdminFaqIntents />} />

                <Route path="/admin/search" element={<AdminSearchResults />} />

                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/admin/portfolio" element={<PublicProfileEditor />} />
                <Route path="/student/settings" element={<StudentSettings />} />

                {/* بند 9 (Supervisors)، جزء 3 — بورتال المشرف الشخصي.
                    بيطابق app/Controllers/Supervisor/* القديمة (Blade-only)
                    ضد SupervisorDashboardApiController/
                    SupervisorStudentsApiController/
                    SupervisorProjectsApiController الجديدة. messages/
                    notifications دلوقتي مسجلين زي أي بورتال تاني — بند
                    18/19 (Messaging/Notifications) شغالين فعليًا عبر سطح
                    /api/v1/messaging و/api/v1/notifications المشترك
                    (uip.auth بس، من غير قيد role)، فمفيش سبب يفضلوا مقفولين
                    هنا؛ navConfig.js override اتشال. */}
                <Route path="/supervisor/dashboard" element={<SupervisorDashboard />} />
                <Route path="/supervisor/students" element={<SupervisorStudents />} />
                <Route path="/supervisor/projects" element={<SupervisorProjects />} />
                {/* بند 14 (Graduation) — rubric grading، شوف SupervisorProjectGradeApiController الجديدة. */}
                <Route path="/supervisor/projects/:id/grade" element={<SupervisorProjectGrade />} />
                <Route path="/supervisor/settings" element={<SupervisorSettings />} />
                <Route path="/supervisor/profile" element={<Navigate to="/supervisor/settings?section=profile" replace />} />
                <Route path="/supervisor/portfolio" element={<PublicProfileEditor />} />
                <Route path="/supervisor/messages" element={<Messages />} />
                <Route path="/supervisor/messages/:conversationId" element={<MessagesRoute />} />
                <Route path="/supervisor/notifications" element={<Notifications />} />







                <Route path="/university/settings" element={<UniversitySettings />} />

                {/* University Portal home — mirrors app/Views/university/dashboard.php,
                    talking to GET /api/v1/dashboards/overview (DashboardsApiController::
                    universityOverview()), the same source-of-truth
                    University\UniversityDashboardController::index() uses. */}
                <Route path="/university/dashboard" element={<UniversityDashboard />} />
                <Route path="/university/approvals" element={<UniversityApprovals />} />
                <Route path="/university/approvals/:id" element={<UniversityProjectView />} />
                <Route path="/university/students" element={<UniversityStudents />} />
                <Route path="/university/supervisors" element={<UniversitySupervisors />} />
                <Route path="/university/faculties" element={<UniversityFaculties />} />
                <Route path="/university/faculties/:id/portfolio" element={<UniversityFacultyPortfolio />} />
                <Route path="/university/departments/:id/portfolio" element={<UniversityDepartmentPortfolio />} />
                <Route path="/university/academic-staff" element={<UniversityAcademicStaff />} />
                <Route path="/university/courses" element={<UniversityCourses />} />
                <Route path="/university/timetable" element={<UniversityTimetable />} />
                <Route path="/university/attendance" element={<UniversityAttendance />} />
                <Route path="/university/courses/:id/content" element={<CourseContentPage role="university" />} />
                <Route path="/university/reports" element={<UniversityReports />} />
                <Route path="/university/analytics" element={<UniversityAnalytics />} />
                <Route path="/university/announcements" element={<UniversityAnnouncements />} />
                <Route path="/university/feed" element={<UniversityFeed />} />
                <Route path="/university/feed/reports" element={<UniversityFeedReports />} />
                <Route path="/university/chat-reports" element={<ChatReports />} />
                <Route path="/university/graduation" element={<UniversityGraduation />} />
                <Route path="/university/graduation/:id/review" element={<UniversityGraduationReview />} />
                <Route path="/university/graduation/:id/edit" element={<UniversityGraduationEdit />} />
                <Route path="/university/graduation/:id/certificate" element={<UniversityGraduationCertificate />} />
                <Route path="/university/portfolio" element={<UniversityPortfolio />} />
                <Route path="/university/join-requests" element={<UniversityJoinRequests />} />
                <Route path="/university/verification" element={<UniversityVerification />} />
                <Route path="/university/profile" element={<UniversityProfile />} />

                {/* Faculty Portal home — mirrors app/Views/faculty/dashboard.php,
                    talking to GET /api/v1/dashboards/overview (DashboardsApiController::
                    facultyOverview()), the same source-of-truth
                    Faculty\FacultyDashboardController::index() uses.
                    Academic Staff/Settings/Graduation pages still to come —
                    see FacultyApprovalsApiController's docblock for the
                    backend surface, already fully registered. */}
                <Route path="/faculty/dashboard" element={<FacultyDashboard />} />
                <Route path="/faculty/approvals" element={<FacultyApprovals />} />
                <Route path="/faculty/approvals/:id" element={<FacultyProjectView />} />
                <Route path="/faculty/students" element={<FacultyStudents />} />
                <Route path="/faculty/academic-staff" element={<FacultyAcademicStaff />} />
                <Route path="/faculty/courses" element={<FacultyCourses />} />
                <Route path="/faculty/timetable" element={<FacultyTimetable />} />
                <Route path="/faculty/attendance" element={<FacultyAttendance />} />
                <Route path="/faculty/courses/:id/content" element={<CourseContentPage role="faculty" />} />
                <Route path="/faculty/chat-reports" element={<ChatReports />} />
                <Route path="/faculty/settings" element={<FacultySettings />} />
                <Route path="/faculty/graduation" element={<FacultyGraduation />} />
                <Route path="/faculty/graduation/:id/review" element={<FacultyGraduationReview />} />
                <Route path="/faculty/graduation/:id/edit" element={<FacultyGraduationEdit />} />
                <Route path="/faculty/graduation/:id/certificate" element={<FacultyGraduationCertificate />} />
                <Route path="/faculty/portfolio" element={<FacultyPortfolio />} />
                <Route path="/faculty/profile" element={<FacultyProfile />} />

                {/* Academic Staff Portal — Exam & Assessment System, Round 1
                    (Foundation) + Round 2 (Targeting + Publish). First React
                    pages ever built for this role; no PHP view to mirror.
                    Talks to /api/v1/exam-system/{question-banks,exams}/* —
                    see EXAM_SYSTEM_API.md. Settings now has its own route
                    below (AcademicStaffSettingsApiController exists). Later
                    rounds (attempts, grading, security, AI grading, pools,
                    analytics/dashboards) add their own routes here as they
                    land. */}
                <Route path="/academic-staff/dashboard" element={<AcademicStaffDashboard />} />
                <Route path="/academic-staff/question-banks" element={<AcademicStaffQuestionBanks />} />
                <Route path="/academic-staff/question-banks/:id" element={<AcademicStaffQuestionBankDetail />} />
                <Route path="/academic-staff/courses" element={<AcademicStaffCourses />} />
                <Route path="/academic-staff/timetable" element={<AcademicStaffTimetable />} />
                <Route path="/academic-staff/attendance" element={<AcademicStaffAttendance />} />
                <Route path="/academic-staff/courses/:id/content" element={<CourseContentPage role="academic_staff" />} />
                <Route path="/academic-staff/projects" element={<AcademicStaffProjects />} />
                <Route path="/academic-staff/projects/:id" element={<AcademicStaffProjectDetail />} />
                <Route path="/academic-staff/search" element={<AcademicStaffSearchResults />} />
                <Route path="/academic-staff/exams" element={<AcademicStaffExams />} />
                <Route path="/academic-staff/exams/create" element={<AcademicStaffExamWizard />} />
                <Route path="/academic-staff/exams/:id" element={<AcademicStaffExamDetail />} />
                <Route path="/academic-staff/exams/:id/edit" element={<AcademicStaffExamWizard />} />
                {/* Legacy builder kept reachable while the wizard replaces it. */}
                <Route path="/academic-staff/exams/:id/builder" element={<AcademicStaffExamBuilder />} />
                <Route path="/academic-staff/exams/:id/targets" element={<AcademicStaffExamTargets />} />
                {/* Round 4 — attempts list w/ grading progress, and the
                    per-attempt manual grading + history screen. */}
                <Route path="/academic-staff/exams/:id/attempts" element={<AcademicStaffExamAttempts />} />
                <Route path="/academic-staff/exams/:id/attempts/:attemptId" element={<AcademicStaffExamGrading />} />
                <Route path="/academic-staff/exams/:id/similarity" element={<AcademicStaffExamSimilarity />} />
                <Route path="/academic-staff/exams/:id/appeals" element={<AcademicStaffExamAppeals />} />
                {/* Round 8 — exam-level + question-level analytics. */}
                <Route path="/academic-staff/exams/:id/analytics" element={<AcademicStaffExamAnalytics />} />
                {/* Sidebar-level hub pages: pick an exam, then jump straight
                    into its attempts/targets/analytics page. Added so those
                    three have a permanent entry point in the Sidebar itself,
                    instead of only being reachable from inside a specific
                    exam's builder. See AcademicStaffExamPicker.jsx. */}
                <Route path="/academic-staff/attempts" element={<AcademicStaffAttemptsHub />} />
                <Route path="/academic-staff/targets" element={<AcademicStaffTargetsHub />} />
                <Route path="/academic-staff/analytics" element={<AcademicStaffAnalyticsHub />} />
                {/* Results / Students' Results / Reports — sidebar entries (exam-system/results/* API). */}
                <Route path="/academic-staff/results" element={<AcademicStaffResults />} />
                <Route path="/academic-staff/students-results" element={<AcademicStaffStudentResults />} />
                <Route path="/academic-staff/exports" element={<AcademicStaffExports />} />
                <Route path="/academic-staff/reports" element={<Navigate to="/academic-staff/exports" replace />} />
                {/* Settings — AcademicStaffSettingsApiController now exists
                    (previously locked "Soon" in the Sidebar; see
                    ACCOUNT_ITEM_OVERRIDES.academic_staff removal in
                    navConfig.js). Registered here rather than alongside
                    the shared Messages/Notifications routes below since
                    every portal's Settings page/component is its own
                    (unlike Messages/Notifications which share one). */}
                <Route path="/academic-staff/settings" element={<AcademicStaffSettings />} />
                <Route path="/academic-staff/profile" element={<Navigate to="/academic-staff/settings?section=profile" replace />} />
                {/* Public Profile / share link — reuses the same
                    role-agnostic /api/v1/portfolios/* PortfoliosApiController
                    StudentPortfolio.jsx talks to (docblock: "not gated to
                    one role"). AcademicStaffPortfolio.jsx drops the
                    Featured/Published Projects sections since academic
                    staff accounts can't own Projects (student
                    only) — headline/about/share-link only. Public page at
                    /p/{uuid} (PublicPortfolio.jsx) needs no change. */}
                <Route path="/academic-staff/portfolio" element={<AcademicStaffPortfolio />} />


                {/* Messages — one shared page/component (src/pages/Messages.jsx)
                    talking to the one shared /api/v1/messaging/* backend, same
                    "one system, portal only changes the URL prefix" convention
                    as the PHP app (app/Views/messaging/app.php). Every portal
                    gets its own route per navConfig.js's COMMON_ACCOUNT_ITEMS
                    (`/${role}/messages`), all pointing at the same component —
                    do NOT fork this per portal. */}
                <Route path="/student/messages" element={<Messages />} />
                <Route path="/student/messages/:conversationId" element={<MessagesRoute />} />
                <Route path="/university/messages" element={<Messages />} />
                <Route path="/university/messages/:conversationId" element={<MessagesRoute />} />
                <Route path="/faculty/messages" element={<Messages />} />
                <Route path="/faculty/messages/:conversationId" element={<MessagesRoute />} />
                <Route path="/admin/messages" element={<Messages />} />
                <Route path="/admin/messages/:conversationId" element={<MessagesRoute />} />
                <Route path="/academic-staff/messages" element={<Messages />} />
                <Route path="/academic-staff/messages/:conversationId" element={<MessagesRoute />} />

                {/* Notifications — same "one shared page/component talking to
                    one shared backend" convention as Messages above
                    (src/pages/Notifications.jsx + /api/v1/notifications/*,
                    App\Controllers\Api\NotificationsApiController). Every
                    portal gets its own route per navConfig.js's
                    COMMON_ACCOUNT_ITEMS (`/${role}/notifications`), all
                    pointing at the same component — do NOT fork this per
                    portal. */}
                <Route path="/student/notifications" element={<Notifications />} />
                <Route path="/university/notifications" element={<Notifications />} />
                <Route path="/faculty/notifications" element={<Notifications />} />
                <Route path="/admin/notifications" element={<Notifications />} />
                <Route path="/academic-staff/notifications" element={<Notifications />} />

                {/* Add each converted page here as its own <Route>. It
                    renders inside DashboardLayout's <Outlet/>, with the
                    sidebar/topbar/bottom-nav already wrapped around it. */}
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
          </MfaGate>
        </AuthProvider>
        </DeviceGate>
      </ThemeProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

