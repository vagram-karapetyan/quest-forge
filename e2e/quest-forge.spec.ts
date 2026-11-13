import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';

test.describe('Quest Forge v2 E2E', () => {
  test('catalog themes, EN/RU toggle, and Observatory demo play + undo', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Каталог историй' })).toBeVisible();
    await expect(page.getByText('Тайна заброшенной обсерватории')).toBeVisible();
    await expect(page.getByText('Инди-разработчик: От идеи до релиза')).toBeVisible();

    // Switch locale RU -> EN -> RU
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Story Catalog' })).toBeVisible();
    await page.getByRole('button', { name: 'RU', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Каталог историй' })).toBeVisible();

    // Switch themes and verify data-theme attribute
    await page.getByRole('button', { name: 'Пергамент' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'parchment');
    await page.getByRole('button', { name: 'Кибер' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cyber');
    await page.getByRole('button', { name: 'Ночь' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

    // Play Observatory demo
    const obsCard = page.locator('article.qf-quest-card', {
      hasText: 'Тайна заброшенной обсерватории',
    });
    await obsCard.getByRole('button', { name: 'Играть' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'У ворот обсерватории' }),
    ).toBeVisible();

    // Walk into garden -> lodge -> take Brass Key
    await page.getByRole('button', { name: /заросшей тропинке/i }).click();
    await page.getByRole('button', { name: /сторожку смотрителя/i }).click();
    await page.getByRole('button', { name: /Взять латунный ключ/i }).click();

    await expect(page.getByText('Латунный ключ').first()).toBeVisible();

    // Undo last choice and verify key is removed from inventory
    await page.getByRole('button', { name: 'Отменить ход' }).click();
    await expect(page.getByText('Инвентарь пуст')).toBeVisible();
  });

  test('2D builder authoring, XSS sanitization, online player, and Standalone HTML parity', async ({
    page,
    context,
  }, testInfo) => {
    await page.goto('/');

    // Create a new quest from Catalog dialog
    await page.getByRole('button', { name: 'Новый квест' }).click();
    const titleInput = page.getByLabel('Название истории');
    await titleInput.fill('E2E Parity Quest');
    await page.getByLabel('Описание').fill('Parity & XSS verification');
    await page.getByRole('button', { name: 'Создать и открыть' }).click();

    await page.waitForURL(/\/builder\/.+/);
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Parity Quest' })).toBeVisible();

    // 1. Add initial variable `energy = 3` in Quest tab
    await page.getByRole('tab', { name: 'Квест' }).click();
    await page.getByPlaceholder('Имя переменной').fill('energy');
    await page.getByRole('button', { name: /\+ Добавить переменную/i }).click();

    const energyInput = page.getByLabel('energy', { exact: true });
    await energyInput.fill('3');
    await energyInput.blur();
    await expect(page.getByText('Сохранено')).toBeVisible();

    // 2. Edit start scene with variable interpolation, Markdown, and XSS payloads
    await page.getByRole('tab', { name: 'Сцена' }).click();
    const sceneTitleInput = page.getByLabel('Заголовок сцены');
    await sceneTitleInput.fill('Стартовая комната');

    const xssMarkdownBody =
      'Энергия: {energy}. **Кристалл рядом**.\n\n![evil](javascript:alert(1))\n\n[bad](javascript:window.__xss=1)\n\n<script>window.__xss=1;</script><img src=x onerror="window.__xss=2">';
    await page.getByLabel(/Текст сцены/).fill(xssMarkdownBody);
    await page.getByRole('button', { name: 'Сохранить сцену' }).click();
    await expect(page.getByText('Сохранено')).toBeVisible();

    // 3. Add a choice with `give_item` effect and linked victory scene
    await page.getByRole('button', { name: /\+ Добавить выбор/i }).click();
    const choiceTextInput = page.getByLabel('Текст выбора').first();
    await choiceTextInput.fill('Взять кристалл');
    await choiceTextInput.blur();

    await page.getByRole('button', { name: '+ Эффект: предмет' }).click();
    const itemInput = page.getByLabel('Предмет').first();
    await itemInput.fill('Кристалл');
    await itemInput.blur();

    await page.getByRole('button', { name: '+ Новая сцена и связь' }).click();
    await expect(page.getByText('Сохранено')).toBeVisible();

    // Select the newly created linked scene in the Scene List and configure it as a win ending
    const scenesSection = page.locator('section', { hasText: 'Список сцен' });
    await scenesSection.locator('button.qf-scene-list-select', { hasText: 'Новая сцена' }).click();

    await page.getByLabel('Заголовок сцены').fill('Победный зал');
    await page.getByLabel('Тип сцены').selectOption('win');
    await page.getByLabel(/Текст сцены/).fill('Победа с энергией {energy}!');
    await page.getByRole('button', { name: 'Сохранить сцену' }).click();
    await expect(page.getByText('Сохранено')).toBeVisible();

    // Run BFS auto-layout and verify graph validator reports Ready
    await page.getByRole('button', { name: 'Авто-раскладка' }).click();
    await page.getByRole('tab', { name: /Валидатор/i }).click();
    await expect(page.getByRole('tabpanel').getByText('Готов к игре')).toBeVisible();

    // Export Standalone HTML directly from Quest Settings tab before playing
    await page.getByRole('tab', { name: 'Квест' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Standalone HTML' }).click();
    const download = await downloadPromise;
    const downloadedPath = testInfo.outputPath('e2e-parity-quest.html');
    await download.saveAs(downloadedPath);

    // 4. Test online web player & XSS sanitization
    await page.getByRole('button', { name: 'Играть / Проверить' }).click();
    await page.waitForURL(/\/play\/.+/);

    await expect(page.getByRole('heading', { level: 1, name: 'Стартовая комната' })).toBeVisible();
    await expect(page.getByText(/Энергия: 3\./)).toBeVisible();
    await expect(page.locator('.qf-narrative strong').first()).toHaveText('Кристалл рядом');

    // Assert XSS payloads did NOT execute or inject scripts/javascript: hrefs
    const onlineXss = await page.evaluate(() => ({
      xssFlag: (window as unknown as { __xss?: unknown }).__xss ?? null,
      scriptsInNarrative: document.querySelectorAll('.qf-narrative script').length,
      unsafeLinks: Array.from(document.querySelectorAll('.qf-narrative a')).filter((a) =>
        (a.getAttribute('href') ?? '').toLowerCase().includes('javascript:'),
      ).length,
    }));
    expect(onlineXss).toEqual({
      xssFlag: null,
      scriptsInNarrative: 0,
      unsafeLinks: 0,
    });

    await page.getByRole('button', { name: /Взять кристалл/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Победный зал' })).toBeVisible();
    await expect(page.getByText('Победа с энергией 3!')).toBeVisible();
    await expect(page.getByText('Кристалл').first()).toBeVisible();

    // 5. Open downloaded Standalone HTML via file:// URL and verify parity & XSS safety
    expect(downloadedPath).not.toBeNull();
    if (!downloadedPath) return;

    const offlinePage = await context.newPage();
    try {
      await offlinePage.goto(pathToFileURL(downloadedPath).href);
      await expect(
        offlinePage.getByRole('heading', { level: 1, name: 'Стартовая комната' }),
      ).toBeVisible();
      await expect(offlinePage.getByText(/Энергия: 3\./)).toBeVisible();
      await expect(offlinePage.getByText('Автономная версия')).toBeVisible();

      const offlineXss = await offlinePage.evaluate(() => ({
        xssFlag: (window as unknown as { __xss?: unknown }).__xss ?? null,
        scriptsInNarrative: document.querySelectorAll('.qf-narrative script').length,
        unsafeLinks: Array.from(document.querySelectorAll('.qf-narrative a')).filter((a) =>
          (a.getAttribute('href') ?? '').toLowerCase().includes('javascript:'),
        ).length,
      }));
      expect(offlineXss).toEqual({
        xssFlag: null,
        scriptsInNarrative: 0,
        unsafeLinks: 0,
      });

      // Switch theme and language inside Standalone HTML
      await offlinePage.getByRole('button', { name: 'Пергамент' }).click();
      await expect(offlinePage.locator('html')).toHaveAttribute('data-theme', 'parchment');
      await offlinePage.getByRole('button', { name: 'EN', exact: true }).click();
      await expect(offlinePage.getByText('Offline Edition')).toBeVisible();

      // Complete playthrough and verify victory + item + undo from ending screen
      await offlinePage.getByRole('button', { name: /Взять кристалл/i }).click();
      await expect(
        offlinePage.getByRole('heading', { level: 1, name: 'Победный зал' }),
      ).toBeVisible();
      await expect(offlinePage.getByText('Победа с энергией 3!')).toBeVisible();
      await expect(offlinePage.getByText('Кристалл').first()).toBeVisible();

      await offlinePage.getByRole('button', { name: /Undo/i }).first().click();
      await expect(
        offlinePage.getByRole('heading', { level: 1, name: 'Стартовая комната' }),
      ).toBeVisible();
    } finally {
      await offlinePage.close();
    }
  });
});
