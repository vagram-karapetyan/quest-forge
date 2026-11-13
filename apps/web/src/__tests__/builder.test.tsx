// @vitest-environment jsdom
import type { Quest } from '@quest-forge/engine';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client.js';
import { BuilderPage } from '../features/builder/BuilderPage.js';
import { LayoutSaveQueue, SerializedSaveRunner } from '../features/builder/layoutSync.js';
import { AppPreferencesProvider } from '../state/preferences.js';

function makeBuilderQuest(): Quest {
  return {
    id: 'q-builder',
    title: 'Clockwork Vault',
    description: 'Builder test story',
    startSceneId: 's1',
    initialVariables: { energy: 2 },
    scenes: [
      {
        id: 's1',
        questId: 'q-builder',
        title: 'Entrance Hall',
        body: 'A bronze hatch stands before you.',
        ending: 'none',
        posX: 100,
        posY: 120,
        imageUrl: null,
        audioUrl: null,
        choices: [
          {
            id: 'c1',
            sceneId: 's1',
            targetSceneId: 's2',
            text: 'Open hatch',
            sortOrder: 0,
            conditions: [],
            effects: [],
          },
        ],
      },
      {
        id: 's2',
        questId: 'q-builder',
        title: 'Treasury',
        body: 'Golden gears gleam.',
        ending: 'win',
        posX: 460,
        posY: 120,
        imageUrl: null,
        audioUrl: null,
        choices: [],
      },
      {
        id: 's3',
        questId: 'q-builder',
        title: 'Forgotten Cellar',
        body: 'Unreachable dead end.',
        ending: 'none',
        posX: 460,
        posY: 320,
        imageUrl: null,
        audioUrl: null,
        choices: [],
      },
    ],
  };
}

describe('Builder Layout & Save Synchronization', () => {
  it('coalesces concurrent node drags into sequential non-racing batches', async () => {
    const sentBatches: Array<Array<{ sceneId: string; posX: number; posY: number }>> = [];
    let releaseFirst = (): void => {};
    let callCount = 0;

    const queue = new LayoutSaveQueue(async (_questId, positions) => {
      callCount += 1;
      sentBatches.push(positions);
      if (callCount === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
    });

    queue.enqueue('q-builder', { sceneId: 's1', posX: 150, posY: 200 }, 0);
    // While the first request is in flight, queue rapid updates to the same node
    queue.enqueue('q-builder', { sceneId: 's1', posX: 220, posY: 240 }, 0);
    queue.enqueue('q-builder', { sceneId: 's1', posX: 310.6, posY: 280.2 }, 0);

    expect(sentBatches).toHaveLength(1);
    expect(sentBatches[0]).toEqual([{ sceneId: 's1', posX: 150, posY: 200 }]);

    releaseFirst();
    await waitFor(() => {
      expect(sentBatches).toHaveLength(2);
    });

    expect(sentBatches[1]).toEqual([{ sceneId: 's1', posX: 311, posY: 280 }]);
  });

  it('serializes entity mutations per key without out-of-order overwrites', async () => {
    const runner = new SerializedSaveRunner();
    const order: string[] = [];
    let finishFirst = (): void => {};

    const first = runner.run('scene:s1', async () => {
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
      order.push('first');
    });

    const second = runner.run('scene:s1', () => {
      order.push('second');
      return Promise.resolve();
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual([]);

    finishFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
  });
});

describe('BuilderPage UI & Validator Integration', () => {
  beforeEach(() => {
    vi.spyOn(api, 'health').mockResolvedValue({
      ok: true,
      version: '0.1.0',
      authEnabled: false,
      uptimeSeconds: 10,
    });
    vi.spyOn(api, 'authStatus').mockResolvedValue({
      authEnabled: false,
      authenticated: true,
      username: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders graph, validator warnings, choice logic editor, and keyboard node movement', async () => {
    const quest = makeBuilderQuest();
    vi.spyOn(api, 'getQuest').mockResolvedValue({ quest });
    const updateLayoutSpy = vi.spyOn(api, 'updateLayout').mockResolvedValue({ quest });
    const updateChoiceSpy = vi.spyOn(api, 'updateChoice').mockImplementation((choiceId, patch) =>
      Promise.resolve({
        choice: {
          id: choiceId,
          sceneId: 's1',
          targetSceneId: patch.targetSceneId ?? 's2',
          text: patch.text ?? 'Open hatch',
          sortOrder: 0,
          conditions: patch.conditions ?? [],
          effects: patch.effects ?? [],
        },
      }),
    );

    const onNavigate = vi.fn();

    render(
      <AppPreferencesProvider>
        <BuilderPage questId="q-builder" onNavigate={onNavigate} />
      </AppPreferencesProvider>,
    );

    await screen.findByRole('heading', { level: 1, name: 'Clockwork Vault' });

    // 2D graph nodes & SVG transitions render
    const nodeBtn = screen.getByRole('button', {
      name: /Entrance Hall.*Стрелки — переместить узел/i,
    });
    fireEvent.keyDown(nodeBtn, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(updateLayoutSpy).toHaveBeenCalledWith('q-builder', {
        positions: [{ sceneId: 's1', posX: 124, posY: 120 }],
      });
    });

    // Visual logic editor adds a condition without raw JSON
    const addItemCondBtn = screen.getByRole('button', { name: '+ Условие: предмет' });
    fireEvent.click(addItemCondBtn);

    await waitFor(
      () => {
        expect(updateChoiceSpy).toHaveBeenCalled();
      },
      { timeout: 1500 },
    );

    // Switch to Validator tab and jump to unreachable scene
    const validatorTab = screen.getByRole('tab', { name: /Валидатор/i });
    fireEvent.click(validatorTab);

    const unreachableText = screen.getByText(/Forgotten Cellar.*недостижима/i);
    const issueCard = unreachableText.closest('li');
    expect(issueCard).not.toBeNull();
    if (issueCard) {
      fireEvent.click(within(issueCard).getByRole('button', { name: 'Перейти к сцене' }));
    }

    const titleInput = screen.getByLabelText<HTMLInputElement>('Заголовок сцены');
    expect(titleInput.value).toBe('Forgotten Cellar');
  });

  it('shows author sign-in banner and disables edits when auth is required', async () => {
    const quest = makeBuilderQuest();
    vi.spyOn(api, 'authStatus').mockResolvedValue({
      authEnabled: true,
      authenticated: false,
      username: null,
    });
    vi.spyOn(api, 'getQuest').mockResolvedValue({ quest });

    render(
      <AppPreferencesProvider>
        <BuilderPage questId="q-builder" onNavigate={vi.fn()} />
      </AppPreferencesProvider>,
    );

    await screen.findByText(/Режим только для чтения/i);
    const addSceneBtn = screen.getByRole<HTMLButtonElement>('button', {
      name: /^\+ Новая сцена$/,
    });
    expect(addSceneBtn.disabled).toBe(true);
  });
});
