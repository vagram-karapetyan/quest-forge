import { APP_LOCALES, APP_THEMES, t } from '@quest-forge/engine';
import { useAppPreferences } from '../state/preferences.js';

type TopBarProps = {
  onNavigate: (path: string) => void;
  extraActions?: React.ReactNode;
};

export function TopBar({ onNavigate, extraActions }: TopBarProps) {
  const { theme, setTheme, locale, setLocale, auth, logout, openLoginDialog } = useAppPreferences();

  return (
    <header className="qf-topbar">
      <a href="#main-content" className="qf-skip-link visually-hidden">
        {t(locale, 'nav.skipToContent')}
      </a>

      <div className="qf-nav-group">
        <a
          href="/"
          className="qf-brand"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/');
          }}
        >
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L15 8.5L22 9.3L17 14L18.5 21L12 17.5L5.5 21L7 14L2 9.3L9 8.5L12 2Z" />
          </svg>
          <span>{t(locale, 'app.title')}</span>
        </a>

        <nav aria-label={t(locale, 'nav.catalog')} className="qf-nav-group">
          <button
            type="button"
            className="qf-btn"
            onClick={() => {
              onNavigate('/');
            }}
          >
            {t(locale, 'nav.catalog')}
          </button>
        </nav>
      </div>

      <div className="qf-controls-row">
        {extraActions}

        <div className="qf-nav-group" role="group" aria-label={t(locale, 'theme.label')}>
          {APP_THEMES.map((item) => (
            <button
              key={item}
              type="button"
              className={`qf-btn ${item === theme ? 'qf-btn-primary' : ''}`}
              aria-pressed={item === theme}
              onClick={() => {
                setTheme(item);
              }}
            >
              {t(locale, `theme.${item}`)}
            </button>
          ))}
        </div>

        <div className="qf-nav-group" role="group" aria-label={t(locale, 'lang.label')}>
          {APP_LOCALES.map((item) => (
            <button
              key={item}
              type="button"
              className={`qf-btn ${item === locale ? 'qf-btn-primary' : ''}`}
              aria-pressed={item === locale}
              onClick={() => {
                setLocale(item);
              }}
            >
              {t(locale, `lang.${item}`)}
            </button>
          ))}
        </div>

        {auth.authEnabled &&
          (auth.authenticated ? (
            <button type="button" className="qf-btn" onClick={() => void logout()}>
              {t(locale, 'nav.logout')} ({auth.username})
            </button>
          ) : (
            <button type="button" className="qf-btn qf-btn-primary" onClick={openLoginDialog}>
              {t(locale, 'nav.login')}
            </button>
          ))}
      </div>
    </header>
  );
}
