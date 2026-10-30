/**
 * Ukrainian, keyed by the English text (ADR 0033). `uk.test.ts` checks that every text the shell
 * translates has an entry here.
 */
export const UK: Record<string, string> = {
  // The shell (ADR 0034): the bar, "My apps", tiles, the new app sheet.
  "Write to your Helper, like in a messenger": "Пишіть Помічнику, як у месенджері",
  Alerts: "Сповіщення",
  "When something broke or needs attention": "Коли щось зламалося або потребує уваги",
  Reminders: "Нагадування",
  "What to do regularly: every morning, every Friday…": "Що робити регулярно: щоранку, щопʼятниці…",
  Helpers: "Помічники",
  "AI agents: who they are, what they can do and remember, what runs them":
    "ШІ-агенти: хто вони, що вміють і памʼятають, через що працюють",
  "Instructions your helpers use": "Інструкції, якими користуються помічники",
  "What your helpers remember about you": "Що помічники запамʼятали про вас",
  Look: "Вигляд",
  "Theme, windows, side bar": "Тема, вікна, бічна панель",
  Language: "Мова",
  "Українська · English": "Українська · English",
  Phone: "Телефон",
  "Open Aura from your phone": "Відкривайте Aura з телефона",
  Backups: "Резервні копії",
  "Put everything back as it was": "Повернути все, як було раніше",
  "Ready-made packs": "Готові набори",
  "Apps and helpers you can add": "Застосунки й помічники, які можна додати",
  "Helper programs": "Програми помічників",
  "Claude Code, Codex, Ollama…": "Claude Code, Codex, Ollama…",
  Essentials: "Основне",
  Settings: "Налаштування",
  History: "Історія",
  "Real money only on paid APIs (an OpenAI-compatible API).":
    "Справжні гроші лише на платних API (OpenAI-сумісний API).",
  "Your helpers need an AI to think with. The easiest way is the built-in local AI: Aura installs it and a model that fits this computer.":
    "Помічникам потрібен ШІ, щоб думати. Найпростіше — вбудований локальний ШІ: Aura встановить його й модель, що підходить цьому комп'ютеру.",
  "Set up the local AI": "Налаштувати локальний ШІ",
  "I already use an agent app (Claude Code, Codex…) or Ollama":
    "Я вже користуюся агентним застосунком (Claude Code, Codex…) або Ollama",
  "Open Settings → AI": "Відкрити Налаштування → ШІ",
  "Tools and keys": "Інструменти й ключі",
  AI: "ШІ",
  Automations: "Автоматизації",
  Data: "Дані",
  Advanced: "Додатково",
  "AI, helpers, automations, look, history": "ШІ, помічники, автоматизації, вигляд, історія",
  "Its AI": "Його ШІ",
  "Pick from the AI you connected.": "Оберіть серед підключених ШІ.",
  "Connect another": "Підключити ще",
  "Default ({name})": "Типовий ({name})",
  "not connected": "не підключено",
  Model: "Модель",
  "its default model": "його типова модель",
  "the default model": "типова модель",
  Saved: "Збережено",
  Team: "Команда",
  "Skill library": "Бібліотека навичок",
  "What they remember": "Що вони пам'ятають",
  "Alerts from your tools": "Сповіщення з ваших інструментів",
  "Monitoring tools post alerts to a web address; your Helper reads them first in the Alerts chat.":
    "Інструменти моніторингу надсилають сповіщення на вебадресу; ваш Помічник першим читає їх у чаті Сповіщень.",
  "Built-in parts": "Вбудовані частини",
  "Turned off, a part has no routes, tools or background work.":
    "Вимкнена частина не має маршрутів, інструментів і фонової роботи.",
  "New window": "Нове вікно",
  "Find an app or a setting": "Знайти застосунок або налаштування",
  "Nothing found.": "Нічого не знайшли.",
  "New window beside": "Нове вікно поруч",
  Close: "Закрити",
  "Open another app here": "Відкрити тут інший застосунок",
  "Open an app": "Відкрийте застосунок",
  "Click it here or on the bar. You can open two side by side.":
    "Натисніть на нього тут або на панелі зліва. Можна відкрити два поруч.",
  "Write in its chat": "Напишіть у чаті",
  "Every app has a Chat button. Tell the AI helper in plain words: “add a phone column”, “make a monthly report”.":
    "Кнопка «Чат» у кожному застосунку. Напишіть ШІ-помічнику звичайними словами: «додай колонку з телефоном», «зроби звіт за місяць».",
  "Approve the change": "Погодьте зміну",
  "The helper shows exactly what will change. Nothing changes without your “Yes”, and any version can come back.":
    "Помічник покаже, що саме зміниться. Без вашого «Так» нічого не зміниться, а будь-яку версію можна повернути.",
  "My apps": "Мої застосунки",
  "How it all works": "Як тут усе працює",
  "Got it": "Зрозуміло",
  "Make such an app?": "Створити такий застосунок?",
  "Advanced mode": "Розширений режим",
  "Enter: open · Esc: close": "Enter — відкрити · Esc — закрити",
  "Your own": "Свій варіант",
  "Describe it, and a helper builds it": "Опишіть його, і помічник збере",
  Name: "Назва",
  "e.g. Warehouse": "напр. Склад",
  "e.g. keep what is in stock and remind me when something runs out":
    "напр. облік того, що є на складі, і нагадування, коли щось закінчується",
  "My apps ({keys})": "Мої застосунки ({keys})",
  Connected: "Зʼєднано",
  "Connecting…": "Зʼєднуємось…",
  Offline: "Немає зʼєднання",
  "{n} waiting for your decision": "Чекають вашого рішення: {n}",

  // The chat's cards (ADR 0034).
  "Could not save the decision": "Не вдалося зберегти рішення",
  "Your decision is needed · {name}": "Потрібне ваше рішення · {name}",
  "What will change": "Що зміниться",
  "Yes, do it": "Так, зробити",
  "No, thanks": "Ні, не треба",
  "Stop trying": "Досить приміряти",
  "Try it": "Приміряти",
  "Hide details": "Сховати деталі",
  "Technical details": "Технічні деталі",
  "✓ You approved · done": "✓ Ви погодили · зроблено",
  "✕ You declined · nothing changed": "✕ Ви відмовили · нічого не змінилося",
  "✕ It did not work": "✕ Не вдалося",
  "Now: {what}…": "Зараз: {what}…",
  "looked at {n}": "переглянув {n}",
  "changed files: {n}": "змінив файлів: {n}",
  "some checks failed": "деякі перевірки не пройшли",
  "checked, all works": "перевірив, усе працює",
  Stop: "Зупинити",
  Hide: "Сховати",
  Details: "Подробиці",
  "Spent ≈ {usd}": "Витрачено ≈ {usd}",
  tokens: "токенів",
  "repeated {n} times · last at {time}": "повторилося {n} разів · востаннє о {time}",
  "{name} is working…": "{name} працює…",
  "{name} finished": "{name} закінчив",
  "{name} could not finish": "{name} не впорався",
  "{name} was stopped": "{name} зупинений",
  Reads: "Читає",
  Searches: "Шукає",
  Changes: "Змінює",
  Creates: "Створює",
  Checks: "Перевіряє",
  "Searches the web": "Шукає в інтернеті",
  "Opens a page": "Відкриває сторінку",
  "Uses {tool}": "Використовує {tool}",
  "For your information": "До відома",
  "Worth a look": "Варто глянути",
  Urgent: "Терміново",
  "It asks for more permissions.": "Він просить більше дозволів.",
  "The app's settings file has an error, so this change cannot go live.":
    "У файлі налаштувань застосунку помилка, тож цю зміну не можна застосувати.",

  // Chats and app tiles (ADR 0034).
  Now: "Зараз",
  "Shows the change that waits for your decision": "Показує зміну, яка чекає вашого рішення",
  "After the change": "Після зміни",
  "Discard the change that waits for your decision": "Відкинути зміну, яка чекає рішення",
  "The app's chat: use it and change it by asking":
    "Чат застосунку: користуйтеся ним і змінюйте його проханнями",
  Chat: "Чат",
  "History of changes": "Історія змін",
  now: "зараз",
  "This topic is closed. Reopen it from its ⋯ menu above to write here.":
    "Ця тема закрита. Відкрийте її знову в меню ⋯ вгорі, щоб писати тут.",
  "Cancel reply": "Скасувати відповідь",
  "Write a message…": "Напишіть повідомлення…",
  Send: "Надіслати",
  "Answers:": "Відповість:",
  "@ calls another helper": "@ — покликати іншого помічника",
  "nobody: call a helper with @": "ніхто: покличте помічника через @",
  "Move to another topic": "Перенести в іншу тему",
  Reply: "Відповісти",
  writing: "пише",
  "Nothing yet": "Поки нічого",
  "App chat": "Чат застосунку",
  "Working: {names}": "Працює: {names}",
  "Back to chats": "Назад до розмов",
  "What helpers keep of older messages": "Що помічники памʼятають зі старих повідомлень",
  Summary: "Підсумок",
  "Close the app": "Закрити застосунок",
  "Open the app": "Відкрити застосунок",
  "Write to {name}…": "Напишіть: {name}…",
  "Write what to change…": "Напишіть, що змінити…",
  Helper: "Помічник",
  working: "працює",
  add: "додати",
  "What are we making?": "Що створюємо?",
  "Talk an idea through with your Helper. When it is ready, it proposes a team and a budget for you to approve.":
    "Обговоріть ідею з Помічником. Коли вона буде готова, він запропонує команду й бюджет на ваше погодження.",
  "All quiet": "Усе спокійно",
  "Alerts from your monitoring tools and apps land here, and your Helper sorts them out.":
    "Сюди приходять сповіщення від моніторингу й застосунків, а Помічник їх розбирає.",
  "The team is getting ready": "Команда готується",
  "Helpers post here as they work. Call one with @ to ask it something.":
    "Помічники пишуть сюди, поки працюють. Покличте когось через @, щоб запитати.",
  "Your own chat with your main AI helper": "Особистий чат із головним ШІ-помічником",
  "A project: helpers work on it together": "Проєкт: помічники працюють над ним разом",
  "An app's chat: change it by asking": "Чат застосунку: змінюйте його проханнями",
  Projects: "Проєкти",

  "New topic": "Нова тема",
  "A new topic: its messages stay in it, and helpers there see only them":
    "Нова тема: її повідомлення лишаються в ній, і помічники там бачать лише їх",
  Topic: "Тема",
  "Topic title": "Назва теми",
  Save: "Зберегти",
  Rename: "Перейменувати",
  Reopen: "Відкрити знову",
  "Close (read-only)": "Закрити (лише читання)",
  General: "Загальне",

  // Built-in apps, their groups and descriptions.
  Chats: "Розмови",
  Skills: "Навички",
  Memory: "Пам'ять",
  Localization: "Локалізація",
  "Restore points": "Точки відновлення",
  Apps: "Застосунки",

  // The launcher.
  "Your apps": "Ваші застосунки",
  "Turn off {name}": "Вимкнути «{name}»",
  "Turn on {name}": "Увімкнути «{name}»",
  "Also turns off {list}.": "Також вимкне: {list}.",
  "Turn off": "Вимкнути",
  Cancel: "Скасувати",
  "New app": "Новий застосунок",
  "What it should do": "Що він має робити",
  "No templates left to add. Turn on Chats to build your own app with agents.":
    "Шаблонів більше немає. Увімкніть Чати, щоб створити власний застосунок з агентами.",
  "Browse the catalog": "Переглянути каталог",

  // An app's menu.
  "More for {name}": "Ще для «{name}»",
  "Uninstall…": "Видалити…",
  Uninstall: "Видалити",
  "Uninstall {name}? Its chat goes too. A copy of its code, versions and data is kept in Backups.":
    "Видалити «{name}»? Його чат теж зникне. Копія коду, версій і даних збережеться в «Резервних копіях».",
  "Remove {name}? Its files go as a commit of the data folder.":
    "Видалити «{name}»? Його файли буде видалено комітом у теці даних.",
  "A restore point keeps the whole Aura as it was: agents, skills, themes, tool servers, settings, and every app with its code, versions and data. Chats, memory and secrets stay as they are. Going to a point saves the present first, so you can come back forward.":
    "Точка відновлення зберігає всю Aura такою, як вона була: агентів, навички, теми, сервери інструментів, налаштування і кожен застосунок з його кодом, версіями й даними. Чати, пам'ять і секрети залишаються як є. Перед переходом до точки теперішній стан зберігається, тож можна повернутися вперед.",
  "Name of the restore point": "Назва точки відновлення",
  "Name, e.g. Before the new dashboard": "Назва, напр. Перед новою панеллю",
  "Save the present": "Зберегти теперішнє",
  "Saved “{label}”.": "Збережено «{label}».",
  "No restore points yet. The orchestrator also saves one before bigger changes.":
    "Точок відновлення ще немає. Оркестратор теж зберігає їх перед більшими змінами.",
  automatic: "автоматична",
  "apps: {list}": "застосунки: {list}",
  "Go there? The present is saved first.": "Перейти? Спершу буде збережено теперішнє.",
  Go: "Перейти",
  "Go to this point": "Перейти до цієї точки",
  "Delete “{label}”": "Видалити «{label}»",
  "Aura is at “{label}” now. What it was before is saved as “{saved}”.":
    "Aura тепер у стані «{label}». Те, що було, збережено як «{saved}».",
  "Uninstalled apps": "Видалені застосунки",
  "An app you uninstall leaves a backup here: its code with its versions, its data and its chat as text. Bringing it back gives it a new chat.":
    "Видалений застосунок лишає тут резервну копію: код із версіями, дані й чат як текст. Повернутий застосунок отримує новий чат.",
  "None.": "Немає.",
  "uninstalled {when}": "видалено {when}",
  "an app with its id exists now": "зараз є застосунок з таким самим id",
  "Bring back": "Повернути",
  "Delete the backup of {name}": "Видалити резервну копію «{name}»",
  "{name} is back, with a new chat.": "«{name}» повернуто, з новим чатом.",

  // Localization.
  Automatic: "Автоматично",
  "The interface follows this computer; agents answer in the language you write in.":
    "Інтерфейс — мовою цього комп'ютера; агенти відповідають мовою, якою пишете ви.",
  "One language for Aura: its interface, the answers of its agents, and your apps (they get it as ctx.language and write their texts in it).":
    "Одна мова для Aura: її інтерфейсу, відповідей агентів і ваших застосунків (вони отримують її як ctx.language і пишуть нею свої тексти).",
  "Showing: {name}.": "Зараз: {name}.",
  "Texts without a translation stay in English. To add a language or correct a translation, put locales/<code>.json in Aura's data folder: a name, its English name and the strings.":
    "Тексти без перекладу лишаються англійською. Щоб додати мову чи виправити переклад, покладіть locales/<code>.json у теку даних Aura: назву, англійську назву і рядки.",

  // Groups, deleting chats and limits.
  Groups: "Групи",
  "New group": "Нова група",
  "Name of the group": "Назва групи",
  "e.g. Planning": "напр. Планування",
  "Who is in it (the Helper always is)": "Хто в ній (Помічник є завжди)",
  Create: "Створити",
  "Could not create the group": "Не вдалося створити групу",
  "Your group: you and the helpers you chose": "Ваша група: ви і помічники, яких ви обрали",
  "Delete this chat": "Видалити цей чат",
  "Delete this chat?": "Видалити цей чат?",
  Delete: "Видалити",
  "Yes, delete": "Так, видалити",
  "No, keep it": "Ні, лишити",
  "Could not delete the chat": "Не вдалося видалити чат",
  "The messages and the project are removed. Its files are kept in the backups folder.":
    "Повідомлення й проєкт буде видалено. Його файли залишаться в теці резервних копій.",
  "The messages are deleted for good.": "Повідомлення буде видалено назавжди.",
  "Enter tokens, e.g. 2M or 500K": "Введіть токени, напр. 2M або 500K",
  "Enter dollars, e.g. 5": "Введіть долари, напр. 5",
  "Used {tokens} tokens": "Витрачено {tokens} токенів",
  "at API prices": "за цінами API",
  "Limit now: {limit}": "Зараз ліміт: {limit}",
  "No limit": "Без ліміту",
  Tokens: "Токени",
  Dollars: "Долари",
  "Token limit": "Ліміт токенів",
  "Dollar limit": "Ліміт у доларах",
  "e.g. 2M": "напр. 2M",
  "e.g. 5": "напр. 5",
  "For subscriptions (Claude Code, Gemini CLI, Codex, OpenCode) and local models.":
    "Для підписок (Claude Code, Gemini CLI, Codex, OpenCode) і локальних моделей.",
  "Real money only on paid APIs (OpenRouter, an OpenAI-compatible API).":
    "Справжні гроші лише на платних API (OpenRouter, OpenAI-сумісний API).",
  "Agents still stop after 8 replies to each other in a row.":
    "Агенти все одно зупиняються після 8 відповідей одне одному підряд.",
  "Click to change.": "Натисніть, щоб змінити.",
  Limit: "Ліміт",
  tok: "ток.",
  "of {limit}": "з {limit}",

  // App secrets.
  Secrets: "Секрети",
  "The app's secrets: keys it puts into its requests; only it can use them":
    "Секрети застосунку: ключі, які він підставляє у свої запити; користуватися ними може лише він",
  "Only this app can use them, in requests to its approved hosts. Values are never shown.":
    "Користуватися ними може лише цей застосунок, у запитах до дозволених адрес. Значення ніколи не показуються.",
  set: "задано",
  "no value": "немає значення",
  "Value of {name}": "Значення {name}",
  "New value": "Нове значення",
  Value: "Значення",
  Clear: "Очистити",
  "Settings of {name}": "Налаштування: {name}",

  // Files.
  "{n} pages": "{n} стор.",
  "Zoom out": "Зменшити",
  "Zoom in": "Збільшити",
  Print: "Друкувати",
  "This kind of file cannot be shown here. Save it to open it with another program.":
    "Цей тип файлу тут не показати. Збережіть його, щоб відкрити іншою програмою.",
  "At most {n} files in one message": "Не більше {n} файлів в одному повідомленні",
  "Too large: at most {size}": "Завеликий: не більше {size}",
  failed: "не вдалося",
  "Remove {name}": "Прибрати {name}",
  "Attach a file": "Додати файл",
  "Open {name}": "Відкрити {name}",
  "Save {name}": "Зберегти {name}",
  "Save to this computer": "Зберегти на цей комп'ютер",
  "Loading…": "Завантаження…",
  "Add files to {name}": "Додати файли до «{name}»",
  "Drop files here, or": "Перетягніть файли сюди або",
  "Choose from this computer": "Оберіть на цьому комп'ютері",

  // Free AI services (ADR 0037).
  "Free AI services": "Безкоштовні ШІ-сервіси",
  "Make a free key:": "Створіть безкоштовний ключ:",
  Copied: "Скопійовано",
  "Copy link": "Копіювати посилання",
  "Paste it here. It stays on this computer and goes only to {name}.":
    "Вставте його сюди. Він лишається на цьому комп'ютері й іде лише до {name}.",
  "{name} API key": "API-ключ {name}",
  "paste the key": "вставте ключ",
  Connect: "Підключити",
  "Connect an AI to start": "Підключіть ШІ, щоб почати",
  "Your helpers need an AI to think with. The easiest way is a free service:":
    "Помічникам потрібен ШІ, яким вони думають. Найпростіше — безкоштовний сервіс:",
  "I already use an agent app (Claude Code, Codex…) or local models":
    "Я вже користуюся агентною програмою (Claude Code, Codex…) або локальними моделями",
  "Connect Claude Code": "Підключити Claude Code",
  "Install Claude Code:": "Встановіть Claude Code:",
  Run: "Запустіть",
  "in a terminal and log in with your Claude account.":
    "у терміналі й увійдіть зі своїм акаунтом Claude.",
  "Come back and check again. The app never sees your credentials.":
    "Поверніться й перевірте ще раз. Застосунок ніколи не бачить ваших облікових даних.",
  "Open Helper programs": "Відкрити «Helper programs»",
  "Gemini models from Google AI Studio. A free key, no card needed.":
    "Моделі Gemini з Google AI Studio. Безкоштовний ключ, без картки.",
  "On the free plan Google may use your prompts to improve its products, and daily limits apply.":
    "На безкоштовному плані Google може використовувати ваші запити для покращення своїх продуктів, і діють добові ліміти.",
  "Open models (gpt-oss, Llama) answering very fast. A free key.":
    "Відкриті моделі (gpt-oss, Llama), що відповідають дуже швидко. Безкоштовний ключ.",
  "The free plan has per-minute and daily limits; long agent runs may need to wait.":
    "Безкоштовний план має хвилинні та добові ліміти; довгі запуски агентів можуть чекати.",
  "Many models behind one key, with a free section (models ending in :free).":
    "Багато моделей за одним ключем, є безкоштовний розділ (моделі з :free).",
  "Free models have daily limits and may log prompts; pick one marked free.":
    "Безкоштовні моделі мають добові ліміти й можуть зберігати запити; обирайте позначені free.",
  "Open models on very fast hardware. A key is free to make; the free plan's terms change.":
    "Відкриті моделі на дуже швидкому залізі. Ключ створити безкоштовно; умови безкоштовного плану змінюються.",
  "Check the plan on the sign-up page: a card may be asked for. Daily limits apply.":
    "Перегляньте план на сторінці реєстрації: може знадобитися картка. Діють добові ліміти.",
  "Mistral's own models, with a free Experiment plan.":
    "Власні моделі Mistral, є безкоштовний план Experiment.",
  "The free plan may ask for a phone number and may use your prompts to train models.":
    "Безкоштовний план може просити номер телефону й використовувати ваші запити для навчання моделей.",
  "Check again": "Перевірити ще раз",

  // Built-in local AI (ADR 0038).
  "Aura loop": "Цикл Aura",
  "Built-in local AI": "Вбудований локальний ШІ",
  "llama.cpp build ({tag})": "Збірка llama.cpp ({tag})",
  "Choose automatically": "Обрати автоматично",
  "no checksum": "без контрольної суми",
  "Choose the llama.cpp build yourself": "Обрати збірку llama.cpp самому",
  "Install another llama.cpp release": "Встановити інший реліз llama.cpp",
  "llama.cpp release": "Реліз llama.cpp",
  "The latest": "Найновіший",
  "This release has no program archives. Choose another release.":
    "У цьому релізі немає архівів програми. Оберіть інший реліз.",
  "fits this computer": "підходить цьому комп'ютеру",
  "no build recognized": "збірку не розпізнано",
  free: "безкоштовно",
  default: "типовий",
  "Aura installs llama.cpp for you and runs a model on this computer: free and private. Choose a model that fits your memory.":
    "Aura сама встановить llama.cpp і запустить модель на цьому комп'ютері: безкоштовно й приватно. Оберіть модель, що вміщається у вашу пам'ять.",
  "llama.cpp {tag} ({variant}) is installed.": "llama.cpp {tag} ({variant}) встановлено.",
  "llama.cpp is not installed yet.": "llama.cpp ще не встановлено.",
  "This computer has {gb} GB of memory.": "На цьому комп'ютері {gb} ГБ пам'яті.",
  running: "працює",
  Use: "Використати",
  "Downloading llama.cpp": "Завантаження llama.cpp",
  "Downloading the model": "Завантаження моделі",
  "Add another model": "Додати ще одну модель",
  "Choose a model": "Оберіть модель",
  recommended: "рекомендовано",
  fits: "вміщається",
  "needs ~{gb} GB": "потрібно ~{gb} ГБ",
  "Or any GGUF model from Hugging Face": "Або будь-яка GGUF-модель з Hugging Face",
  "Download the model…": "Завантажити модель…",
  "Install and download…": "Встановити й завантажити…",
  "Remove llama.cpp and all models": "Видалити llama.cpp і всі моделі",
  "Your decision is needed": "Потрібне ваше рішення",
  "Everything is already here": "Усе вже є",
  "Download to this computer?": "Завантажити на цей комп'ютер?",
  "The llama.cpp program {tag}, {size}, from github.com/ggml-org/llama.cpp. Its checksum is checked.":
    "Програма llama.cpp {tag}, {size}, з github.com/ggml-org/llama.cpp. Її контрольну суму буде перевірено.",
  "The model {file}, {size}, from huggingface.co/{repo}.":
    "Модель {file}, {size}, з huggingface.co/{repo}.",
  "Its checksum is checked.": "Її контрольну суму буде перевірено.",
  "It runs only on this computer, and only while a helper uses it.":
    "Вона працює лише на цьому комп'ютері й лише поки нею користується помічник.",
  "Free disk space: {size}.": "Вільно на диску: {size}.",
  "Yes, download": "Так, завантажити",
  "A good first model: small, follows tools reasonably, answers in many languages.":
    "Добра перша модель: мала, непогано користується інструментами, відповідає багатьма мовами.",
  "Noticeably better at tools and code; wants a machine with 16 GB.":
    "Помітно краща з інструментами й кодом; потрібен комп'ютер із 16 ГБ.",
  "The strongest here for agents, but large: for 24 GB or a good GPU.":
    "Найсильніша тут для агентів, але велика: для 24 ГБ або доброї відеокарти.",
  "Small and quick; fine for chat, weaker with tools.":
    "Мала й швидка; добра для розмов, гірша з інструментами.",
  "Tiny, for weak computers; simple jobs only.":
    "Крихітна, для слабких комп'ютерів; лише прості завдання.",
};
