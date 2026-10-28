/**
 * Internationalisation (i18n) Framework
 * - English and Arabic with RTL support
 * - Typed locale keys and namespace structure
 * - Fallback to English if Arabic translation missing
 */

export type Locale = 'en' | 'ar';

export interface LocaleConfig {
  lang: Locale;
  dir: 'ltr' | 'rtl';
  label: string;
  dateFormat: 'en-US' | 'ar-AE';
  timeFormat: 'en-US' | 'ar-AE';
}

export const LOCALE_CONFIG: Record<Locale, LocaleConfig> = {
  en: {
    lang: 'en',
    dir: 'ltr',
    label: 'English',
    dateFormat: 'en-US',
    timeFormat: 'en-US',
  },
  ar: {
    lang: 'ar',
    dir: 'rtl',
    label: 'العربية',
    dateFormat: 'ar-AE',
    timeFormat: 'ar-AE',
  },
};

/** All UI text keyed by namespace and key */
export type Messages = typeof MESSAGES_EN;

export const MESSAGES_EN = {
  common: {
    title: 'Al Sajaa Digital Twin',
    subtitle: 'Climate Intelligence & Urban Resilience',
    description: 'Modelled scenarios for sustainable city planning',
    loading: 'Loading...',
    error: 'Error',
    cancel: 'Cancel',
    apply: 'Apply',
    save: 'Save',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    language: 'Language',
    locale: 'Locale',
  },
  heat: {
    title: 'Extreme Heat Intelligence',
    timeOfDay: 'Time of Day',
    hour: 'Hour',
    temperatureCurve: 'Temperature Curve',
    highExposure: 'High-Exposure Locations',
    peak: 'Peak',
    riskFactors: 'Risk Factors',
    shade: 'Shade Availability',
    surface: 'Surface Factor',
    assumptions: 'All calculations modelled; no measured temperatures.',
  },
  air: {
    title: 'Air Quality Intelligence',
    windDirection: 'Wind Direction',
    windSpeed: 'Wind Speed',
    baseline: 'Baseline Concentration',
    mitigation: 'Mitigation Scenario',
    improvement: 'Improvement',
    concentration: 'Concentration (normalized)',
    topContributors: 'Top Contributors',
    factory: 'Factory',
    assumptions: 'Air quality is modelled with Gaussian plume; no measured data.',
  },
  water: {
    title: 'Water Security & Cascading Resilience',
    baseline: 'Baseline Demand',
    waterLoss: 'Water Loss',
    interventions: 'Interventions',
    greywater: 'Greywater Recycling',
    irrigation: 'Drip Irrigation Upgrade',
    rainwater: 'Rainwater Harvesting',
    demand: 'Demand Management',
    cascading: 'Cascading Failure Analysis',
    failedAsset: 'Failed Asset',
    impact: 'Impact',
    recovery: 'Recovery Time',
  },
  microgrid: {
    title: 'Microgrid Dispatch & Energy',
    scenario: 'Scenario',
    baseline: 'Baseline (No Microgrid)',
    proposed: 'Proposed Microgrid',
    solar: 'Solar Generation',
    battery: 'Battery State of Charge',
    grid: 'Grid Import/Export',
    demand: 'Demand',
    efficiency: 'Efficiency',
    savings: 'Energy Savings',
    emissions: 'Emission Savings',
    payback: 'Payback Period',
  },
  agents: {
    title: 'Eight-Agent Orchestration',
    heat: 'Heat Analysis Agent',
    air: 'Air Quality Agent',
    water: 'Water Security Agent',
    microgrid: 'Microgrid Agent',
    flood: 'Flood Risk Agent',
    transport: 'Transport Optimisation',
    solar: 'Solar Planning Agent',
    coastal: 'Coastal Resilience Agent',
    running: 'Running...',
    completed: 'Completed',
    failed: 'Failed',
  },
};

export const MESSAGES_AR: Partial<Messages> = {
  common: {
    title: 'التوأم الرقمي للسجعة',
    subtitle: 'الذكاء المناخي والمرونة الحضرية',
    description: 'سيناريوهات نمذجة لتخطيط مدينة مستدامة',
    loading: 'جاري التحميل...',
    error: 'خطأ',
    cancel: 'إلغاء',
    apply: 'تطبيق',
    save: 'حفظ',
    close: 'إغلاق',
    back: 'رجوع',
    next: 'التالي',
    language: 'اللغة',
    locale: 'الإعدادات الإقليمية',
  },
  heat: {
    title: 'ذكاء الحرارة الشديدة',
    timeOfDay: 'الوقت من اليوم',
    hour: 'الساعة',
    temperatureCurve: 'منحنى درجة الحرارة',
    highExposure: 'مواقع التعرض العالي',
    peak: 'الذروة',
    riskFactors: 'عوامل الخطر',
    shade: 'توفر الظل',
    surface: 'عامل السطح',
    assumptions: 'جميع الحسابات نمذجة؛ لا توجد درجات حرارة مقاسة.',
  },
  air: {
    title: 'ذكاء جودة الهواء',
    windDirection: 'اتجاه الريح',
    windSpeed: 'سرعة الريح',
    baseline: 'التركيز الأساسي',
    mitigation: 'سيناريو التخفيف',
    improvement: 'التحسين',
    concentration: 'التركيز (معياري)',
    topContributors: 'أكبر المساهمين',
    factory: 'مصنع',
    assumptions: 'جودة الهواء نمذجة باستخدام نموذج غاوسي؛ لا توجد بيانات مقاسة.',
  },
};

/**
 * Get localized message with fallback to English
 */
export function getMessage(locale: Locale, namespace: keyof Messages, key: string): string {
  const messages = locale === 'ar' ? { ...MESSAGES_EN, ...MESSAGES_AR } : MESSAGES_EN;
  const ns = messages[namespace as keyof typeof messages];
  if (!ns) return `[${namespace}.${key}]`;
  const msg = (ns as Record<string, unknown>)[key];
  return typeof msg === 'string' ? msg : `[${namespace}.${key}]`;
}

/**
 * Format date/time with locale
 */
export function formatDate(date: Date, locale: Locale): string {
  const config = LOCALE_CONFIG[locale];
  return new Intl.DateTimeFormat(config.dateFormat).format(date);
}

export function formatTime(date: Date, locale: Locale): string {
  const config = LOCALE_CONFIG[locale];
  return new Intl.DateTimeFormat(config.timeFormat, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatNumber(num: number, locale: Locale, decimals = 0): string {
  const config = LOCALE_CONFIG[locale];
  return new Intl.NumberFormat(config.dateFormat, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/** Alias for convenience: LOCALES = LOCALE_CONFIG */
export const LOCALES = LOCALE_CONFIG;
