// Shared frontend utilities: API requests, DOM creation, toasts, themes, and i18n (EN/RU).

const LANG_KEY = 'tq_lang';

const I18N = {
  en: {
    // Common / Topbar
    theme_btn_title: 'Switch color theme',
    lang_btn_title: 'Switch interface language (EN / RU)',
    theme_night: '🌌 Night',
    theme_parchment: '📜 Parchment',
    theme_cyber: '⚡ Cyber',
    theme_toast: (name) => `Theme: ${name}`,
    lang_toast: 'Language: English',
    err_no_connection: 'Cannot connect to server',
    err_server: (status) => `Server error (${status})`,

    // Catalog (index.html)
    cat_page_title: 'Quest Forge — Interactive Story Engine',
    cat_hero_title: 'Quest Forge',
    cat_hero_sub: 'Play atmospheric interactive stories where every choice matters — or forge your own non-linear adventures with a visual 2D node graph, inventory, and variables.',
    cat_create_btn: '＋ Create New Quest',
    cat_import_btn: '📥 Import JSON',
    cat_section_title: 'Quest Catalog',
    cat_search_placeholder: '🔍 Search by title...',
    cat_loading: 'Loading quests…',
    cat_empty_search: 'No quests match your search.',
    cat_empty_all: 'No quests yet. Be the first author to forge one!',
    cat_load_error: (msg) => `Failed to load quests: ${msg}`,
    cat_no_desc: 'No description provided yet.',
    cat_quest_id_title: (id) => `Quest database ID: ${id}`,
    cat_win_endings_title: 'Victory endings',
    cat_lose_endings_title: 'Defeat endings & traps',
    cat_vars_title: 'Variables',
    cat_play_btn: '▶ Play',
    cat_play_disabled_title: 'Start scene is not selected',
    cat_builder_btn: '✎ Builder',
    cat_offline_html_btn: '📦 Offline HTML',
    cat_offline_html_title: 'Download standalone HTML game to play without a server',
    cat_export_json_title: 'Export quest as JSON',
    cat_dup_title: 'Duplicate quest',
    cat_del_title: 'Delete quest',
    cat_dup_success: (title) => `Duplicated: “${title}”`,
    cat_dup_error: (msg) => `Duplication failed: ${msg}`,
    cat_del_confirm: (title, id) => `Are you sure you want to delete quest “${title}” (#${id}) and all its scenes?`,
    cat_del_success: (title) => `Quest “${title}” deleted`,
    cat_del_error: (msg) => `Failed to delete quest: ${msg}`,
    cat_import_success: (title) => `Quest “${title}” imported successfully!`,
    cat_import_error: (msg) => `Import error: ${msg}`,

    // New Quest Modal
    modal_new_title: 'New Quest',
    modal_new_sub: 'Choose a title — you will add scenes, the 2D node map, and choices inside the builder.',
    modal_new_name_label: 'Title',
    modal_new_name_placeholder: 'e.g., “Escape from the Shadow Citadel”',
    modal_new_desc_label: 'Short Description',
    modal_new_desc_placeholder: 'What is your story about? Players will see this in the catalog.',
    modal_cancel: 'Cancel',
    modal_create_submit: 'Create & Open Builder',

    // Auth / Login Modal
    auth_login_btn: '🔑 Author Login',
    auth_logout_btn: 'Log Out',
    auth_author_default: 'Author',
    auth_welcome: (user) => `Welcome, ${user || 'Author'}!`,
    auth_bad_pass: 'Invalid password',
    auth_logged_out: 'Logged out of author mode',
    auth_need_login_create: 'Please log in as an author to create quests',
    auth_need_login_builder: 'Please log in as an author to open the builder',
    auth_need_login_dup: 'Please log in as an author to duplicate quests',
    auth_need_login_del: 'Please log in as an author to delete quests',
    auth_need_login_import: 'Please log in as an author to import quests',
    modal_login_title: '🔑 Author Login',
    modal_login_sub: 'Enter your credentials to create and manage quests.',
    modal_login_user_label: 'Username (default: admin)',
    modal_login_pass_label: 'Password',
    modal_login_pass_placeholder: 'Enter password',
    modal_login_submit: 'Sign In',

    // Player (play.html)
    play_page_title: 'Quest Forge — Player',
    play_doc_title: (title) => `${title} — Quest Forge`,
    play_log_btn: '📜 Log',
    play_log_title: 'History of your choices',
    play_undo_btn: '↶ Undo',
    play_undo_title: 'Undo the last move',
    play_audio_on: '🔊 Music',
    play_audio_off: '🔇 Sound On',
    play_offline_btn: '📦 Offline HTML',
    play_offline_title: 'Download as a self-contained HTML file to play offline',
    play_builder_btn: '✎ Builder',
    play_restart_btn: '↺ Restart',
    play_loading: 'Loading…',
    play_skip_hint: 'Click anywhere on the card to reveal full text',
    play_vars_heading: '📊 Stats & Variables',
    play_inv_heading: '🎒 Inventory',
    play_inv_empty: 'Empty for now',
    play_journey_heading: '🧭 Progress',
    play_stat_steps: 'Steps taken',
    play_stat_visited: 'Scenes discovered',
    play_visited_of: (v, total) => `${v} of ${total}`,
    play_kbd_hint_html: '<kbd>1</kbd>–<kbd>9</kbd> — quick choice,<br><kbd>Z</kbd> — undo last move,<br><kbd>Space</kbd> — reveal text instantly.<br>Progress is saved automatically.',
    play_log_modal_title: '📜 Journey Log',
    play_log_modal_sub: 'Chronicle of your decisions and visited scenes:',
    play_log_empty: 'You haven’t made any choices yet.',
    play_log_close: 'Close',
    play_bool_true: 'yes',
    play_bool_false: 'no',
    play_item_received: (item) => `Received item: “${item}”`,
    play_choice_locked: 'Choice locked',
    play_end_win_title: 'Victory!',
    play_end_win_sub: 'You have unraveled this story.',
    play_end_lose_title: 'Defeat',
    play_end_lose_sub: 'Your journey came to an abrupt end. Try another path.',
    play_end_end_title: 'The End',
    play_end_end_sub: 'There is no road further.',
    play_end_stats: (steps, visited, total, items) => `Steps: ${steps} · Scenes discovered: ${visited} of ${total} · Items: ${items}`,
    play_end_again: '↺ Play Again',
    play_end_undo: '↶ Undo Last Move',
    play_end_catalog: 'Back to Catalog',
    play_fatal_title: 'Could Not Start Game',
    play_fatal_open_builder: '✎ Open Builder',
    play_fatal_catalog: 'Back to Catalog',
    play_fatal_bad_url: 'Invalid quest URL.',
    play_undo_toast: 'Move undone',
    play_undo_err: (msg) => `Could not undo move: ${msg}`,
    play_restart_confirm: 'Restart the quest from the beginning? Current progress will be lost.',

    // Builder (builder.html)
    bld_page_title: 'Builder — Quest Forge',
    bld_doc_title: (title) => `${title} — Builder · Quest Forge`,
    bld_header_prefix: 'Builder ·',
    bld_tab_editor: '📝 Scene Editor',
    bld_tab_canvas: '🗺️ Graph Map (2D)',
    bld_save_saving: '● Saving…',
    bld_save_error: '⚠ Save error',
    bld_save_saved: '✓ Saved',
    bld_save_failed_toast: (msg) => `Failed to save: ${msg}`,
    bld_dup_quest_btn: '📋 Duplicate',
    bld_dup_quest_title: 'Create a full copy of this quest',
    bld_export_html_btn: '📦 Export HTML',
    bld_export_html_title: 'Download standalone HTML game',
    bld_export_json_title: 'Download quest as JSON',
    bld_play_btn: '▶ Play',
    bld_quest_heading: 'Quest Settings',
    bld_quest_title_label: 'Title',
    bld_quest_desc_label: 'Catalog Description',
    bld_quest_desc_placeholder: 'A couple of sentences to hook players',
    bld_start_scene_label: '★ Start Scene',
    bld_start_none: '— none selected —',
    bld_vars_label: 'Initial Variables (JSON)',
    bld_vars_placeholder: 'e.g. {"hp": 100, "gold": 50}',
    bld_scenes_heading: 'Scenes',
    bld_add_scene_btn: '＋ Scene',
    bld_validation_heading: 'Quest Validation',
    bld_validating: 'Checking…',
    bld_help_summary: '❓ Builder Guide (Twine-level)',
    bld_help_html: `
      <li><b>2D Map</b>: switch to “Graph Map (2D)” in the top bar to view scene cards and directional links. Drag nodes freely with your mouse!</li>
      <li><b>Variables</b>: define initial values in Quest Settings (e.g. <code>{"gold": 0, "hp": 100}</code>). Use <code>{gold}</code> in scene text or choices.</li>
      <li><b>Conditions & Actions</b>: choices can mutate variables (<code>add</code>, <code>set</code>) and check item/variable conditions.</li>
      <li><b>Media & Markdown</b>: supports bold, italic, blockquotes, lists, plus scene illustration and ambient audio URLs.</li>
      <li><b>Duplication</b>: clone entire quests or individual scenes with all transitions in one click.</li>
      <li><b>HTML Export</b>: compiles the quest into a single self-contained offline HTML file!</li>
    `,
    bld_zoom_in_title: 'Zoom in',
    bld_zoom_out_title: 'Zoom out',
    bld_zoom_reset_title: 'Reset zoom (100%)',
    bld_fit_btn: '⛶ Fit View',
    bld_fit_title: 'Fit all scenes in viewport',
    bld_autolayout_btn: '⚡ Auto-Layout',
    bld_autolayout_title: 'Automatically arrange graph nodes (BFS)',
    bld_autolayout_toast: 'Auto-layout applied!',
    bld_canvas_add_scene: '＋ New Scene',
    bld_scene_fallback: (id) => `Scene #${id}`,
    bld_new_scene_default: 'New Scene',
    bld_new_scene_num: (n) => `New Scene ${n}`,
    bld_report_ok_warn: (w, word) => `✅ Playable · ${w} ${word}`,
    bld_report_ok_clean: '✅ Quest is ready — no issues found',
    bld_report_errors: (e, word) => `⛔ ${e} ${word}`,
    bld_goto_scene_title: 'Jump to scene',
    bld_badge_start_title: 'Start scene',
    bld_badge_win_title: 'Victory ending',
    bld_badge_lose_title: 'Defeat ending',
    bld_stay_in_scene: '— stay in this scene —',
    bld_create_new_scene_opt: '＋ Create new scene…',
    bld_hint_stays_reward: 'Player stays in this scene and receives an item / updates variables.',
    bld_hint_stays_noop: '⚠ Choice leads nowhere and changes nothing.',
    bld_hint_req_item: (item) => `🔒 Requires “${item}”.`,
    bld_hint_conds: (n) => `⚙ Conditions: ${n}.`,
    bld_hint_actions: (n) => `⚡ Actions: ${n}.`,
    bld_jump_target_title: 'Jump to target scene',
    bld_scene_created_toast: (label) => `Created scene “${label}”`,
    bld_template_cond_btn: '⚡ Insert condition template',
    bld_template_cond_toast: (v) => `Inserted check template: ${v} >= 10`,
    bld_choice_placeholder: 'Choice button text, e.g. “Open the oak door”',
    bld_del_choice_title: 'Delete choice',
    bld_leads_to_label: 'Leads to scene',
    bld_req_item_label: '🔒 Requires item',
    bld_req_item_placeholder: 'none',
    bld_give_item_label: '🎁 Grants item',
    bld_give_item_placeholder: 'nothing',
    bld_adv_summary: '⚙️ Conditions & Variables (Twine Logic)',
    bld_cond_json_label: 'Conditions (JSON array)',
    bld_act_json_label: 'Actions / Variables (JSON)',
    bld_empty_select_scene: 'Select a scene from the list on the left.',
    bld_empty_no_scenes: 'This quest has no scenes yet.',
    bld_add_scene_large: '＋ Add Scene',
    bld_scene_title_placeholder: 'Scene title',
    bld_ending_normal: '📖 Normal scene',
    bld_ending_win: '🏆 Ending: Victory',
    bld_ending_lose: '💀 Ending: Defeat',
    bld_scene_text_placeholder: 'Describe what happens… Supports Markdown (bold, italic, quotes, {variables})',
    bld_scene_num_label: (id) => `Scene #${id}`,
    bld_scene_type_label: 'Scene Type',
    bld_scene_text_label: 'Scene Narrative (Markdown + {variables})',
    bld_scene_img_label: '🖼 Scene Illustration (URL)',
    bld_scene_audio_label: '🎵 Ambient Audio (URL)',
    bld_chip_start_scene: '★ Start Scene',
    bld_make_start_btn: '★ Set as Start',
    bld_dup_scene_btn: '📋 Duplicate Scene',
    bld_del_scene_btn: '🗑 Delete Scene',
    bld_choices_heading: (n) => `Choices (${n})`,
    bld_add_choice_btn: '＋ Add Choice',
    bld_note_ending_no_choices: 'This is an ending scene: choices are hidden during gameplay.',
    bld_note_no_choices_deadend: 'Add choices — otherwise this scene will be a dead end.',
    bld_incoming_heading: 'Incoming Links',
    bld_incoming_start_note: 'This is the start scene — the adventure begins here.',
    bld_incoming_none_note: 'No choices from other scenes lead here yet.',
    bld_dup_scene_toast: (title) => `Duplicated scene: “${title}”`,
    bld_dup_scene_err: (msg) => `Scene duplication failed: ${msg}`,
    bld_del_scene_incoming_warn: (n) => `\n\n${n} choice(s) point to this scene — they will be reset to “stay in scene”.`,
    bld_del_scene_confirm: (label, warn) => `Delete scene “${label}” and all its choices?${warn}`,
    bld_del_scene_toast: 'Scene deleted',
    bld_del_choice_confirm: (text) => `Delete choice “${text}”?`,
    bld_fatal_back_catalog: '← Back to Catalog',
    bld_dup_quest_toast: (title) => `Quest duplicated: “${title}”`,
    bld_dup_quest_err: (msg) => `Quest duplication failed: ${msg}`,
    bld_del_quest_confirm: (title) => `Delete quest “${title}” and all its scenes? This cannot be undone.`,
    bld_not_found_title: 'Quest Not Found',
    bld_not_found_bad_url: 'Invalid builder URL.',
    bld_not_found_deleted: 'It may have been deleted.',
  },
  ru: {
    // Common / Topbar
    theme_btn_title: 'Сменить тему оформления',
    lang_btn_title: 'Сменить язык интерфейса (EN / RU)',
    theme_night: '🌌 Ночь',
    theme_parchment: '📜 Пергамент',
    theme_cyber: '⚡ Кибер',
    theme_toast: (name) => `Тема: ${name}`,
    lang_toast: 'Язык: Русский',
    err_no_connection: 'Нет связи с сервером',
    err_server: (status) => `Ошибка сервера (${status})`,

    // Catalog (index.html)
    cat_page_title: 'Quest Forge — интерактивные текстовые квесты',
    cat_hero_title: 'Quest Forge',
    cat_hero_sub: 'Проходите атмосферные истории, где каждое решение имеет значение, — или создайте свою собственную с визуальным графом, инвентарём и переменными.',
    cat_create_btn: '＋ Создать новый квест',
    cat_import_btn: '📥 Импортировать JSON',
    cat_section_title: 'Каталог квестов',
    cat_search_placeholder: '🔍 Поиск по названию...',
    cat_loading: 'Загрузка квестов…',
    cat_empty_search: 'По запросу ничего не найдено.',
    cat_empty_all: 'Пока нет ни одного квеста. Станьте первым автором!',
    cat_load_error: (msg) => `Не удалось загрузить квесты: ${msg}`,
    cat_no_desc: 'Автор пока не добавил описание.',
    cat_quest_id_title: (id) => `ID квеста в базе: ${id}`,
    cat_win_endings_title: 'Победные концовки',
    cat_lose_endings_title: 'Ловушки и поражения',
    cat_vars_title: 'Переменные',
    cat_play_btn: '▶ Играть',
    cat_play_disabled_title: 'Не выбрана стартовая сцена',
    cat_builder_btn: '✎ Конструктор',
    cat_offline_html_btn: '📦 Офлайн HTML',
    cat_offline_html_title: 'Скачать автономную игру для запуска без сервера',
    cat_export_json_title: 'Экспорт квеста в JSON',
    cat_dup_title: 'Создать копию квеста',
    cat_del_title: 'Удалить квест',
    cat_dup_success: (title) => `Создана копия: «${title}»`,
    cat_dup_error: (msg) => `Ошибка копирования: ${msg}`,
    cat_del_confirm: (title, id) => `Вы действительно хотите удалить квест «${title}» (#${id}) со всеми сценами?`,
    cat_del_success: (title) => `Квест «${title}» удалён`,
    cat_del_error: (msg) => `Не удалось удалить квест: ${msg}`,
    cat_import_success: (title) => `Квест «${title}» успешно импортирован!`,
    cat_import_error: (msg) => `Ошибка импорта: ${msg}`,

    // New Quest Modal
    modal_new_title: 'Новый квест',
    modal_new_sub: 'Придумайте название — сцены, 2D карту и выборы добавите в конструкторе.',
    modal_new_name_label: 'Название',
    modal_new_name_placeholder: 'Например: «Побег из замка теней»',
    modal_new_desc_label: 'Короткое описание',
    modal_new_desc_placeholder: 'О чём ваша история? Это увидят игроки в каталоге.',
    modal_cancel: 'Отмена',
    modal_create_submit: 'Создать и открыть конструктор',

    // Auth / Login Modal
    auth_login_btn: '🔑 Вход для автора',
    auth_logout_btn: 'Выйти',
    auth_author_default: 'Автор',
    auth_welcome: (user) => `Добро пожаловать, ${user || 'автор'}!`,
    auth_bad_pass: 'Неверный пароль',
    auth_logged_out: 'Вы вышли из режима автора',
    auth_need_login_create: 'Для создания квестов требуется войти в систему как автор',
    auth_need_login_builder: 'Для перехода в конструктор войдите как автор',
    auth_need_login_dup: 'Для дублирования квеста войдите как автор',
    auth_need_login_del: 'Для удаления квестов требуется войти в систему как автор',
    auth_need_login_import: 'Для импорта квестов требуется войти в систему как автор',
    modal_login_title: '🔑 Вход для автора',
    modal_login_sub: 'Введите учетные данные для управления и создания квестов.',
    modal_login_user_label: 'Логин (по умолчанию: admin)',
    modal_login_pass_label: 'Пароль',
    modal_login_pass_placeholder: 'Введите пароль',
    modal_login_submit: 'Войти',

    // Player (play.html)
    play_page_title: 'Quest Forge — игра',
    play_doc_title: (title) => `${title} — Quest Forge`,
    play_log_btn: '📜 Журнал',
    play_log_title: 'История сделанных выборов',
    play_undo_btn: '↶ Назад',
    play_undo_title: 'Отменить последний ход',
    play_audio_on: '🔊 Музыка',
    play_audio_off: '🔇 Вкл. звук',
    play_offline_btn: '📦 Офлайн HTML',
    play_offline_title: 'Скачать как автономный HTML-файл для игры без сервера',
    play_builder_btn: '✎ Конструктор',
    play_restart_btn: '↺ Заново',
    play_loading: 'Загрузка…',
    play_skip_hint: 'Нажмите, чтобы показать текст целиком',
    play_vars_heading: '📊 Характеристики',
    play_inv_heading: '🎒 Инвентарь',
    play_inv_empty: 'Пока пусто',
    play_journey_heading: '🧭 Путешествие',
    play_stat_steps: 'Сделано шагов',
    play_stat_visited: 'Открыто сцен',
    play_visited_of: (v, total) => `${v} из ${total}`,
    play_kbd_hint_html: '<kbd>1</kbd>–<kbd>9</kbd> — быстрый выбор,<br><kbd>Z</kbd> — ход назад (Undo),<br><kbd>Пробел</kbd> — показать текст сразу.<br>Прогресс сохраняется автоматически.',
    play_log_modal_title: '📜 Журнал путешествия',
    play_log_modal_sub: 'Хроника ваших решений и пройденных сцен:',
    play_log_empty: 'Вы пока не сделали ни одного выбора.',
    play_log_close: 'Закрыть',
    play_bool_true: 'да',
    play_bool_false: 'нет',
    play_item_received: (item) => `Получен предмет: «${item}»`,
    play_choice_locked: 'Выбор заблокирован',
    play_end_win_title: 'Победа!',
    play_end_win_sub: 'Вы раскрыли эту историю.',
    play_end_lose_title: 'Поражение',
    play_end_lose_sub: 'Здесь ваш путь оборвался. Попробуйте иначе.',
    play_end_end_title: 'Конец истории',
    play_end_end_sub: 'Дальше дороги нет.',
    play_end_stats: (steps, visited, total, items) => `Шагов: ${steps} · Открыто сцен: ${visited} из ${total} · Предметов: ${items}`,
    play_end_again: '↺ Сыграть ещё раз',
    play_end_undo: '↶ Отменить ход',
    play_end_catalog: 'К каталогу квестов',
    play_fatal_title: 'Не удалось начать игру',
    play_fatal_open_builder: '✎ Открыть конструктор',
    play_fatal_catalog: 'К каталогу',
    play_fatal_bad_url: 'Некорректный адрес квеста.',
    play_undo_toast: 'Ход отменён',
    play_undo_err: (msg) => `Не удалось отменить ход: ${msg}`,
    play_restart_confirm: 'Начать квест заново? Текущий прогресс будет потерян.',

    // Builder (builder.html)
    bld_page_title: 'Конструктор — Quest Forge',
    bld_doc_title: (title) => `${title} — Конструктор · Quest Forge`,
    bld_header_prefix: 'Конструктор ·',
    bld_tab_editor: '📝 Редактор сцены',
    bld_tab_canvas: '🗺️ Карта графа (2D)',
    bld_save_saving: '● Сохранение…',
    bld_save_error: '⚠ Ошибка сохранения',
    bld_save_saved: '✓ Сохранено',
    bld_save_failed_toast: (msg) => `Не удалось сохранить: ${msg}`,
    bld_dup_quest_btn: '📋 Копия квеста',
    bld_dup_quest_title: 'Сделать полную копию квеста',
    bld_export_html_btn: '📦 Экспорт HTML',
    bld_export_html_title: 'Скачать standalone HTML игру',
    bld_export_json_title: 'Скачать квест в формате JSON',
    bld_play_btn: '▶ Играть',
    bld_quest_heading: 'Квест',
    bld_quest_title_label: 'Название',
    bld_quest_desc_label: 'Описание для каталога',
    bld_quest_desc_placeholder: 'Пара фраз, чтобы заинтриговать игроков',
    bld_start_scene_label: '★ Стартовая сцена',
    bld_start_none: '— не выбрана —',
    bld_vars_label: 'Стартовые переменные (JSON)',
    bld_vars_placeholder: 'например: {"hp": 100, "gold": 50}',
    bld_scenes_heading: 'Сцены',
    bld_add_scene_btn: '＋ Сцена',
    bld_validation_heading: 'Проверка квеста',
    bld_validating: 'Проверяем…',
    bld_help_summary: '❓ Возможности конструктора (Twine-level)',
    bld_help_html: `
      <li><b>2D Карта</b>: переключитесь на «Карту графа» сверху, чтобы видеть карточки сцен и связи со стрелками. Узлы можно перетаскивать мышкой!</li>
      <li><b>Переменные</b>: задайте стартовые значения в настройках квеста (например, <code>{"gold": 0, "hp": 100}</code>). В тексте сцены пишите <code>{gold}</code>.</li>
      <li><b>Условия и Действия</b>: в вариантах выбора можно менять переменные (<code>add</code>, <code>set</code>) и задавать условия показа/блокировки.</li>
      <li><b>Медиа и Markdown</b>: поддерживается жирный текст, курсив, цитаты, списки, а также URL постера сцены и аудио.</li>
      <li><b>Дублирование</b>: можно создавать копии квестов и копии сцен со всеми переходами в один клик.</li>
      <li><b>Экспорт HTML</b>: кнопка «Экспорт HTML» компилирует игру в один независимый файл для офлайн-игры!</li>
    `,
    bld_zoom_in_title: 'Приблизить',
    bld_zoom_out_title: 'Отдалить',
    bld_zoom_reset_title: 'Масштаб 100%',
    bld_fit_btn: '⛶ Обзор',
    bld_fit_title: 'Показать все сцены',
    bld_autolayout_btn: '⚡ Авто-расстановка',
    bld_autolayout_title: 'Красиво расставить узлы графа',
    bld_autolayout_toast: 'Авто-расстановка применена!',
    bld_canvas_add_scene: '＋ Новая сцена',
    bld_scene_fallback: (id) => `Сцена #${id}`,
    bld_new_scene_default: 'Новая сцена',
    bld_new_scene_num: (n) => `Новая сцена ${n}`,
    bld_report_ok_warn: (w, word) => `✅ Квест рабочий · ${w} ${word}`,
    bld_report_ok_clean: '✅ Квест готов — замечаний нет',
    bld_report_errors: (e, word) => `⛔ ${e} ${word}`,
    bld_goto_scene_title: 'Перейти к сцене',
    bld_badge_start_title: 'Стартовая сцена',
    bld_badge_win_title: 'Победа',
    bld_badge_lose_title: 'Поражение',
    bld_stay_in_scene: '— остаться в этой сцене —',
    bld_create_new_scene_opt: '＋ Создать новую сцену…',
    bld_hint_stays_reward: 'Игрок останется в сцене и получит награду/изменит переменные.',
    bld_hint_stays_noop: '⚠ Выбор никуда не ведёт и ничего не меняет.',
    bld_hint_req_item: (item) => `🔒 Требует «${item}».`,
    bld_hint_conds: (n) => `⚙ Условий: ${n}.`,
    bld_hint_actions: (n) => `⚡ Действий: ${n}.`,
    bld_jump_target_title: 'Перейти к целевой сцене',
    bld_scene_created_toast: (label) => `Создана сцена «${label}»`,
    bld_template_cond_btn: '⚡ Вставить шаблон условия',
    bld_template_cond_toast: (v) => `Добавлен шаблон проверки ${v} >= 10`,
    bld_choice_placeholder: 'Текст кнопки, например «Открыть дверь»',
    bld_del_choice_title: 'Удалить вариант',
    bld_leads_to_label: 'Ведёт в сцену',
    bld_req_item_label: '🔒 Требует предмет',
    bld_req_item_placeholder: 'не требуется',
    bld_give_item_label: '🎁 Выдаёт предмет',
    bld_give_item_placeholder: 'ничего',
    bld_adv_summary: '⚙️ Условия и переменные (Twine Logic)',
    bld_cond_json_label: 'Условия (JSON список)',
    bld_act_json_label: 'Действия / Переменные (JSON)',
    bld_empty_select_scene: 'Выберите сцену в списке слева.',
    bld_empty_no_scenes: 'В квесте пока нет сцен.',
    bld_add_scene_large: '＋ Добавить сцену',
    bld_scene_title_placeholder: 'Название сцены',
    bld_ending_normal: '📖 Обычная сцена',
    bld_ending_win: '🏆 Концовка: победа',
    bld_ending_lose: '💀 Концовка: поражение',
    bld_scene_text_placeholder: 'Опишите, что видит игрок… Поддерживается Markdown (жирный, курсив, цитаты, {переменные})',
    bld_scene_num_label: (id) => `Сцена #${id}`,
    bld_scene_type_label: 'Тип сцены',
    bld_scene_text_label: 'Текст сцены (Markdown + {переменные})',
    bld_scene_img_label: '🖼 Иллюстрация сцены (URL)',
    bld_scene_audio_label: '🎵 Фоновое аудио (URL)',
    bld_chip_start_scene: '★ Стартовая сцена',
    bld_make_start_btn: '★ Сделать стартовой',
    bld_dup_scene_btn: '📋 Дублировать сцену',
    bld_del_scene_btn: '🗑 Удалить сцену',
    bld_choices_heading: (n) => `Варианты выбора (${n})`,
    bld_add_choice_btn: '＋ Добавить вариант',
    bld_note_ending_no_choices: 'Это финальная сцена: варианты выбора не отображаются.',
    bld_note_no_choices_deadend: 'Добавьте варианты выбора — без них сцена станет тупиком.',
    bld_incoming_heading: 'Сюда ведут',
    bld_incoming_start_note: 'Это стартовая сцена — с неё начинается игра.',
    bld_incoming_none_note: 'Ни один вариант выбора пока не ведёт в эту сцену.',
    bld_dup_scene_toast: (title) => `Создана копия сцены: «${title}»`,
    bld_dup_scene_err: (msg) => `Ошибка копирования сцены: ${msg}`,
    bld_del_scene_incoming_warn: (n) => `\n\nНа неё ссылаются варианты выбора (${n}) — они станут «остаться в сцене».`,
    bld_del_scene_confirm: (label, warn) => `Удалить сцену «${label}» вместе с её вариантами выбора?${warn}`,
    bld_del_scene_toast: 'Сцена удалена',
    bld_del_choice_confirm: (text) => `Удалить вариант «${text}»?`,
    bld_fatal_back_catalog: '← В каталог',
    bld_dup_quest_toast: (title) => `Квест продублирован: «${title}»`,
    bld_dup_quest_err: (msg) => `Ошибка копирования квеста: ${msg}`,
    bld_del_quest_confirm: (title) => `Удалить квест «${title}» со всеми сценами? Это действие нельзя отменить.`,
    bld_not_found_title: 'Квест не найден',
    bld_not_found_bad_url: 'Некорректный адрес конструктора.',
    bld_not_found_deleted: 'Возможно, его удалили.',
  },
};

