import { t } from '@quest-forge/engine';
import { useCallback, useEffect, useState } from 'react';
import { AuthDialog } from './components/AuthDialog.js';
import { BuilderPage } from './features/builder/BuilderPage.js';
import { CatalogPage } from './features/catalog/CatalogPage.js';
import { PlayerPage } from './features/player/PlayerPage.js';
import { AppPreferencesProvider, useAppPreferences } from './state/preferences.js';

function AppRouter() {
  const { locale, appVersion } = useAppPreferences();
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
      setPathname(nextPath);
    }
  }, []);

  const playMatch = /^\/play\/([^/]+)$/.exec(pathname);
  const builderMatch = /^\/builder\/([^/]+)$/.exec(pathname);

  useEffect(() => {
    if (playMatch) {
      document.title = `${t(locale, 'catalog.play')} | ${t(locale, 'app.title')}`;
    } else if (builderMatch) {
      document.title = `${t(locale, 'nav.builder')} | ${t(locale, 'app.title')}`;
    } else {
      document.title = `${t(locale, 'catalog.title')} | ${t(locale, 'app.title')}`;
    }
  }, [locale, playMatch, builderMatch]);

  return (
    <div className="qf-app-root">
      {playMatch && playMatch[1] ? (
        <PlayerPage questId={decodeURIComponent(playMatch[1])} onNavigate={navigate} />
      ) : builderMatch && builderMatch[1] ? (
        <BuilderPage questId={decodeURIComponent(builderMatch[1])} onNavigate={navigate} />
      ) : (
        <CatalogPage onNavigate={navigate} />
      )}

      <footer className="qf-footer">Quest Forge {appVersion ? `v${appVersion}` : ''}</footer>

      <AuthDialog />
    </div>
  );
}

export function App() {
  return (
    <AppPreferencesProvider>
      <AppRouter />
    </AppPreferencesProvider>
  );
}
