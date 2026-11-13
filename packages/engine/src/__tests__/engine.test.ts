import { describe, expect, it } from 'vitest';
import {
  analyzeQuest,
  applyChoice,
  compileStandaloneHtml,
  computeAutoLayout,
  createInitialState,
  evaluateCondition,
  exportQuestToPortable,
  getGameView,
  interpolateText,
  MAX_UNDO_STEPS,
  normalizeImportedQuest,
  renderMarkdown,
  sanitizeUrl,
  undoStep,
  type Quest,
} from '../index.js';

function makeSampleQuest(): Quest {
  return {
    id: 'q1',
    title: 'Observatory Demo',
    description: 'Short test quest',
    startSceneId: 's1',
    initialVariables: {
      gold: 0.1,
      рубли: 10,
      hasPower: false,
    },
    scenes: [
      {
        id: 's1',
        questId: 'q1',
        title: 'Gate ({рубли}₽)',
        body: 'Power: {hasPower}, unknown: {missing_var}.',
        ending: 'none',
        posX: 0,
        posY: 0,
        imageUrl: null,
        audioUrl: null,
        choices: [
          {
            id: 'c1',
            sceneId: 's1',
            targetSceneId: 's1',
            text: 'Pick up key',
            sortOrder: 0,
            conditions: [],
            effects: [{ type: 'give_item', item: 'Brass Key' }],
          },
          {
            id: 'c2',
            sceneId: 's1',
            targetSceneId: null,
            text: 'Flip switch',
            sortOrder: 1,
            conditions: [],
            effects: [
              { type: 'set_var', key: 'hasPower', value: true },
              { type: 'add_var', key: 'gold', delta: 0.2 },
            ],
          },
          {
            id: 'c3',
            sceneId: 's1',
            targetSceneId: 's2',
            text: 'Unlock door ({gold})',
            sortOrder: 2,
            conditions: [
              { type: 'has_item', item: 'Brass Key', has: true },
              { type: 'var', key: 'hasPower', op: '==', value: true },
              { type: 'var', key: 'gold', op: '>=', value: 0.3 },
            ],
            effects: [{ type: 'take_item', item: 'Brass Key' }],
          },
        ],
      },
      {
        id: 's2',
        questId: 'q1',
        title: 'Dome',
        body: 'You entered the dome!',
        ending: 'win',
        posX: 300,
        posY: 0,
        imageUrl: null,
        audioUrl: null,
        choices: [],
      },
    ],
  };
}

