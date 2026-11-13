import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type BuiltApp } from '../app.js';
import { purgeExpiredGameSessions } from '../db/session-cleanup.js';
import { gameSessionsTable } from '../db/schema.js';
import { INDIE_DEV_TITLE, OBSERVATORY_TITLE } from '../seed/demos.js';
import { readAppVersion } from '../config.js';
import { eq } from 'drizzle-orm';

const activeApps: BuiltApp[] = [];

async function createTestApp(overrides: Partial<Record<string, string>> = {}): Promise<BuiltApp> {
  const built = await buildApp({
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    RATE_LIMIT_MAX: '500',
    ...overrides,
  });
  activeApps.push(built);
  return built;
}

afterEach(async () => {
  while (activeApps.length > 0) {
    const built = activeApps.pop();
    if (built) {
      await built.app.close();
    }
  }
});

describe('Server Health & Demo Seeding', () => {
  it('exposes dynamic version from root package.json and seeds both playable demo quests', async () => {
    const { app } = await createTestApp();

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    const healthBody = health.json<{ ok: boolean; version: string; authEnabled: boolean }>();
    expect(healthBody.ok).toBe(true);
    expect(healthBody.version).toBe(readAppVersion());
    expect(healthBody.authEnabled).toBe(false);

    const listRes = await app.inject({ method: 'GET', url: '/api/quests' });
    expect(listRes.statusCode).toBe(200);
    const quests = listRes.json<{
      quests: Array<{
        id: string;
        title: string;
        sceneCount: number;
        winCount: number;
        loseCount: number;
        playable: boolean;
      }>;
    }>().quests;

    expect(quests).toHaveLength(2);
    const observatory = quests.find((q) => q.title === OBSERVATORY_TITLE);
    const indie = quests.find((q) => q.title === INDIE_DEV_TITLE);

    expect(observatory?.sceneCount).toBe(12);
    expect(observatory?.winCount).toBe(2);
    expect(observatory?.loseCount).toBe(1);
    expect(observatory?.playable).toBe(true);

    expect(indie?.sceneCount).toBe(25);
    expect(indie?.winCount).toBe(3);
    expect(indie?.loseCount).toBe(3);
    expect(indie?.playable).toBe(true);

    const searchRes = await app.inject({
      method: 'GET',
      url: '/api/quests?q=' + encodeURIComponent('обсерватор'),
    });
    expect(searchRes.json<{ quests: unknown[] }>().quests).toHaveLength(1);

    if (observatory) {
      const analyzeRes = await app.inject({
        method: 'GET',
        url: `/api/quests/${observatory.id}/analyze`,
      });
      expect(analyzeRes.statusCode).toBe(200);
      expect(
        analyzeRes.json<{ analysis: { playable: boolean; issues: unknown[] } }>().analysis.playable,
      ).toBe(true);
    }
  });
});

