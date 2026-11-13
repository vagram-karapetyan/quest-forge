import type { StructuredMessage } from './runtime.js';
import type { AppLocale } from './schema.js';

type TranslationDict = Record<string, string>;

const RU_DICT: TranslationDict = {
  'app.title': 'Quest Forge',
  'app.subtitle': 'Платформа и визуальный конструктор интерактивных историй',
  'nav.catalog': 'Каталог',
  'nav.builder': 'Конструктор',
  'nav.login': 'Вход автора',
  'nav.logout': 'Выйти',
  'nav.skipToContent': 'Перейти к основному содержимому',
  'theme.label': 'Тема',
  'theme.night': 'Ночь',
  'theme.parchment': 'Пергамент',
  'theme.cyber': 'Кибер',
  'lang.label': 'Язык',
  'lang.ru': 'RU',
  'lang.en': 'EN',

  // Catalog
  'catalog.title': 'Каталог историй',
  'catalog.subtitle':
    'Выбирайте интерактивное приключение для прохождения или открывайте в конструкторе.',
  'catalog.searchLabel': 'Поиск историй по названию или описанию',
  'catalog.searchPlaceholder': 'Поиск по названию или описанию…',
  'catalog.empty': 'Истории не найдены.',
  'catalog.createQuest': 'Новый квест',
  'catalog.createTitleLabel': 'Название истории',
  'catalog.createDescLabel': 'Описание',
  'catalog.createSubmit': 'Создать и открыть',
  'catalog.cancel': 'Отмена',
  'catalog.importJson': 'Импорт JSON',
  'catalog.play': 'Играть',
  'catalog.edit': 'Конструктор',
  'catalog.exportJson': 'JSON',
  'catalog.exportHtml': 'Standalone HTML',
  'catalog.duplicate': 'Дублировать',
  'catalog.delete': 'Удалить',
  'catalog.confirmDeleteTitle': 'Удалить квест?',
  'catalog.confirmDeleteBody': 'История «{title}» и все её сцены будут удалены безвозвратно.',
  'catalog.scenesCount': 'Сцен: {count}',
  'catalog.winsCount': 'Побед: {count}',
  'catalog.lossesCount': 'Поражений: {count}',
  'catalog.varsCount': 'Переменных: {count}',
  'catalog.ready': 'Готов к игре',
  'catalog.notReady': 'Нужна доработка',
  'catalog.noStartHint': 'Не задана стартовая сцена',
  'catalog.authRequiredHint': 'Войдите как автор для создания и редактирования',

  // Auth
  'auth.modalTitle': 'Вход автора',
  'auth.protectedHint':
    'Этот сервер работает в защищённом режиме. Введите учётные данные администратора.',
  'auth.username': 'Имя пользователя',
  'auth.password': 'Пароль',
  'auth.submit': 'Войти',
  'auth.cancel': 'Отмена',

  // Player
  'player.start': 'Начать историю',
  'player.restart': 'Сыграть ещё раз',
  'player.undo': 'Отменить ход',
  'player.backToCatalog': 'В каталог',
  'player.inventory': 'Инвентарь',
  'player.inventoryEmpty': 'Инвентарь пуст',
  'player.variables': 'Переменные',
  'player.variablesEmpty': 'Нет активных переменных',
  'player.log': 'Журнал решений',
  'player.logEmpty': 'Ходов пока нет',
  'player.steps': 'Шаги',
  'player.visited': 'Открыто сцен',
  'player.ending.win': 'Победа',
  'player.ending.lose': 'Поражение',
  'player.ending.end': 'Финал истории',
  'player.audioMute': 'Выключить звук',
  'player.audioUnmute': 'Включить звук',
  'player.newItem': 'Получен предмет',
  'player.hotkeysHint': 'Клавиши: 1–9 выбор, Z отмена, Space/Enter пропуск текста',
  'player.offlineBadge': 'Автономная версия',
  'player.loading': 'Загрузка истории…',
  'player.errorLoad': 'Не удалось загрузить историю',
  'player.skipTypewriter': 'Показать весь текст',

  // Builder placeholder (Stage 4)
  'builder.stageNotice': 'Визуальный 2D-конструктор будет подключён на следующем этапе (Этап 4).',

  // Structured runtime & analyzer messages
  'msg.ERR_AUTH_REQUIRED': 'Требуется вход автора',
  'msg.ERR_INVALID_CREDENTIALS': 'Неверное имя пользователя или пароль',
  'msg.ERR_RATE_LIMITED': 'Слишком много запросов. Повторите через {retryAfterSeconds} с.',
  'msg.ERR_QUEST_NOT_FOUND': 'Квест не найден',
  'msg.ERR_SESSION_NOT_FOUND': 'Игровая сессия не найдена',
  'msg.ERR_INVALID_IMPORT_JSON': 'Некорректный JSON импорта',
  'msg.ERR_VALIDATION': 'Проверьте корректность заполненных полей',
  'msg.NOTICE_ACTION_DONE': 'Действие выполнено',
  'msg.LOCK_REQUIRES_ITEM': 'Требуется предмет: {item}',
  'msg.LOCK_FORBIDS_ITEM': 'Не должно быть предмета: {item}',
  'msg.LOCK_VAR_CONDITION': 'Условие: {key} {op} {target} (сейчас: {actual})',
  'msg.LOCK_UNKNOWN_OPERATOR': 'Неизвестный оператор условия: {op}',
  'msg.ERR_QUEST_NO_START_SCENE':
    'У квеста не задана стартовая сцена. Откройте конструктор и выберите старт.',
  'msg.ERR_SCENE_NOT_FOUND': 'Сцена не найдена',
  'msg.ERR_GAME_ALREADY_ENDED': 'История уже завершена',
  'msg.ERR_CHOICE_NOT_FOUND': 'Выбор недоступен в текущей сцене',
  'msg.ERR_CHOICE_LOCKED': 'Выбор заблокирован условиями',
  'msg.ERR_TARGET_SCENE_NOT_FOUND': 'Целевая сцена не найдена',
  'msg.ERR_NOTHING_TO_UNDO': 'Нечего отменять',
  'msg.ERR_NO_SCENES': 'В квесте нет ни одной сцены',
  'msg.ERR_MISSING_START_SCENE': 'Не задана или не существует стартовая сцена',
  'msg.ERR_BROKEN_TARGET_SCENE':
    'В сцене «{sceneTitle}» выбор ведёт на несуществующую сцену ({targetSceneId})',
  'msg.ERR_ITEM_NEVER_GIVEN':
    'В сцене «{sceneTitle}» требуется предмет «{item}», но он нигде не выдаётся в активных сценах',
  'msg.ERR_ITEM_UNREACHABLE':
    'В сцене «{sceneTitle}» требуется предмет «{item}», но он выдаётся только в недостижимых сценах',
  'msg.WARN_UNREACHABLE_SCENE': 'Сцена «{sceneTitle}» недостижима из стартовой сцены',
  'msg.WARN_EMPTY_SCENE_BODY': 'У сцены «{sceneTitle}» пустой текст',
  'msg.WARN_DEAD_END_SCENE':
    'Сцена «{sceneTitle}» — тупик: не отмечена как концовка и не ведёт ни к одной другой сцене',
  'msg.WARN_EMPTY_CHOICE_TEXT': 'В сцене «{sceneTitle}» есть выбор без текста',
  'msg.WARN_NOOP_CHOICE':
    'В сцене «{sceneTitle}» выбор «{choiceText}» остаётся на месте и ничего не меняет',
  'msg.WARN_UNDECLARED_VARIABLE':
    'Переменная «{variable}» в сцене «{sceneTitle}» не объявлена в начальных переменных или эффектах',
  'msg.WARN_UNKNOWN_OPERATOR': 'Неизвестный оператор «{op}» в сцене «{sceneTitle}»',
  'msg.WARN_NO_WIN_ENDING': 'В квесте нет ни одной победной концовки',
  'msg.WARN_NO_REACHABLE_WIN': 'Ни одна победная концовка недостижима из стартовой сцены',
  'msg.INFO_ENDING_HAS_CHOICES':
    'Сцена-концовка «{sceneTitle}» содержит выборы ({count}), но в игре они не показываются',
};

