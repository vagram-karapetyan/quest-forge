import { STANDALONE_CSS, STANDALONE_SCRIPT } from './generated/standalone-assets.js';
import { escapeHtml } from './markdown.js';
import { exportQuestToPortable, type AppLocale, type AppTheme, type Quest } from './schema.js';

export type CompileStandaloneOptions = {
  locale?: AppLocale;
  theme?: AppTheme;
  appVersion?: string;
};

export function serializeJsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function sanitizeCssForStyleTag(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

export function compileStandaloneHtml(
  quest: Quest,
  options: CompileStandaloneOptions = {},
): string {
  const locale: AppLocale = options.locale ?? 'ru';
  const theme: AppTheme = options.theme ?? 'night';
  const appVersion = options.appVersion ?? '0.1.0';
  const portable = exportQuestToPortable(quest);
  const payload = {
    quest: portable,
    locale,
    theme,
    appVersion,
  };

  const safeTitle = escapeHtml(quest.title);
  const safeCss = sanitizeCssForStyleTag(STANDALONE_CSS);
  const safeJson = serializeJsonForScript(payload);
  const safeScript = STANDALONE_SCRIPT.replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="${locale}" data-theme="${theme}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle} — Quest Forge</title>
  <style>${safeCss}</style>
</head>
<body>
  <div id="qf-standalone-root" class="qf-app-root"></div>
  <script id="qf-quest-data" type="application/json">${safeJson}</script>
  <script>${safeScript}</script>
</body>
</html>
`;
}