describe('Game API Playthrough & Undo', () => {
  it('plays Observatory demo to win and supports undo from ending screen', async () => {
    const { app, repo } = await createTestApp();
    const obs = repo.getQuestByTitle(OBSERVATORY_TITLE);
    expect(obs).not.toBeNull();
    if (!obs) return;

    const startRes = await app.inject({
      method: 'POST',
      url: '/api/games/start',
      payload: { questId: obs.id, locale: 'ru' },
    });
    expect(startRes.statusCode).toBe(201);
    let session = startRes.json<{
      sessionId: string;
      view: {
        status: string;
        scene: { title: string };
        choices: Array<{ id: string; text: string; available: boolean }>;
        inventory: string[];
        canUndo: boolean;
      };
    }>();
    expect(session.view.scene.title).toBe('У ворот обсерватории');

    const pickByText = async (substr: string) => {
      const choice = session.view.choices.find((c) => c.text.includes(substr));
      expect(choice?.available).toBe(true);
      if (!choice) throw new Error(`Choice not found: ${substr}`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/games/${session.sessionId}/choice`,
        payload: { choiceId: choice.id, locale: 'ru' },
      });
      expect(res.statusCode).toBe(200);
      session = res.json();
    };

    await pickByText('заросшей тропинке');
    await pickByText('сторожку смотрителя');
    await pickByText('Взять латунный ключ');
    expect(session.view.inventory).toContain('Латунный ключ');
    await pickByText('Вернуться в сад');
    await pickByText('Вернуться к воротам');
    await pickByText('главного входа');
    await pickByText('Отпереть библиотеку');
    await pickByText('хрустальную линзу');
    await pickByText('звёздную карту');
    await pickByText('Вернуться в главный зал');
    await pickByText('Подняться по винтовой лестнице');
    await pickByText('Вставить хрустальную линзу');
    await pickByText('Сверить голубую звезду');

    expect(session.view.status).toBe('win');
    expect(session.view.canUndo).toBe(true);

    // Undo from victory screen returns to telescope view
    const undoRes = await app.inject({
      method: 'POST',
      url: `/api/games/${session.sessionId}/undo`,
      payload: { locale: 'ru' },
    });
    expect(undoRes.statusCode).toBe(200);
    const undone = undoRes.json<{ view: { status: string; scene: { title: string } } }>();
    expect(undone.view.status).toBe('playing');
    expect(undone.view.scene.title).toBe('Взгляд сквозь линзу');
  });

  it('plays Indie Dev demo with variable interpolation and numeric conditions', async () => {
    const { app, repo } = await createTestApp();
    const indie = repo.getQuestByTitle(INDIE_DEV_TITLE);
    expect(indie).not.toBeNull();
    if (!indie) return;

    const startRes = await app.inject({
      method: 'POST',
      url: '/api/games/start',
      payload: { questId: indie.id, locale: 'ru' },
    });
    expect(startRes.statusCode).toBe(201);
    let session = startRes.json<{
      sessionId: string;
      view: {
        status: string;
        scene: { bodyMarkdown: string };
        variables: Record<string, number | boolean | string>;
        choices: Array<{ id: string; text: string; available: boolean }>;
      };
    }>();
    expect(session.view.scene.bodyMarkdown).toContain('150 тыс. рублей');

    const pickByText = async (substr: string) => {
      const choice = session.view.choices.find((c) => c.text.includes(substr));
      expect(choice?.available).toBe(true);
      if (!choice) throw new Error(`Choice not found: ${substr}`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/games/${session.sessionId}/choice`,
        payload: { choiceId: choice.id, locale: 'ru' },
      });
      expect(res.statusCode).toBe(200);
      session = res.json();
    };

    await pickByText('кофе с Пашей');
    await pickByText('взять банку энергетика');
    await pickByText('пазл-платформер');
    await pickByText('Осушить банку энергетика');
    await pickByText('художницу Алину');
    await pickByText('40 тыс. руб.');
    await pickByText('композитору Артёму');
    await pickByText('полный пак саундтрека');
    await pickByText('страницу в Steam');
    await pickByText('топ-стримеру Булычу');
    await pickByText('безупречный билд Булычу');
    await pickByText('Использовать волну хайпа');
    await pickByText('Выспаться');
    await pickByText('статистику хита');

    expect(session.view.status).toBe('win');
  });
});

describe('Author CRUD, Self-Loop Duplication, Import/Export & Cross-Quest Guard', () => {
  it('handles quest/scene/choice lifecycle, self-loop remapping, layout, and exports', async () => {
    const { app } = await createTestApp({ SEED_DEMOS: 'false' });

    const q1Res = await app.inject({
      method: 'POST',
      url: '/api/quests',
      payload: { title: 'Test Quest 1', description: 'Desc' },
    });
    expect(q1Res.statusCode).toBe(201);
    const q1 = q1Res.json<{
      quest: { id: string; startSceneId: string; scenes: Array<{ id: string }> };
    }>().quest;
    expect(q1.scenes).toHaveLength(1);
    const startId = q1.startSceneId;

    // Add self-loop choice on start scene
    const chRes = await app.inject({
      method: 'POST',
      url: `/api/scenes/${startId}/choices`,
      payload: {
        text: 'Loop action',
        targetSceneId: startId,
        effects: [{ type: 'set_var', key: 'visited', value: true }],
      },
    });
    expect(chRes.statusCode).toBe(201);

    // Duplicate scene and verify self-loop points to the new scene ID
    const dupSceneRes = await app.inject({
      method: 'POST',
      url: `/api/scenes/${startId}/duplicate`,
    });
    expect(dupSceneRes.statusCode).toBe(201);
    const dupScene = dupSceneRes.json<{
      scene: { id: string; choices: Array<{ targetSceneId: string | null }> };
    }>().scene;
    expect(dupScene.id).not.toBe(startId);
    expect(dupScene.choices[0]?.targetSceneId).toBe(dupScene.id);

    // Cross-quest target reference must fail with 409 ERR_SCENE_WRONG_QUEST
    const q2Res = await app.inject({
      method: 'POST',
      url: '/api/quests',
      payload: { title: 'Other Quest' },
    });
    const q2StartId = q2Res.json<{ quest: { startSceneId: string } }>().quest.startSceneId;

    const badChoiceRes = await app.inject({
      method: 'POST',
      url: `/api/scenes/${startId}/choices`,
      payload: { text: 'Bad link', targetSceneId: q2StartId },
    });
    expect(badChoiceRes.statusCode).toBe(409);
    expect(badChoiceRes.json<{ code: string }>().code).toBe('ERR_SCENE_WRONG_QUEST');

    // BFS layout update
    const layoutRes = await app.inject({
      method: 'POST',
      url: `/api/quests/${q1.id}/layout`,
      payload: { mode: 'bfs' },
    });
    expect(layoutRes.statusCode).toBe(200);

    // Export JSON & re-import
    const exportJsonRes = await app.inject({
      method: 'GET',
      url: `/api/quests/${q1.id}/export/json`,
    });
    expect(exportJsonRes.statusCode).toBe(200);
    const importRes = await app.inject({
      method: 'POST',
      url: '/api/quests/import',
      payload: exportJsonRes.json(),
    });
    expect(importRes.statusCode).toBe(201);
    expect(importRes.json<{ quest: { id: string } }>().quest.id).not.toBe(q1.id);

    // Export Standalone HTML
    const exportHtmlRes = await app.inject({
      method: 'GET',
      url: `/api/quests/${q1.id}/export/html?locale=en&theme=cyber`,
    });
    expect(exportHtmlRes.statusCode).toBe(200);
    expect(exportHtmlRes.headers['content-type']).toContain('text/html');
    expect(exportHtmlRes.body).toContain('data-theme="cyber"');
    expect(exportHtmlRes.body).toContain('id="qf-quest-data"');
  });
});

