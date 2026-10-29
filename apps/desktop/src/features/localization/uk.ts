/**
 * Ukrainian, keyed by the English text (ADR 0033). `uk.test.ts` checks that every text the shell
 * translates has an entry here.
 */
export const UK: Record<string, string> = {
  // Built-in apps, their groups and descriptions.
  Home: "Головна",
  "Home: all your apps (Shift-click: open on the right)":
    "Головна: усі ваші застосунки (Shift-клік: відкрити праворуч)",
  Chats: "Чати",
  Signals: "Сигнали",
  Agents: "Агенти",
  Skills: "Навички",
  Memory: "Пам'ять",
  Schedule: "Розклад",
  Engines: "Рушії",
  Catalog: "Каталог",
  Customize: "Налаштування",
  Localization: "Локалізація",
  "Restore points": "Точки відновлення",
  Devices: "Пристрої",
  Communication: "Спілкування",
  System: "Система",
  Apps: "Застосунки",
  "The messenger with the orchestrator, your agents and every app's chat.":
    "Месенджер з оркестратором, вашими агентами і чатом кожного застосунку.",
  "Alerts from monitoring tools and apps, triaged by the orchestrator.":
    "Сповіщення від моніторингу й застосунків; оркестратор їх розбирає.",
  "Each agent's prompt, engine, tools, memory and tool servers.":
    "Промпт, рушій, інструменти, пам'ять і сервери інструментів кожного агента.",
  "Know-how your agents can use, with versions.":
    "Знання, якими користуються ваші агенти, з версіями.",
  "What your agents remember, to search and delete.":
    "Що пам'ятають ваші агенти: пошук і видалення.",
  "Agents' work on a schedule.": "Робота агентів за розкладом.",
  "Which AI runs your agents, and the command sandbox.":
    "Який ШІ запускає ваших агентів, і пісочниця для команд.",
  "Packs of apps, agents, skills and themes to install.":
    "Набори застосунків, агентів, навичок і тем для встановлення.",
  "Theme, window manager, bar and extensions.": "Тема, віконний менеджер, бар і розширення.",
  "The language of Aura, its agents and your apps.": "Мова Aura, її агентів і ваших застосунків.",
  "Take Aura back or forward: apps, their data and settings. Removed apps' backups.":
    "Повернути Aura назад або вперед: застосунки, їхні дані й налаштування. Резервні копії видалених застосунків.",
  "Phones paired with this computer.": "Телефони, під'єднані до цього комп'ютера.",

  // The launcher.
  "Your apps": "Ваші застосунки",
  "Find an app": "Знайти застосунок",
  "Add an app": "Додати застосунок",
  Hide: "Сховати",
  "Welcome to Aura": "Вітаємо в Aura",
  "Aura is a shell for your apps. Add one from a template or the catalog, or build your own by describing it to AI agents in its chat. Even the built-in parts (chats, skills, memory) are apps: turn off what you do not need. Click an app to open it here; Shift-click opens it beside.":
    "Aura — оболонка для ваших застосунків. Додайте застосунок із шаблону чи каталогу або створіть свій, описавши його ШІ-агентам у його чаті. Навіть вбудовані частини (чати, навички, пам'ять) — це застосунки: вимкніть те, що не потрібно. Клік відкриває застосунок тут; Shift-клік — поруч.",
  "No app matches “{query}”.": "Жоден застосунок не відповідає «{query}».",
  "No description yet. Ask in its chat to add one.":
    "Опису ще немає. Попросіть додати його в чаті застосунку.",
  "Off with {name}.": "Вимкнено разом із «{name}».",
  "Turn off {name}": "Вимкнути «{name}»",
  "Turn on {name}": "Увімкнути «{name}»",
  "Also turns off {list}.": "Також вимкне: {list}.",
  "Turn off": "Вимкнути",
  Cancel: "Скасувати",
  "New app": "Новий застосунок",
  Empty: "Порожній",
  "App name": "Назва застосунку",
  "Name, e.g. Clients": "Назва, напр. Клієнти",
  "What it should do": "Що він має робити",
  "What it should do (optional: you can tell @builder in its chat)":
    "Що він має робити (необов'язково: можна сказати @builder у його чаті)",
  "No templates left to add. Turn on Chats to build your own app with agents.":
    "Шаблонів більше немає. Увімкніть Чати, щоб створити власний застосунок з агентами.",
  Create: "Створити",
  "Browse the catalog": "Переглянути каталог",

  // An app's menu.
  "More for {name}": "Ще для «{name}»",
  "Uninstall…": "Видалити…",
  Uninstall: "Видалити",
  "Uninstall {name}? Its chat goes too. A backup of its code, versions and data is kept under Restore points.":
    "Видалити «{name}»? Його чат теж зникне. Резервна копія коду, версій і даних залишиться в Точках відновлення.",
  "Remove {name}? Its files go as a commit of the data folder.":
    "Видалити «{name}»? Його файли буде видалено комітом у теці даних.",

  // Restore points.
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
};
