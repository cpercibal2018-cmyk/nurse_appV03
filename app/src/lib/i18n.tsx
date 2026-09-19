import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      appName: 'AIGH Nursing Workforce',
      dashboard: 'Dashboard',
      workforce: 'Workforce',
      departments: 'Departments',
      units: 'Nursing Units',
      positions: 'Positions',
      credentials: 'Credentials',
      eligibility: 'Eligibility',
      scheduling: 'Scheduling',
      notifications: 'Notifications',
      audit: 'Audit & Compliance',
      admin: 'Administration',
      observability: 'Observability',
      login: 'Login',
      logout: 'Logout',
      language: 'Language',
      english: 'English',
      arabic: 'العربية',
      search: 'Search',
      add: 'Add',
      edit: 'Edit',
      delete: 'Delete',
      save: 'Save',
      cancel: 'Cancel',
      totalBeds: 'Total Beds',
      totalUnits: 'Total Units',
      totalEmployees: 'Total Employees',
      eligible: 'Eligible',
      ineligible: 'Ineligible',
      grace: 'Grace Period',
      baseline: 'Baseline',
      configured: 'Configured',
      overview: 'System Overview',
      welcome: 'Welcome to AIGH Nursing Workforce Management System',
      description: 'Comprehensive platform for hospital nursing staff lifecycle management',
      quickActions: 'Quick Actions',
      onboardEmployee: 'Onboard Employee',
      manageUnits: 'Manage Units',
      viewEligibility: 'View Eligibility',
      systemHealth: 'System Health',
      backupStatus: 'Backup Status',
      scfhsSync: 'SCFHS Sync',
      eligibilityDrift: 'Eligibility Drift',
      recentActivities: 'Recent Activities',
      noData: 'No data available',
    }
  },
  ar: {
    translation: {
      appName: 'نظام إدارة القوى العاملة التمريضية',
      dashboard: 'لوحة التحكم',
      workforce: 'القوى العاملة',
      departments: 'الأقسام',
      units: 'وحدات التمريض',
      positions: 'المناصب',
      credentials: 'الشهادات',
      eligibility: 'الأهلية',
      scheduling: 'الجدولة',
      notifications: 'الإشعارات',
      audit: 'التدقيق والامتثال',
      admin: 'الإدارة',
      observability: 'المراقبة',
      login: 'تسجيل الدخول',
      logout: 'تسجيل الخروج',
      language: 'اللغة',
      english: 'English',
      arabic: 'العربية',
      search: 'بحث',
      add: 'إضافة',
      edit: 'تعديل',
      delete: 'حذف',
      save: 'حفظ',
      cancel: 'إلغاء',
      totalBeds: 'إجمالي الأسرة',
      totalUnits: 'إجمالي الوحدات',
      totalEmployees: 'إجمالي الموظفين',
      eligible: 'مؤهل',
      ineligible: 'غير مؤهل',
      grace: 'فترة السماح',
      baseline: 'الأساس',
      configured: 'المكون',
      overview: 'نظرة عامة على النظام',
      welcome: 'مرحباً بكم في نظام إدارة القوى العاملة التمريضية AIGH',
      description: 'منصة شاملة لإدارة دورة حياة طاقم التمريض في المستشفى',
      quickActions: 'إجراءات سريعة',
      onboardEmployee: 'إضافة موظف',
      manageUnits: 'إدارة الوحدات',
      viewEligibility: 'عرض الأهلية',
      systemHealth: 'صحة النظام',
      backupStatus: 'حالة النسخ الاحتياطي',
      scfhsSync: 'مزامنة SCFHS',
      eligibilityDrift: 'انحراف الأهلية',
      recentActivities: 'الأنشطة الحديثة',
      noData: 'لا توجد بيانات',
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('aigh-lang') || 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;

export function setLanguage(lang: 'en' | 'ar') {
  localStorage.setItem('aigh-lang', lang);
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.body.dir = lang === 'ar' ? 'rtl' : 'ltr';
}