describe('Game Engine Runtime', () => {
  it('errors when quest has no valid start scene', () => {
    const quest = makeSampleQuest();
    quest.startSceneId = null;
    const res = createInitialState(quest);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('ERR_QUEST_NO_START_SCENE');
    }
  });

  it('plays through items, variables, float safety, visibility filter, log, and undo from ending', () => {
    const quest = makeSampleQuest();
    const start = createInitialState(quest);
    expect(start.ok).toBe(true);
    if (!start.ok) return;

    let state = start.state;
    let view = getGameView(quest, state, 'ru');
    expect(view.status).toBe('playing');
    expect(view.scene.title).toBe('Gate (10₽)');
    expect(view.scene.bodyMarkdown).toBe('Power: нет, unknown: {missing_var}.');
    expect(view.choices[2]?.available).toBe(false);
    expect(view.choices[2]?.lockReasons.map((r) => r.code)).toEqual([
      'LOCK_REQUIRES_ITEM',
      'LOCK_VAR_CONDITION',
      'LOCK_VAR_CONDITION',
    ]);

    // Locked choice cannot be applied
    const lockedAttempt = applyChoice(quest, state, 'c3', 'ru');
    expect(lockedAttempt.ok).toBe(false);

    // Pick up key (same-scene give_item hides afterwards)
    const pickKey = applyChoice(quest, state, 'c1', 'ru');
    expect(pickKey.ok).toBe(true);
    if (!pickKey.ok) return;
    expect(pickKey.newItems).toEqual(['Brass Key']);
    expect(pickKey.notices).toEqual([]);
    state = pickKey.state;

    view = getGameView(quest, state, 'ru');
    expect(view.choices.some((c) => c.id === 'c1')).toBe(false);

    // Flip switch -> sets bool + adds 0.1 + 0.2 = 0.3, emits NOTICE_ACTION_DONE
    const flip = applyChoice(quest, state, 'c2', 'ru');
    expect(flip.ok).toBe(true);
    if (!flip.ok) return;
    expect(flip.notices.map((n) => n.code)).toEqual(['NOTICE_ACTION_DONE']);
    state = flip.state;
    expect(state.variables.gold).toBe(0.3);

    // Enter dome -> win
    view = getGameView(quest, state, 'en');
    expect(view.choices.find((c) => c.id === 'c3')?.available).toBe(true);
    expect(view.choices.find((c) => c.id === 'c3')?.text).toBe('Unlock door (0.3)');

    const enter = applyChoice(quest, state, 'c3', 'en');
    expect(enter.ok).toBe(true);
    if (!enter.ok) return;
    state = enter.state;
    expect(state.inventory).toEqual([]);
    expect(state.log[2]?.choiceText).toBe('Unlock door (0.3)');

    view = getGameView(quest, state, 'en');
    expect(view.status).toBe('win');
    expect(view.canUndo).toBe(true);

    // Undo from win ending restores previous state
    const undone = undoStep(state);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.state.currentSceneId).toBe('s1');
    expect(undone.state.inventory).toEqual(['Brass Key']);
    expect(undone.state.steps).toBe(2);
  });

  it('caps undo stack at MAX_UNDO_STEPS', () => {
    const quest = makeSampleQuest();
    const start = createInitialState(quest);
    if (!start.ok) throw new Error('Expected valid start');

    let state = start.state;
    for (let i = 0; i < MAX_UNDO_STEPS + 10; i += 1) {
      const res = applyChoice(quest, state, 'c2', 'en');
      if (!res.ok) throw new Error('Expected c2 to succeed');
      state = res.state;
    }
    expect(state.undoStack.length).toBe(MAX_UNDO_STEPS);
  });

  it('evaluates typed fallbacks, boolean coercions, and numeric comparisons accurately', () => {
    expect(
      evaluateCondition({ type: 'var', key: 'flag', op: '==', value: false }, [], {}).passed,
    ).toBe(true);
    expect(
      evaluateCondition({ type: 'var', key: 'flag', op: '==', value: true }, [], { flag: 'да' })
        .passed,
    ).toBe(true);
    expect(
      evaluateCondition({ type: 'var', key: 'flag', op: '==', value: false }, [], { flag: 'нет' })
        .passed,
    ).toBe(true);
    expect(
      evaluateCondition({ type: 'var', key: 'score', op: '>', value: 5 }, [], { score: true })
        .passed,
    ).toBe(false);
    expect(
      evaluateCondition({ type: 'var', key: 'score', op: '>=', value: 5 }, [], { score: '5' })
        .passed,
    ).toBe(true);
  });

  it('interpolates Latin and Cyrillic identifiers and leaves unknown keys intact', () => {
    const text = interpolateText(
      '{hero_1}: флаг={флаг}, {unknown}',
      { hero_1: 'Алиса', флаг: true },
      'ru',
    );
    expect(text).toBe('Алиса: флаг=да, {unknown}');
  });
});

describe('Markdown & URL Sanitization', () => {
  it('renders safe markdown and neutralizes XSS/dangerous URLs', () => {
    const html = renderMarkdown(
      '# Title\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1)) and [ok](https://example.com)',
    );
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://example.com"');
    expect(sanitizeUrl('java\tscript:alert(1)')).toBeNull();
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeUrl('https://cdn.example.com/bg.png')).toBe('https://cdn.example.com/bg.png');
  });
});

