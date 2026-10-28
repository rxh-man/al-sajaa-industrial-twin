/**
 * Language Switcher
 *
 * Toggle between English and Arabic with RTL layout support.
 */

import { useI18n } from '../../i18n/i18nContext';
import { LOCALE_CONFIG, type Locale } from '../../i18n/locales';
import '../../styles/languageSwitcher.css';

export function LanguageSwitcher() {
  const { locale, setLocale, getMessage } = useI18n();

  return (
    <div className="language-switcher">
      <div className="language-switcher-label">
        {getMessage('common', 'language')}
      </div>
      <div className="language-switcher-buttons">
        {Object.entries(LOCALE_CONFIG).map(([lang, config]) => (
          <button
            key={lang}
            onClick={() => setLocale(lang as Locale)}
            className={`language-button ${locale === lang ? 'active' : ''}`}
            title={config.label}
            aria-label={`Switch to ${config.label}`}
            aria-pressed={locale === lang}
          >
            {config.label}
          </button>
        ))}
      </div>
    </div>
  );
}
