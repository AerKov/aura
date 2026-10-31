/** Every text of the site, in English and Ukrainian. */

export type Lang = "en" | "uk";

export const LANGS: { code: Lang; name: string }[] = [
  { code: "en", name: "English" },
  { code: "uk", name: "Українська" },
];

export const REPO = "https://github.com/AerKov/aura";
export const RELEASES = `${REPO}/releases`;
export const WIKI = `${REPO}/wiki`;

interface Copy {
  nav: { how: string; features: string; compare: string; next: string; download: string };
  hero: {
    kicker: string;
    title: string;
    lead: string;
    download: string;
    github: string;
    note: string;
  };
  chat: {
    you: string;
    helper: string;
    builder: string;
    ask1: string;
    reply1: string;
    ask2: string;
    reply2: string;
    card: string;
    yes: string;
  };
  how: { title: string; steps: { title: string; text: string }[] };
  gallery: { title: string; items: { src: string; alt: string; caption: string }[] };
  features: { title: string; items: { title: string; text: string }[] };
  compare: {
    title: string;
    lead: string;
    columns: string[];
    rows: { label: string; values: string[] }[];
    more: string;
  };
  next: { title: string; lead: string; items: { title: string; text: string }[] };
  privacy: { title: string; text: string };
  get: {
    title: string;
    lead: string;
    os: Record<"mac" | "windows" | "linux", string>;
    other: string;
    source: string;
    ai: string;
  };
  footer: { license: string; docs: string; source: string };
}

const en: Copy = {
  nav: {
    how: "How it works",
    features: "Features",
    compare: "Compared",
    next: "Coming",
    download: "Download",
  },
  hero: {
    kicker: "Local-first · open source · free",
    title: "Build your own apps by chatting.",
    lead: "Tell your Helper what you need. It makes the app; @builder changes it whenever you ask. Every change waits for your “yes”, every version can come back, and everything stays on your computer.",
    download: "Download Aura",
    github: "View on GitHub",
    note: "Alpha for macOS, Windows and Linux. No account, no telemetry.",
  },
  chat: {
    you: "You",
    helper: "Helper",
    builder: "Builder",
    ask1: "I run a small design studio. Keep track of my clients and deals, please.",
    reply1: "Done: an app called Clients, with a client list and a board of deals by stage.",
    ask2: "Add an email column and a button to export to CSV.",
    reply2: "Both are ready to look at. Nothing changes until you say yes.",
    card: "Change the app Clients",
    yes: "Yes, do it",
  },
  how: {
    title: "Three steps, no code",
    steps: [
      {
        title: "Say what you need",
        text: "A tracker, a board, a small CRM, an invoice book. In your own words, in any language.",
      },
      {
        title: "Use it right away",
        text: "The app opens in Aura with its own data, and its chat beside it. Ask the chat to use it too: “add a client Petrenko”.",
      },
      {
        title: "Change it any time",
        text: "Each change shows what will change in plain words and a preview of the app after it. Yes or no; every version can be restored.",
      },
    ],
  },
  gallery: {
    title: "One screen for all your tools",
    items: [
      {
        src: "screen-app-light.png",
        alt: "An app with its chat beside it",
        caption: "An app, and @builder beside it",
      },
      {
        src: "screen-folded.png",
        alt: "Dark mode with the menu folded",
        caption: "Dark mode, menu folded",
      },
      {
        src: "screen-new-app.png",
        alt: "The New app dialog",
        caption: "A name and a sentence are enough",
      },
      {
        src: "screen-viewer.png",
        alt: "A PDF in the viewer",
        caption: "Apps keep, show, print and save files",
      },
    ],
  },
  features: {
    title: "What you get",
    items: [
      {
        title: "Apps that are yours",
        text: "Each app is a git folder with its code, its own data (a small database or plain files) and its own secrets.",
      },
      {
        title: "Nothing goes live without you",
        text: "A diff in plain words, a preview of the app after the change, and a version you can always go back to.",
      },
      {
        title: "A model on your computer",
        text: "Aura installs llama.cpp and a model that fits your machine. Ollama, LM Studio and Claude Code work too.",
      },
      {
        title: "Safe by default",
        text: "Apps run in a sandbox with the permissions you gave them; helpers' commands run with no network.",
      },
      {
        title: "A look you change by asking",
        text: "Aura has no look of its own: the theme is a file of yours. “Rounder corners”, “a green menu”: try it on, then say yes.",
      },
      {
        title: "English and Ukrainian",
        text: "One language for the interface, the helpers and your apps. More come as files.",
      },
    ],
  },
  compare: {
    title: "How is it different?",
    lead: "Plenty of tools build apps from a chat. Most are for developers shipping a web product, or make a small page in someone's cloud. Aura is for your own tools, on your own computer.",
    columns: ["Aura", "Dyad, bolt.diy", "Lovable, Bolt, Replit, v0", "Claude artifacts, Opal"],
    rows: [
      { label: "Runs on your computer", values: ["✓", "✓", "–", "–"] },
      { label: "Local model built in", values: ["✓", "via Ollama", "–", "–"] },
      { label: "No code to look at", values: ["✓", "–", "partly", "✓"] },
      { label: "Apps live together, ready to use", values: ["✓", "–", "–", "partly"] },
      { label: "A chat beside each app uses it too", values: ["✓", "–", "–", "–"] },
      { label: "Publish to the web", values: ["soon", "✓", "✓", "✓"] },
    ],
    more: "The full comparison, with sources",
  },
  next: {
    title: "What's coming",
    lead: "Promises for the next versions, in this order.",
    items: [
      {
        title: "Share an app as a .aura file",
        text: "Export an app (never its secrets); installing one shows what it asks for before anything happens.",
      },
      {
        title: "Your app as a program of its own",
        text: "Turn an app into a desktop program with its own name and icon that opens without Aura, in seconds.",
      },
      {
        title: "Publish an app to the web",
        text: "Put an app online for others to use, from its menu; your own copy keeps living in Aura.",
      },
    ],
  },
  privacy: {
    title: "Your computer, your data",
    text: "Aura has no account and no telemetry. Prompts go only to the AI you choose, or nowhere with a local model. Claude Code keeps its own login; Aura never reads it.",
  },
  get: {
    title: "Get Aura",
    lead: "Free and open source (MIT). The builds are not signed yet: the first time, right-click → Open on macOS, or More info → Run anyway on Windows.",
    os: { mac: "for macOS", windows: "for Windows", linux: "for Linux" },
    other: "All downloads",
    source: "Run from source",
    ai: "Then connect an AI in Settings → AI: the built-in local AI is the easiest start.",
  },
  footer: { license: "MIT license", docs: "Docs", source: "Source" },
};