export function getLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {}
  return 'en';
}

export function setLang(lang) {
  const normalized = lang === 'ru' ? 'ru' : 'en';
  document.documentElement.lang = normalized;
  try { localStorage.setItem(LANG_KEY, normalized); } catch {}
  applyDomTranslations();
  updateThemeButtonLabel();
  updateLangButtonLabel();
  window.dispatchEvent(new CustomEvent('tq:langchange', { detail: { lang: normalized } }));
}

export function t(key, ...args) {
  const lang = getLang();
  const dict = I18N[lang] || I18N.en;
  const val = dict[key] ?? I18N.en[key] ?? key;
  return typeof val === 'function' ? val(...args) : val;
}

export function applyDomTranslations() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-html]')) {
    el.innerHTML = t(el.dataset.i18nHtml);
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
  }
}

/** Translates backend validation / game lock messages when English UI is active. */
export function translateServerText(msg) {
  if (!msg || typeof msg !== 'string' || getLang() === 'ru') return msg;

  // Game messages & lock reasons
  if (msg === 'Действие выполнено.') return 'Action completed.';
  if (msg === 'Ход отменён.') return 'Move undone.';
  let m = msg.match(/^Нужен предмет: «(.+)»$/);
  if (m) return `Requires item: “${m[1]}”`;
  m = msg.match(/^Не должно быть предмета: «(.+)»$/);
  if (m) return `Must not have item: “${m[1]}”`;
  m = msg.match(/^Требуется: (.+) \(сейчас: (.+)\)$/);
  if (m) return `Requires: ${m[1]} (current: ${m[2]})`;

  // Validation messages from analysis.py
  if (msg === 'В квесте нет ни одной сцены.') return 'The quest has no scenes.';
  if (msg === 'Не выбрана стартовая сцена.') return 'No start scene selected.';
  if (msg === 'В квесте нет ни одной победной концовки.') return 'The quest has no victory endings.';
  if (msg === 'Из стартовой сцены невозможно добраться ни до одной победной концовки.') {
    return 'No victory ending is reachable from the start scene.';
  }

  const labelFix = (lbl) => lbl.replace(/^Сцена #(\d+)$/, 'Scene #$1');

  m = msg.match(/^«(.+?)»: до сцены нельзя добраться из стартовой\.$/);
  if (m) return `“${labelFix(m[1])}”: scene is unreachable from the start scene.`;
  m = msg.match(/^«(.+?)»: у сцены нет текста\.$/);
  if (m) return `“${labelFix(m[1])}”: scene has no text.`;
  m = msg.match(/^«(.+?)»: в тексте упоминается переменная «(.+?)», которая нигде не определена\.$/);
  if (m) return `“${labelFix(m[1])}”: text references undeclared variable “${m[2]}”.`;
  m = msg.match(/^«(.+?)»: это концовка — варианты выбора игроку не показываются\.$/);
  if (m) return `“${labelFix(m[1])}”: ending scene — choices are not shown to the player.`;
  m = msg.match(/^«(.+?)»: тупик — нет вариантов выбора, а сцена не отмечена как концовка\.$/);
  if (m) return `“${labelFix(m[1])}”: dead end — no choices and scene is not marked as an ending.`;
  m = msg.match(/^«(.+?)»: тупик — все варианты выбора остаются в этой же сцене\.$/);
  if (m) return `“${labelFix(m[1])}”: dead end — all choices stay in the same scene.`;
  m = msg.match(/^«(.+?)»: у варианта выбора нет текста\.$/);
  if (m) return `“${labelFix(m[1])}”: a choice has no text.`;
  m = msg.match(/^«(.+?)»: в варианте выбора упоминается переменная «(.+?)», которая нигде не определена\.$/);
  if (m) return `“${labelFix(m[1])}”: choice references undeclared variable “${m[2]}”.`;
  m = msg.match(/^«(.+?)»: вариант «(.+?)» никуда не ведёт и ничего не меняет\.$/);
  if (m) return `“${labelFix(m[1])}”: choice “${m[2]}” leads nowhere and changes nothing.`;
  m = msg.match(/^«(.+?)»: предмет «(.+?)» нигде не выдаётся — вариант всегда будет заблокирован\.$/);
  if (m) return `“${labelFix(m[1])}”: item “${m[2]}” is never granted — choice will always be locked.`;
  m = msg.match(/^«(.+?)»: предмет «(.+?)» в условии нигде не выдаётся — вариант всегда будет заблокирован\.$/);
  if (m) return `“${labelFix(m[1])}”: item “${m[2]}” in condition is never granted — choice will always be locked.`;
  m = msg.match(/^«(.+?)»: условие проверяет переменную «(.+?)», которая нигде не определена\.$/);
  if (m) return `“${labelFix(m[1])}”: condition checks undeclared variable “${m[2]}”.`;
  m = msg.match(/^«(.+?)»: неизвестный оператор сравнения «(.+?)» в условии для «(.+?)»\.$/);
  if (m) return `“${labelFix(m[1])}”: unknown comparison operator “${m[2]}” in condition for “${m[3]}”.`;

  return msg;
}

export async function api(path, { method = 'GET', body, cache = 'no-store' } = {}) {
  const options = { method, headers: {}, cache };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw Object.assign(new Error(t('err_no_connection')), { status: 0 });
  }
  if (res.status === 204) return null;
  const raw = await res.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = raw; }
  }
  if (!res.ok) {
    const error = new Error(extractDetail(data) || t('err_server', res.status));
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

function extractDetail(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.detail === 'string') return translateServerText(data.detail);
  if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join('; ');
  return null;
}

