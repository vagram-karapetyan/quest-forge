import type {
  AppLocale,
  AppTheme,
  GameView,
  Quest,
  QuestAnalysis,
  StructuredMessage,
} from '@quest-forge/engine';

export type QuestSummary = {
  id: string;
  title: string;
  description: string;
  startSceneId: string | null;
  sceneCount: number;
  winCount: number;
  loseCount: number;
  variableCount: number;
  playable: boolean;
  hasStartScene: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AuthStatus = {
  authEnabled: boolean;
  authenticated: boolean;
  username: string | null;
};

export type GameSessionResponse = {
  sessionId: string;
  questId: string;
  questTitle: string;
  view: GameView;
};

export type ChoiceActionResponse = GameSessionResponse & {
  newItems: string[];
  removedItems: string[];
  notices: StructuredMessage[];
};

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly params: Record<string, string | number | boolean>;
  public readonly lockReasons: StructuredMessage[];

  constructor(
    status: number,
    code: string,
    params: Record<string, string | number | boolean> = {},
    lockReasons: StructuredMessage[] = [],
  ) {
    super(code);
    this.status = status;
    this.code = code;
    this.params = params;
    this.lockReasons = lockReasons;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers,
  });

  if (!res.ok) {
    let code = 'ERR_INTERNAL_SERVER';
    let params: Record<string, string | number | boolean> = {};
    let lockReasons: StructuredMessage[] = [];
    try {
      const data = (await res.json()) as {
        code?: string;
        params?: Record<string, string | number | boolean>;
        lockReasons?: StructuredMessage[];
      };
      if (data.code) {
        code = data.code;
      }
      if (data.params) {
        params = data.params;
      }
      if (Array.isArray(data.lockReasons)) {
        lockReasons = data.lockReasons;
      }
    } catch {
      // Non-JSON error body
    }
    throw new ApiClientError(res.status, code, params, lockReasons);
  }

  return (await res.json()) as T;
}

export const api = {
  health: () =>
    requestJson<{ ok: boolean; version: string; authEnabled: boolean; uptimeSeconds: number }>(
      '/api/health',
    ),

  authStatus: () => requestJson<AuthStatus>('/api/auth/status'),

  login: (username: string, password: string) =>
    requestJson<AuthStatus & { ok: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  listQuests: (query?: string) => {
    const qs = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    return requestJson<{ quests: QuestSummary[] }>(`/api/quests${qs}`);
  },

  getQuest: (id: string) => requestJson<{ quest: Quest }>(`/api/quests/${id}`),

  analyzeQuest: (id: string) =>
    requestJson<{ analysis: QuestAnalysis }>(`/api/quests/${id}/analyze`),

  createQuest: (title: string, description: string) =>
    requestJson<{ quest: Quest }>('/api/quests', {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    }),

  duplicateQuest: (id: string) =>
    requestJson<{ quest: Quest }>(`/api/quests/${id}/duplicate`, { method: 'POST' }),

  deleteQuest: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/quests/${id}`, { method: 'DELETE' }),

  importQuest: (payload: unknown) =>
    requestJson<{ quest: Quest }>('/api/quests/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  startGame: (questId: string, locale: AppLocale) =>
    requestJson<GameSessionResponse>('/api/games/start', {
      method: 'POST',
      body: JSON.stringify({ questId, locale }),
    }),

  getGame: (sessionId: string, locale: AppLocale) =>
    requestJson<GameSessionResponse>(`/api/games/${sessionId}?locale=${locale}`),

  applyChoice: (sessionId: string, choiceId: string, locale: AppLocale) =>
    requestJson<ChoiceActionResponse>(`/api/games/${sessionId}/choice`, {
      method: 'POST',
      body: JSON.stringify({ choiceId, locale }),
    }),

  undoGame: (sessionId: string, locale: AppLocale) =>
    requestJson<GameSessionResponse>(`/api/games/${sessionId}/undo`, {
      method: 'POST',
      body: JSON.stringify({ locale }),
    }),

  exportJsonUrl: (id: string) => `/api/quests/${id}/export/json`,

  exportHtmlUrl: (id: string, locale: AppLocale, theme: AppTheme) =>
    `/api/quests/${id}/export/html?locale=${locale}&theme=${theme}`,
};
