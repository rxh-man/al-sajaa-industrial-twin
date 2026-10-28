/**
 * Internationalisation Context
 *
 * Provides locale selection, message resolution, and formatting utilities
 * for the Climate Intelligence System.
 */

import { createContext, useContext, useCallback, useState, useEffect, type ReactNode } from 'react';
import {
  LOCALE_CONFIG,
  MESSAGES_EN,
  MESSAGES_AR,
  type Locale,
  type LocaleConfig,
} from './locales';

export interface I18nContextValue {
  locale: Locale;
  localeConfig: LocaleConfig;
  setLocale: (locale: Locale) => void;
  getMessage: (namespace: string, key: string) => string;
  formatNumber: (num: number, decimals?: number) => string;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

/**
 * I18n Provider: wraps the application with locale and message management.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  // Initialize locale from localStorage or browser preference
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('i18n-locale');
      if (stored === 'en' || stored === 'ar') return stored;
      return navigator.language.startsWith('ar') ? 'ar' : 'en';
    }
    return 'en';
  });

  const localeConfig = LOCALE_CONFIG[locale];

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('i18n-locale', newLocale);
  }, []);

  // Update document direction when locale changes
  useEffect(() => {
    document.documentElement.dir = localeConfig.dir;
    document.documentElement.lang = locale;
  }, [locale, localeConfig.dir]);

  const getMessage = useCallback(
    (namespace: string, key: string): string => {
      const messages = locale === 'en' ? MESSAGES_EN : MESSAGES_AR;
      const ns = (messages as any)[namespace] || {};
      const msg = ns[key];

      if (msg) return msg;

      // Fallback to English if not found
      if (locale !== 'en') {
        const enNs = (MESSAGES_EN as any)[namespace] || {};
        return enNs[key] || key;
      }

      return key;
    },
    [locale]
  );

  const formatNumber = useCallback(
    (num: number, decimals: number = 0): string => {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);
    },
    [locale]
  );

  const formatDate = useCallback(
    (date: Date): string => {
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date);
    },
    [locale]
  );

  const formatTime = useCallback(
    (date: Date): string => {
      return new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: locale === 'en',
      }).format(date);
    },
    [locale]
  );

  const value: I18nContextValue = {
    locale,
    localeConfig,
    setLocale,
    getMessage,
    formatNumber,
    formatDate,
    formatTime,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook: use i18n context in any component.
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

/**
 * Hook: get translated message by namespace and key.
 */
export function useMessage(namespace: string, key: string): string {
  const { getMessage } = useI18n();
  return getMessage(namespace, key);
}

/**
 * Hook: format number according to locale.
 */
export function useFormatNumber(): (num: number, decimals?: number) => string {
  const { formatNumber } = useI18n();
  return formatNumber;
}

/**
 * Hook: format date according to locale.
 */
export function useFormatDate(): (date: Date) => string {
  const { formatDate } = useI18n();
  return formatDate;
}

/**
 * Hook: format time according to locale.
 */
export function useFormatTime(): (date: Date) => string {
  const { formatTime } = useI18n();
  return formatTime;
}
