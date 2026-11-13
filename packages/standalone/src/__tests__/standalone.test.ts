import { compileStandaloneHtml, type Quest } from '@quest-forge/engine';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

function createStandaloneTestQuest(): Quest {
  return {
    id: 'q-standalone',
    title: 'Pocket Beacon',
    description: 'Mini test adventure for standalone bundle',
    startSceneId: 'start',
    initialVariables: { energy: 1 },
    scenes: [
      {
        id: 'start',
        questId: 'q-standalone',
        title: 'Airlock',
        body: 'Signal strength: {energy}.',
        ending: 'none',
        posX: 80,
        posY: 80,
        imageUrl: null,
        audioUrl: null,
        choices: [
          {
            id: 'c-boost',
            sceneId: 'start',
            targetSceneId: 'win',
            text: 'Transmit distress call',
            sortOrder: 0,
            conditions: [{ type: 'var', key: 'energy', op: '>=', value: 1 }],
            effects: [{ type: 'give_item', item: 'Beacon' }],
          },
        ],
      },
      {
        id: 'win',
        questId: 'q-standalone',
        title: 'Rescue Ship',
        body: 'Rescued with **{energy}** power.',
        ending: 'win',
        posX: 420,
        posY: 80,
        imageUrl: null,
        audioUrl: null,
        choices: [],
      },
    ],
  };
}

describe('Standalone HTML Bundle', () => {
  it('boots compiled HTML in a browser-like DOM and completes a playthrough', () => {
    const quest = createStandaloneTestQuest();
    const html = compileStandaloneHtml(quest, {
      locale: 'en',
      theme: 'cyber',
      appVersion: '0.1.0',
    });

    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://questforge.local/',
    });

    try {
      const { document } = dom.window;
      expect(document.documentElement.getAttribute('data-theme')).toBe('cyber');
      expect(document.documentElement.getAttribute('lang')).toBe('en');

      const root = document.getElementById('qf-standalone-root');
      expect(root?.textContent).toContain('Airlock');
      expect(root?.textContent).toContain('Transmit distress call');

      const choiceBtn = Array.from(document.querySelectorAll('button')).find((btn) =>
        btn.textContent.includes('Transmit distress call'),
      );
      expect(choiceBtn).toBeDefined();
      choiceBtn?.click();

      expect(root?.textContent).toContain('Rescue Ship');
      expect(root?.textContent).toContain('Beacon');
    } finally {
      dom.window.close();
    }
  });
});