const EN_DICT: TranslationDict = {
  'app.title': 'Quest Forge',
  'app.subtitle': 'Interactive fiction platform & visual 2D story builder',
  'nav.catalog': 'Catalog',
  'nav.builder': 'Builder',
  'nav.login': 'Author Sign In',
  'nav.logout': 'Sign Out',
  'nav.skipToContent': 'Skip to main content',
  'theme.label': 'Theme',
  'theme.night': 'Night',
  'theme.parchment': 'Parchment',
  'theme.cyber': 'Cyber',
  'lang.label': 'Language',
  'lang.ru': 'RU',
  'lang.en': 'EN',

  // Catalog
  'catalog.title': 'Story Catalog',
  'catalog.subtitle': 'Choose an interactive adventure to play or open in the visual builder.',
  'catalog.searchLabel': 'Search stories by title or description',
  'catalog.searchPlaceholder': 'Search by title or description…',
  'catalog.empty': 'No stories found.',
  'catalog.createQuest': 'New Quest',
  'catalog.createTitleLabel': 'Story title',
  'catalog.createDescLabel': 'Description',
  'catalog.createSubmit': 'Create & Open',
  'catalog.cancel': 'Cancel',
  'catalog.importJson': 'Import JSON',
  'catalog.play': 'Play',
  'catalog.edit': 'Builder',
  'catalog.exportJson': 'JSON',
  'catalog.exportHtml': 'Standalone HTML',
  'catalog.duplicate': 'Duplicate',
  'catalog.delete': 'Delete',
  'catalog.confirmDeleteTitle': 'Delete quest?',
  'catalog.confirmDeleteBody': 'Story "{title}" and all of its scenes will be permanently deleted.',
  'catalog.scenesCount': 'Scenes: {count}',
  'catalog.winsCount': 'Wins: {count}',
  'catalog.lossesCount': 'Losses: {count}',
  'catalog.varsCount': 'Variables: {count}',
  'catalog.ready': 'Ready to play',
  'catalog.notReady': 'Needs fixes',
  'catalog.noStartHint': 'No start scene assigned',
  'catalog.authRequiredHint': 'Sign in as author to create or edit stories',

  // Auth
  'auth.modalTitle': 'Author Sign In',
  'auth.protectedHint':
    'This server is running in protected mode. Enter administrator credentials.',
  'auth.username': 'Username',
  'auth.password': 'Password',
  'auth.submit': 'Sign In',
  'auth.cancel': 'Cancel',

  // Player
  'player.start': 'Start Story',
  'player.restart': 'Play Again',
  'player.undo': 'Undo',
  'player.backToCatalog': 'Back to Catalog',
  'player.inventory': 'Inventory',
  'player.inventoryEmpty': 'Inventory is empty',
  'player.variables': 'Variables',
  'player.variablesEmpty': 'No active variables',
  'player.log': 'Decision Log',
  'player.logEmpty': 'No decisions yet',
  'player.steps': 'Steps',
  'player.visited': 'Scenes visited',
  'player.ending.win': 'Victory',
  'player.ending.lose': 'Defeat',
  'player.ending.end': 'Story End',
  'player.audioMute': 'Mute audio',
  'player.audioUnmute': 'Unmute audio',
  'player.newItem': 'Item acquired',
  'player.hotkeysHint': 'Keys: 1–9 choose, Z undo, Space/Enter skip typewriter',
  'player.offlineBadge': 'Offline Edition',
  'player.loading': 'Loading story…',
  'player.errorLoad': 'Failed to load story',
  'player.skipTypewriter': 'Show full text',

  // Builder placeholder (Stage 4)
  'builder.stageNotice': 'The visual 2D builder will be connected in the next milestone (Stage 4).',

  // Structured runtime & analyzer messages
  'msg.ERR_AUTH_REQUIRED': 'Author authentication is required',
  'msg.ERR_INVALID_CREDENTIALS': 'Invalid username or password',
  'msg.ERR_RATE_LIMITED': 'Too many requests. Try again in {retryAfterSeconds}s.',
  'msg.ERR_QUEST_NOT_FOUND': 'Quest not found',
  'msg.ERR_SESSION_NOT_FOUND': 'Game session not found',
  'msg.ERR_INVALID_IMPORT_JSON': 'Invalid import JSON',
  'msg.ERR_VALIDATION': 'Please check the submitted fields',
  'msg.NOTICE_ACTION_DONE': 'Action completed',
  'msg.LOCK_REQUIRES_ITEM': 'Requires item: {item}',
  'msg.LOCK_FORBIDS_ITEM': 'Must not have item: {item}',
  'msg.LOCK_VAR_CONDITION': 'Condition: {key} {op} {target} (current: {actual})',
  'msg.LOCK_UNKNOWN_OPERATOR': 'Unknown condition operator: {op}',
  'msg.ERR_QUEST_NO_START_SCENE': 'Quest has no valid start scene. Open the builder to assign one.',
  'msg.ERR_SCENE_NOT_FOUND': 'Scene not found',
  'msg.ERR_GAME_ALREADY_ENDED': 'The story has already ended',
  'msg.ERR_CHOICE_NOT_FOUND': 'Choice is not available in the current scene',
  'msg.ERR_CHOICE_LOCKED': 'Choice is locked by conditions',
  'msg.ERR_TARGET_SCENE_NOT_FOUND': 'Target scene not found',
  'msg.ERR_NOTHING_TO_UNDO': 'Nothing to undo',
  'msg.ERR_NO_SCENES': 'Quest has no scenes',
  'msg.ERR_MISSING_START_SCENE': 'Start scene is missing or invalid',
  'msg.ERR_BROKEN_TARGET_SCENE':
    'In scene "{sceneTitle}", a choice targets a missing scene ({targetSceneId})',
  'msg.ERR_ITEM_NEVER_GIVEN':
    'Scene "{sceneTitle}" requires item "{item}", which is never granted in active scenes',
  'msg.ERR_ITEM_UNREACHABLE':
    'Scene "{sceneTitle}" requires item "{item}", which is only granted in unreachable scenes',
  'msg.WARN_UNREACHABLE_SCENE': 'Scene "{sceneTitle}" is unreachable from the start scene',
  'msg.WARN_EMPTY_SCENE_BODY': 'Scene "{sceneTitle}" has empty text',
  'msg.WARN_DEAD_END_SCENE':
    'Scene "{sceneTitle}" is a dead end: not marked as an ending and has no outgoing transitions',
  'msg.WARN_EMPTY_CHOICE_TEXT': 'Scene "{sceneTitle}" has a choice with empty text',
  'msg.WARN_NOOP_CHOICE':
    'In scene "{sceneTitle}", choice "{choiceText}" stays on the scene and changes nothing',
  'msg.WARN_UNDECLARED_VARIABLE':
    'Variable "{variable}" in scene "{sceneTitle}" is not declared in initial variables or effects',
  'msg.WARN_UNKNOWN_OPERATOR': 'Unknown operator "{op}" in scene "{sceneTitle}"',
  'msg.WARN_NO_WIN_ENDING': 'Quest has no victory ending',
  'msg.WARN_NO_REACHABLE_WIN': 'No victory ending is reachable from the start scene',
  'msg.INFO_ENDING_HAS_CHOICES':
    'Ending scene "{sceneTitle}" has {count} choice(s) that will not be shown in game',
};

export function t(
  locale: AppLocale,
  key: string,
  params: Record<string, string | number | boolean> = {},
): string {
  const dict = locale === 'en' ? EN_DICT : RU_DICT;
  const template = dict[key] ?? RU_DICT[key] ?? key;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (full, paramKey: string) => {
    if (!Object.hasOwn(params, paramKey)) {
      return full;
    }
    const val = params[paramKey];
    if (typeof val === 'boolean') {
      return locale === 'ru' ? (val ? 'да' : 'нет') : val ? 'yes' : 'no';
    }
    return String(val);
  });
}

export function formatStructuredMessage(locale: AppLocale, message: StructuredMessage): string {
  return t(locale, `msg.${message.code}`, message.params);
}
