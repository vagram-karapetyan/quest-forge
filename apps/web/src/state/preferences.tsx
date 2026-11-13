import { APP_LOCALES, APP_THEMES, type AppLocale, type AppTheme } from '@quest-forge/engine';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type AuthStatus } from '../api/client.js';

const THEME_STORAGE_KEY = 'qf_theme';
const LOCALE_STORAGE_KEY = 'qf_locale';

type AppContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  auth: AuthStatus;
  appVersion: string;
  refreshAuth: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loginDialogOpen: boolean;
  openLoginDialog: () => void;
  closeLoginDialog: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function readInitialTheme(): AppTheme {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw && (APP_THEMES as readonly string[]).includes(raw)) {
      return raw as AppTheme;
    }
  } catch {
    // Ignore storage restriction
  }
  return 'night';
}

function readInitialLocale(): AppLocale {
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw && (APP_LOCALES as readonly string[]).includes(raw)) {
      return raw as AppLocale;
    }
  } catch {
    // Ignore storage restriction
  }
  return 'ru';
}

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(readInitialTheme);
  const [locale, setLocaleState] = useState<AppLocale>(readInitialLocale);
  const [appVersion, setAppVersion] = useState<string>('');
  const [auth, setAuth] = useState<AuthStatus>({
    authEnabled: false,
    authenticated: true,
    username: null,
  });
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Ignore
    }
  }, [locale]);

  const refreshAuth = useCallback(async () => {
    try {
      const status = await api.authStatus();
      setAuth(status);
    } catch {
      // Ignore transient failure
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
    void api
      .health()
      .then((res) => {
        setAppVersion(res.version);
      })
      .catch(() => {
        // Ignore transient health failure
      });
  }, [refreshAuth]);

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next);
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const status = await api.login(username, password);
    setAuth({
      authEnabled: status.authEnabled,
      authenticated: status.authenticated,
      username: status.username,
    });
    setLoginDialogOpen(false);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    await refreshAuth();
  }, [refreshAuth]);

  const openLoginDialog = useCallback(() => {
    setLoginDialogOpen(true);
  }, []);

  const closeLoginDialog = useCallback(() => {
    setLoginDialogOpen(false);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      theme,
      setTheme,
      locale,
      setLocale,
      auth,
      appVersion,
      refreshAuth,
      login,
      logout,
      loginDialogOpen,
      openLoginDialog,
      closeLoginDialog,
    }),
    [
      theme,
      setTheme,
      locale,
      setLocale,
      auth,
      appVersion,
      refreshAuth,
      login,
      logout,
      loginDialogOpen,
      openLoginDialog,
      closeLoginDialog,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppPreferences(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppPreferences must be used within AppPreferencesProvider');
  }
  return ctx;
}