describe('Static Graph Analyzer & Auto-Layout', () => {
  it('reports zero errors on valid sample quest', () => {
    const report = analyzeQuest(makeSampleQuest());
    expect(report.playable).toBe(true);
    expect(report.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(report.stats.winCount).toBe(1);
    expect(report.stats.itemCount).toBe(1);
  });

  it('detects unreachable items, dead ends, undeclared vars, and ending choices', () => {
    const quest = makeSampleQuest();
    quest.scenes.push({
      id: 's3',
      questId: 'q1',
      title: 'Secret',
      body: '',
      ending: 'none',
      posX: 0,
      posY: 0,
      imageUrl: null,
      audioUrl: null,
      choices: [
        {
          id: 'c_secret',
          sceneId: 's3',
          targetSceneId: null,
          text: 'Take relic {ghostVar}',
          sortOrder: 0,
          conditions: [],
          effects: [{ type: 'give_item', item: 'Relic' }],
        },
      ],
    });
    quest.scenes[0]?.choices.push({
      id: 'c_need_relic',
      sceneId: 's1',
      targetSceneId: 's2',
      text: 'Use relic',
      sortOrder: 3,
      conditions: [{ type: 'has_item', item: 'Relic', has: true }],
      effects: [],
    });
    quest.scenes[1]?.choices.push({
      id: 'c_end_choice',
      sceneId: 's2',
      targetSceneId: null,
      text: 'Unused',
      sortOrder: 0,
      conditions: [],
      effects: [],
    });

    const report = analyzeQuest(quest);
    expect(report.playable).toBe(false);
    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain('ERR_ITEM_UNREACHABLE');
    expect(codes).toContain('WARN_UNREACHABLE_SCENE');
    expect(codes).toContain('WARN_EMPTY_SCENE_BODY');
    expect(codes).toContain('WARN_DEAD_END_SCENE');
    expect(codes).toContain('WARN_UNDECLARED_VARIABLE');
    expect(codes).toContain('INFO_ENDING_HAS_CHOICES');
  });

  it('computes non-overlapping BFS auto-layout coordinates', () => {
    const quest = makeSampleQuest();
    quest.scenes.push({
      id: 's_unreach',
      questId: 'q1',
      title: 'Isolated',
      body: 'Alone',
      ending: 'none',
      posX: 0,
      posY: 0,
      imageUrl: null,
      audioUrl: null,
      choices: [],
    });
    const positions = computeAutoLayout(quest);
    expect(positions).toHaveLength(3);
    const byId = new Map(positions.map((p) => [p.sceneId, p]));
    expect(byId.get('s1')?.posX).toBeLessThan(byId.get('s2')?.posX ?? 0);
    expect(byId.get('s2')?.posX).toBeLessThan(byId.get('s_unreach')?.posX ?? 0);
  });
});

describe('Import / Export & Standalone Compiler', () => {
  it('imports quests with string/numeric IDs, missing startSceneId, and missing coordinates', () => {
    const imported = normalizeImportedQuest({
      title: 'Imported',
      scenes: [
        {
          id: 'intro',
          title: 'Intro',
          body: 'Hello',
          choices: [{ targetSceneId: 42, text: 'Go' }],
        },
        {
          id: 42,
          title: 'End',
          body: 'Done',
          ending: 'win',
          choices: [],
        },
      ],
    });
    expect(imported.scenes).toHaveLength(2);
    expect(imported.startSceneId).toBe(imported.scenes[0]?.id);
    expect(imported.scenes[0]?.choices[0]?.targetSceneId).toBe(imported.scenes[1]?.id);
    expect(imported.scenes[0]?.posX).toBeGreaterThan(0);

    const exported = exportQuestToPortable(imported);
    expect(exported.formatVersion).toBe(2);
    expect(exported.scenes).toHaveLength(2);
  });

  it('compiles Standalone HTML safely escaping </script> injection', () => {
    const quest = makeSampleQuest();
    if (quest.scenes[0]) {
      quest.scenes[0].body = 'Dangerous </script><script>alert(1)</script>\u2028\u2029';
    }
    const html = compileStandaloneHtml(quest, { locale: 'ru', theme: 'night' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('id="qf-quest-data"');
    // The raw unescaped </script> from quest body must never appear before the JSON script ends
    const jsonStart = html.indexOf('id="qf-quest-data"');
    const jsonEnd = html.indexOf('</script>', jsonStart);
    const jsonChunk = html.slice(jsonStart, jsonEnd);
    expect(jsonChunk).not.toContain('</script>');
    expect(jsonChunk).toContain('\\u003c/script\\u003e');
  });
});