describe('Security: Auth, Rate Limit & Session TTL Cleanup', () => {
  it('enforces auth when ADMIN_PASSWORD is set and supports login/logout revocation', async () => {
    const { app } = await createTestApp({
      SEED_DEMOS: 'false',
      ADMIN_USERNAME: 'author',
      ADMIN_PASSWORD: 'super-secret-password',
    });

    const unauthCreate = await app.inject({
      method: 'POST',
      url: '/api/quests',
      payload: { title: 'Blocked' },
    });
    expect(unauthCreate.statusCode).toBe(401);
    expect(unauthCreate.json<{ code: string }>().code).toBe('ERR_AUTH_REQUIRED');

    const badLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'author', password: 'wrong' },
    });
    expect(badLogin.statusCode).toBe(401);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'author', password: 'super-secret-password' },
    });
    expect(loginRes.statusCode).toBe(200);
    const { token } = loginRes.json<{ token: string }>();
    expect(token).toBeTruthy();

    const authCreate = await app.inject({
      method: 'POST',
      url: '/api/quests',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Allowed' },
    });
    expect(authCreate.statusCode).toBe(201);

    // Logout revokes token
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logoutRes.statusCode).toBe(200);

    const afterLogout = await app.inject({
      method: 'POST',
      url: '/api/quests',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Should fail' },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('enforces rate limiting and purges expired game sessions', async () => {
    const { app, db, repo } = await createTestApp({
      RATE_LIMIT_MAX: '3',
      RATE_LIMIT_WINDOW_MS: '60000',
    });

    // Health check bypasses rate limit; /api/quests does not
    expect((await app.inject({ method: 'GET', url: '/api/quests' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/quests' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/quests' })).statusCode).toBe(200);
    const limited = await app.inject({ method: 'GET', url: '/api/quests' });
    expect(limited.statusCode).toBe(429);
    expect(limited.json<{ code: string }>().code).toBe('ERR_RATE_LIMITED');

    // Stale game session cleanup
    const obs = repo.getQuestByTitle(OBSERVATORY_TITLE);
    if (!obs) throw new Error('Expected seeded quest');
    const now = Date.now();
    db.insert(gameSessionsTable)
      .values([
        {
          id: 'stale-1',
          questId: obs.id,
          currentSceneId: obs.startSceneId ?? 's1',
          inventory: [],
          variables: {},
          visitedSceneIds: [],
          log: [],
          steps: 0,
          undoStack: [],
          createdAt: now - 10_000,
          updatedAt: now - 10_000,
        },
        {
          id: 'fresh-1',
          questId: obs.id,
          currentSceneId: obs.startSceneId ?? 's1',
          inventory: [],
          variables: {},
          visitedSceneIds: [],
          log: [],
          steps: 0,
          undoStack: [],
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    const removed = purgeExpiredGameSessions(db, 5_000, now);
    expect(removed).toBe(1);
    expect(
      db.select().from(gameSessionsTable).where(eq(gameSessionsTable.id, 'fresh-1')).get(),
    ).toBeDefined();
  });
});