const uk: Copy = {
  nav: {
    how: "Як це працює",
    features: "Можливості",
    compare: "Порівняння",
    next: "Далі",
    download: "Завантажити",
  },
  hero: {
    kicker: "Локально · відкритий код · безкоштовно",
    title: "Будуйте власні застосунки, просто розмовляючи.",
    lead: "Скажіть Помічнику, що вам потрібно. Він створить застосунок, а @builder змінюватиме його, коли попросите. Кожна зміна чекає на ваше «так», будь-яку версію можна повернути, і все лишається на вашому комп'ютері.",
    download: "Завантажити Aura",
    github: "Код на GitHub",
    note: "Альфа для macOS, Windows і Linux. Без акаунта й телеметрії.",
  },
  chat: {
    you: "Ви",
    helper: "Помічник",
    builder: "Builder",
    ask1: "У мене маленька дизайн-студія. Веди облік моїх клієнтів і угод, будь ласка.",
    reply1: "Готово: застосунок «Клієнти» зі списком клієнтів і дошкою угод за етапами.",
    ask2: "Додай колонку з email і кнопку експорту в CSV.",
    reply2: "Обидва вже можна подивитися. Нічого не зміниться, поки ви не скажете «так».",
    card: "Змінити застосунок «Клієнти»",
    yes: "Так, роби",
  },
  how: {
    title: "Три кроки, без коду",
    steps: [
      {
        title: "Скажіть, що потрібно",
        text: "Трекер, дошка, маленька CRM, книга рахунків. Своїми словами, будь-якою мовою.",
      },
      {
        title: "Користуйтеся одразу",
        text: "Застосунок відкривається в Aura зі своїми даними, а поруч його чат. Чат вміє й користуватися ним: «додай клієнта Петренка».",
      },
      {
        title: "Змінюйте будь-коли",
        text: "Кожна зміна показує, що зміниться, звичайними словами, і як виглядатиме застосунок після неї. Так чи ні; будь-яку версію можна повернути.",
      },
    ],
  },
  gallery: {
    title: "Один екран для всіх ваших інструментів",
    items: [
      {
        src: "screen-app-light.png",
        alt: "Застосунок і його чат поруч",
        caption: "Застосунок і @builder поруч",
      },
      {
        src: "screen-folded.png",
        alt: "Темна тема, меню згорнуте",
        caption: "Темна тема, меню згорнуте",
      },
      {
        src: "screen-new-app.png",
        alt: "Вікно «Новий застосунок»",
        caption: "Назви й одного речення досить",
      },
      {
        src: "screen-viewer.png",
        alt: "PDF у переглядачі",
        caption: "Застосунки зберігають, показують, друкують файли",
      },
    ],
  },
  features: {
    title: "Що ви отримуєте",
    items: [
      {
        title: "Застосунки, що належать вам",
        text: "Кожен застосунок — git-папка з кодом, власними даними (маленька база або звичайні файли) і власними секретами.",
      },
      {
        title: "Нічого не запрацює без вас",
        text: "Зміни звичайними словами, перегляд застосунку після зміни й версія, до якої завжди можна повернутися.",
      },
      {
        title: "Модель на вашому комп'ютері",
        text: "Aura сама встановлює llama.cpp і модель, що підходить вашому комп'ютеру. Ollama, LM Studio і Claude Code теж працюють.",
      },
      {
        title: "Безпечно від початку",
        text: "Застосунки працюють у пісочниці з дозволами, які ви дали; команди помічників не мають доступу до мережі.",
      },
      {
        title: "Вигляд змінюється проханням",
        text: "В Aura немає власного вигляду: тема — ваш файл. «Круглі кути», «зелене меню»: приміряйте, а тоді скажіть «так».",
      },
      {
        title: "Українська й англійська",
        text: "Одна мова для інтерфейсу, помічників і ваших застосунків. Інші мови додаються файлами.",
      },
    ],
  },
  compare: {
    title: "Чим Aura відрізняється?",
    lead: "Застосунки з чату вміють будувати багато інструментів. Більшість — для розробників, які випускають вебпродукт, або роблять маленьку сторінку в чужій хмарі. Aura — для ваших власних інструментів, на вашому комп'ютері.",
    columns: ["Aura", "Dyad, bolt.diy", "Lovable, Bolt, Replit, v0", "Claude artifacts, Opal"],
    rows: [
      { label: "Працює на вашому комп'ютері", values: ["✓", "✓", "–", "–"] },
      { label: "Вбудована локальна модель", values: ["✓", "через Ollama", "–", "–"] },
      { label: "Без коду перед очима", values: ["✓", "–", "частково", "✓"] },
      { label: "Застосунки разом і готові до роботи", values: ["✓", "–", "–", "частково"] },
      { label: "Чат поруч ще й користується застосунком", values: ["✓", "–", "–", "–"] },
      { label: "Публікація у веб", values: ["скоро", "✓", "✓", "✓"] },
    ],
    more: "Повне порівняння з джерелами",
  },
  next: {
    title: "Що буде далі",
    lead: "Обіцянки на наступні версії, саме в такому порядку.",
    items: [
      {
        title: "Обмін застосунком через файл .aura",
        text: "Експорт застосунку (ніколи з секретами); перед встановленням видно, що він просить.",
      },
      {
        title: "Застосунок як окрема програма",
        text: "Зробіть із застосунку десктопну програму зі своєю назвою й іконкою, що відкривається без Aura, за секунди.",
      },
      {
        title: "Публікація застосунку у веб",
        text: "Викладіть застосунок в інтернет для інших з його меню; ваша копія й далі живе в Aura.",
      },
    ],
  },
  privacy: {
    title: "Ваш комп'ютер, ваші дані",
    text: "В Aura немає акаунта й телеметрії. Запити йдуть лише до обраного вами ШІ, а з локальною моделлю — нікуди. Claude Code тримає свій вхід у себе; Aura його не читає.",
  },
  get: {
    title: "Завантажити Aura",
    lead: "Безкоштовно й з відкритим кодом (MIT). Збірки ще не підписані: першого разу на macOS — правий клік → Відкрити, на Windows — Докладніше → Запустити все одно.",
    os: { mac: "для macOS", windows: "для Windows", linux: "для Linux" },
    other: "Усі завантаження",
    source: "Запуск із коду",
    ai: "Потім підключіть ШІ в Налаштування → ШІ: вбудований локальний ШІ — найпростіший старт.",
  },
  footer: { license: "Ліцензія MIT", docs: "Документація", source: "Код" },
};

export const COPY: Record<Lang, Copy> = { en, uk };