/** Safe DOM element factory: text is always inserted via textContent. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'value') el.value = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  return el;
}

export function toast(message, type = 'info') {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const item = h('div', { class: `toast toast-${type}` }, message);
  box.append(item);
  setTimeout(() => {
    item.classList.add('hide');
    setTimeout(() => item.remove(), 400);
  }, type === 'error' ? 5000 : 3200);
}

/**
 * Bilingual pluralization:
 * - For Russian: uses [one, few, many]
 * - For English: uses enForms = [singular, plural] (or falls back to [one, many])
 */
export function plural(n, ruForms, enForms = null) {
  if (getLang() === 'en') {
    const [one, many] = enForms || [ruForms[0], ruForms[1] || ruForms[0]];
    return Math.abs(n) === 1 ? one : many;
  }
  const [one, few, many] = ruForms;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const ITEM_ICONS = [
  [/ключ|key/i, '🗝️'],
  [/линз|стекл|кристалл|хрустал|сфер|lens|glass|crystal|orb/i, '🔮'],
  [/карт|план|схем|map|chart|plan/i, '🗺️'],
  [/свеч|ламп|фонар|факел|candle|lamp|lantern|torch/i, '🕯️'],
  [/книг|дневник|тетрад|письм|запис|свит|book|diary|journal|letter|note|scroll|gdd/i, '📜'],
  [/монет|золот|деньг|coin|gold|money/i, '🪙'],
  [/меч|нож|кинжал|клин|sword|knife|dagger|blade/i, '🗡️'],
  [/зель|флакон|эликсир|энергет|potion|vial|elixir|fuel/i, '🧪'],
  [/амулет|кольц|медальон|amulet|ring|medallion/i, '💍'],
  [/верёвк|веревк|канат|rope|cord/i, '🪢'],
];

export function itemIcon(name = '') {
  for (const [re, icon] of ITEM_ICONS) if (re.test(name)) return icon;
  return '✦';
}

export function idFromPath() {
  const last = location.pathname.split('/').filter(Boolean).pop();
  const id = Number(last);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ================= Theme & Language Controls =================
const THEMES = ['night', 'parchment', 'cyber'];

function themeName(theme) {
  if (theme === 'parchment') return t('theme_parchment');
  if (theme === 'cyber') return t('theme_cyber');
  return t('theme_night');
}

function updateThemeButtonLabel() {
  const toggleBtn = document.getElementById('theme-toggle');
  if (!toggleBtn) return;
  const cur = document.documentElement.dataset.theme || 'night';
  toggleBtn.textContent = `🎨 ${themeName(cur)}`;
  toggleBtn.title = t('theme_btn_title');
}

function updateLangButtonLabel() {
  const langBtn = document.getElementById('lang-toggle');
  if (!langBtn) return;
  const cur = getLang();
  langBtn.textContent = cur === 'en' ? '🌐 EN' : '🌐 RU';
  langBtn.title = t('lang_btn_title');
}

export function initTheme() {
  const saved = localStorage.getItem('tq_theme') || 'night';
  setTheme(saved);

  // Initialize language (default: 'en')
  const lang = getLang();
  document.documentElement.lang = lang;
  applyDomTranslations();
  updateThemeButtonLabel();
  updateLangButtonLabel();

  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn && !toggleBtn.dataset.bound) {
    toggleBtn.dataset.bound = '1';
    toggleBtn.addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || 'night';
      const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
      setTheme(next);
      updateThemeButtonLabel();
      toast(t('theme_toast', themeName(next)), 'info');
    });
  }

  const langBtn = document.getElementById('lang-toggle');
  if (langBtn && !langBtn.dataset.bound) {
    langBtn.dataset.bound = '1';
    langBtn.addEventListener('click', () => {
      const nextLang = getLang() === 'en' ? 'ru' : 'en';
      setLang(nextLang);
      toast(t('lang_toast'), 'info');
    });
  }
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('tq_theme', theme); } catch {}
}
