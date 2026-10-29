# Handoff: Aura — shell, onboarding, chats, apps, AI helpers

## Overview
Aura is a local-first desktop shell (Tauri) for the user's own apps. They are laid out as tiles, like a tiling window manager. Every app has its own chat, where the user connects AI helpers (agents) and changes the app by talking to them. Any change with side effects is shown as an approval card first, and nothing happens until the user approves.

This handoff covers the latest direction (round 4, "simple mode"). It is written for non-technical users:
- Ukrainian UI copy, plain words.
- Agents are called "ШІ-помічники (агенти)", with human names.
- The technical detail is still there, but hidden behind "Подробиці", "Технічні деталі" and an "Розширений режим" toggle.

Target stack: **React + Tailwind CSS v4 + shadcn/ui + lucide-react**, inside Tauri.

## About the design files
The files in `prototype/` are **design references built in HTML**. They are interactive prototypes that show the intended look and behaviour, not production code. Rebuild them in the real app with its own patterns: shadcn components, Tailwind tokens and a proper state store. Do not ship the HTML or copy its inline styles.

To view the prototype, open `prototype/Aura R4.dc.html` in a browser. It runs from the local folder; a local static server is recommended (`npx serve prototype`). The `start` prop at the top of the file's `data-props` controls the entry point. It defaults to `splash`; set it to `lived` to land in a populated shell.

## Fidelity
**High-fidelity for structure, behaviour and copy.** Layout, states, flows and the Ukrainian texts are final.

**The visual style is provisional.** It uses the "Industry" design system: steel-blue accent, Barlow / Barlow Condensed, square corners, hairline borders. The original brief asked for Geist / Geist Mono and soft rounded shapes. Before you build, decide which one to use. Either way, implement every colour, font and radius as a CSS variable (listed below), so installed themes can override them.

## Product rules (must hold)
- A tile shows exactly one app; there are no tabs inside tiles. Opening an app either replaces the focused tile's app or focuses the tile that already shows it.
- There are only three chat kinds:
  - direct (user + main helper);
  - group (a project or an app);
  - system (alerts).
- Chats have one level of topics and replies. There are no workspaces, channels or nested threads.
- Approval cards are required for anything with side effects.
- Never show secret values, only names and "додано / не додано".
- Built-in apps can be turned off. Turning off Chats also turns off Signals, and a confirmation is shown first.
- Everything stays local. There are no accounts and no login.

## Screens / views

### 1. Splash
- A logo mark (64px square, 1px border, a mono "A") is centred above "Запускаємо Aura…" (heading, 24px).
- Below it is a 220×2px progress bar with `--signal` fill, then one status line that changes: "Відкриваємо ваші застосунки" → "Будимо помічників" → "Майже готово".
- When loading finishes, it moves on to onboarding.

### 2. Onboarding (3 steps, first run only)
Layout:
- Grid `250px | 1fr`.
- Left: a `--rail` panel with the logo, the step list (number box 24px, label 15px/500) and the footnote "Усе зберігається на цьому компʼютері. Реєстрація не потрібна."
- Right: content with max-width 720px, padding 64px 40px; footer bar with Назад / Пропустити / Далі (primary).
- Enter = Далі.

Steps:
1. **Вітання.**
   - H1 "Вітаємо в Aura" (52px).
   - A paragraph explaining apps + AI helpers + approvals.
   - A two-column example: "Ви пишете" bubble → "Помічник показує зміну" approval mini-card.
   - Language cards (3): Як у системі / Українська / English.
2. **Підключення ШІ.**
   - H1 "Підключаємо ШІ".
   - A result card: "Усе готово", the found engine and where to change it later.
   - A ghost link "Інші варіанти (для досвідчених)" reveals the engine list (radio rows with status + action) and the "Захищений режим" segmented control (Авто / Завжди / Вимкнено).
3. **Перший застосунок.**
   - A 2×2 template grid: Клієнти / Задачі / Нотатки / Свій варіант. "Свій варіант" reveals the Назва + "Що він має робити" fields.
   - "Почати" opens the shell with this app and the Start menu open. "Пропустити" opens an empty shell.

### 3. Shell
- Row layout: rail (56px) + tile area.
- **Rail** (`--rail` bg, `--rail-foreground` icons; lucide icons 18px, stroke 1.5):
  - Top: the "A" logo button (30px). It toggles the Start menu and is filled when the menu is open.
  - Then 38px icon buttons for the apps. The active one gets a 16% foreground tint and a 2px inset left bar; apps that are visible in a tile get a 35% bar.
  - Bottom: a vertical clock (HH over MM, mono 12px/500, tabular numbers), a 7px connection dot, and an amber badge with the number of pending approvals. Clicking the badge opens the main helper chat.
  - Simple mode shows: Розмови, Сповіщення, the user's apps, Помічники, Вигляд. Advanced mode adds Нагадування, Готові набори, Мова, Резервні копії, Телефон.
- **Tile area**:
  - CSS grid: one tile, two columns, or three tiles (left full height + right split).
  - Gap 10px, padding 10px, tile radius 10px, border 2px.
  - The focused tile has a `--ring` border; the others use `--border`.
  - A gutter between the columns can be dragged (ratio clamped to 0.2–0.8).
  - Tile presets come from `--wm-gap`, `--wm-radius` and `--wm-border`. Hyprland = 10 / 10 / 2. i3 = 0 / 0 / 1 with coloured title bars (see `Aura R1 Design System.dc.html`).
- **Tile bar** (38px, bottom border):
  - Left: app icon + name.
  - Right: Відкрити тут інший застосунок (popover list), Нове вікно поруч, Закрити.
  - User apps also get: Зараз / Після зміни (only while a change is pending and the tile is at least 520px wide), Історія змін (versions popover with "Повернути"), and the Чат toggle button. In advanced mode only: Дані and Ключі доступу.
  - Tooltips show the keyboard shortcut in advanced mode.
- **Keyboard** (Mod = Alt):

  | Shortcut | Action |
  |---|---|
  | ←/→/↑/↓ | Focus tiles |
  | Enter | Split |
  | Q | Close the tile |
  | H | Toggle the Start menu |
  | 1…9 | Open a rail item |
  | Esc | Close the menu / panels |

- **Responsiveness**: tiles measure their own width (use a ResizeObserver or container queries). Below 640px:
  - Розмови shows the list *or* the chat, with a back arrow.
  - An app's chat panel becomes a full-tile overlay.
  - The "Помічник" button becomes icon-only.

### 4. Start menu ("Мої застосунки")
This replaces the old full-page Home: the user's work stays visible.
- An absolute panel next to the rail: left 56px, full height, width `min(480px, 100% − 56px)`, `--popover` bg, right border, `--shadow-md`. The rest of the screen is a backdrop (background at 45%); clicking it closes the menu.
- Header: "Мої застосунки" (24px heading), the "+ Новий застосунок" button, and an autofocused search field "Знайти застосунок або налаштування". Enter opens the first match, which is outlined with a 2px ring.
- First run: a "Як тут усе працює" card with 3 numbered steps and a "Зрозуміло" button.
- Groups: Робота, Дім, Гроші (the user's own), then Основне (Розмови, Сповіщення, Нагадування, Помічники), then Налаштування (Вигляд, Мова, Телефон, Резервні копії, Готові набори).
  - Rows are laid out in a grid `repeat(auto-fill, minmax(190px,1fr))`.
  - Each row has a 32px icon box, a 14px/500 name and a 12px muted description (ellipsis), plus a dot when the app is already open.
  - Apps that are turned off are dimmed to 45%.
- Footer: the "Розширений режим" switch and the hint "Enter — відкрити · Esc — закрити".
- Opening an app closes the menu and opens the app in the focused tile, or focuses the tile that already shows it.
- The same group data drives the "Нове вікно" (empty tile) view. That view also has on/off switches for built-in modules (advanced mode), a ⋯ menu with "Видалити…" for user apps, and confirm popovers:
  - Chats off: «Сповіщення» працюють через розмови, тож вимкнуться теж.
  - Uninstall: «Копія збережеться в «Резервних копіях»».

### 5. "Новий застосунок" panel
- A right-side sheet over the tile area, 420px wide.
- Templates 2×2 (Клієнти / Задачі / Нотатки / Свій варіант), the name and "Що він має робити" fields, and the primary button "Створити".
- The new app opens in a tile in the "Помічник збирає «…»" state, with its chat open and a running run card.

### 6. Розмови (Chats app)
- **List pane** (clamp 220–290px):
  - The main helper chat "Помічник" is pinned at the top, followed by the groups Проєкти, Застосунки and Сповіщення.
  - Each row: a 34px mark (agent mark / app icon box / amber "!" for system), title 14.5px/500, mono time, preview 13px muted. The preview shows "<Name> працює…" in `--signal-text` while a helper is running, plus a primary-coloured unread badge.
  - The selected row has an `--accent` bg and a 2px inset ring bar.
- **Chat header**: the title (20px heading) and a subtitle (kind · budget), member marks, and "Відкрити застосунок" for app chats.
- **Topic bar**: chips (Загальне + topics).
- **Feed**: described in the next section.

### 7. Chat feed (shared by Розмови and the in-app chat panel)
- Background is `--chat-bg` with a dot grid: `radial-gradient(var(--grid-dot) 1px, transparent 1.3px)` at 16px. Column max-width is 760px.
- **User message**: right-aligned, `--bubble-own` bg, 14.5px/1.45, padding 8×12, time below.
- **Helper message**: left, no bubble. A 26px mark, then the name (13px/600) + time, then the text. While streaming, a 7×15px `--signal` caret follows the text.
- **System line**: centred, 12px muted.
- **Run card**:
  - Bordered card at max 600px, indented 34px.
  - Status dot (running = `--signal` with a 3px halo; done = foreground; error = destructive; stopped = hollow), then "<Name> працює… / закінчив / не впорався / зупинений".
  - A plain summary: "переглянув 2, змінив 3 файли · перевірив, усе працює", or "Зараз: змінює…" while running.
  - Buttons: Зупинити (while running) and Подробиці / Сховати. Подробиці expands a tool list with a verb (Читає / Шукає / Змінює / Створює / Перевіряє) + a mono argument + ✓ or …, and "Витрачено ≈ $0.09".
  - Tool calls are **collapsed by default**.
- **Approval card**:
  - Max 620px. While pending, the border is amber (`--warning` at 65%).
  - Kicker "Потрібне ваше рішення · <Name>" (12px/600, warning text).
  - Title (21px heading), why (14px muted).
  - An optional warning box (⚠, amber tint), e.g. a request for more permissions.
  - "Що зміниться" with "+" bullet points.
  - Buttons: **Так, зробити** (primary) and **Ні, не треба**, plus a ghost "Технічні деталі" that reveals the unified diff (+ lines `--signal` 16% tint, − lines destructive 13%).
  - Decided state: dimmed to 85% with the text "✓ Ви погодили · зроблено" or "✕ Ви відмовили · нічого не змінилося", followed by a system line.
- **Alert card**:
  - A 4px severity bar: info = `--signal`, warning = `--warning`, critical = `--destructive`.
  - Label: До відома / Варто глянути / Терміново.
  - Then the source, "повторилося N рази · востаннє о HH:MM", the title (15px/500) and the summary.
- **Composer**:
  - An auto-height textarea (38px min) and a 38px primary send button. Enter sends; Shift+Enter adds a new line.
  - Under it: "Відповість: <Name>" and "@ — покликати іншого помічника".
  - Typing `@` opens a suggestion popover (mark, name, role) above the composer.

### 8. User app tile (sample "Клієнти" CRM)
- Sections (in-app nav, not tile tabs): Клієнти / Угоди / Огляд.
  - Клієнти: a table with the columns Імʼя / Компанія / Етап / Сума.
  - Угоди: a 4-column kanban (Нові, Пропозиція, Переговори, Виграно).
  - Огляд: 4 stat tiles.
- **Draft preview**: "Після зміни" shows the pending change. The new Email column and the "Експорт у CSV" button get an amber tint or dashed border, plus the banner "Так буде після зміни · ще не застосовано".
- **Chat panel**:
  - Right side, `min(380px, 42%)`, or a full overlay when the tile is narrow.
  - Header "Чат застосунку" + "Працює: <names>" + the "+ Помічник" button. It opens a popover listing all helpers with "✓ працює / додати"; adding or removing one posts a system line.
- In the real app, the app UI runs in a sandboxed iframe.

### 9. Помічники (AI helpers app; everything about agents lives here)
Sections: Команда / Вміння / Памʼять / Підключення ШІ. Content max-width 760px; sections are bordered cards on `--background`, padding 14×16, gap 14.
- **Команда**:
  - An intro paragraph, then agent chips (mark + name).
  - Header card: a 52px mark, the name (26px heading), mono "ШІ-агент · @handle", the role, and a "Працює через" select listing the ready engines. It wraps to the next line in narrow tiles.
  - "Як він працює": an editable prompt textarea. Скасувати / Зберегти appear only when the text changed; after saving, "✓ Збережено · попередню версію можна повернути" is shown, and Aura's own additions are noted.
  - "Що йому дозволено": switches for Читати файли, Змінювати файли, Запускати програми, Шукати в інтернеті, Відкривати сайти. These map to Read/Write+Edit, Bash, WebSearch and WebFetch.
  - "Витрати": text + a 6px bar.
  - "Його вміння": chips, plus a link "Усі вміння →".
  - "Остання робота": rows of time / chat / what, or an empty state.
- **Вміння (skills)**: rows with a name, a description, marks of the helpers who use it, and an on/off switch. A hint explains how to create a skill by asking in chat.
- **Памʼять (memory)**: a search field and rows with the text, "<Name> · <where> · <when>" and a "Забути" (×) button.
- **Підключення ШІ (engines)**:
  - "Програми на цьому компʼютері": Claude Code, Codex, Gemini CLI, OpenCode.
  - "Моделі напряму": Ollama, LM Studio, OpenRouter.
  - Each row shows its status (dot + text) and an action (Увійти / Як встановити / Перевірити / Додати ключ). The "Захищений режим" card has the segmented control Авто / Завжди / Вимкнено.

### Not yet designed (placeholders in the prototype)
Нагадування (Schedule), Вигляд (Customize: theme, window manager preset, bar edge and size), Мова, Резервні копії (Restore points), Телефон (Devices pairing), Готові набори (Catalog), Сповіщення settings, the server-unreachable error, safe mode, and the 390px phone layout. Their specs are in the original brief; ask the designer before inventing UI for them.

## Interactions & motion
- Transitions: 160ms `cubic-bezier(.2,0,0,1)` for hover, focus, borders and switch thumbs; 200ms for popovers and sheets. No bounces or springs.
- Focus ring: `outline: 2px solid var(--ring); outline-offset: 2px` on `:focus-visible`.
- Popovers close on an outside click or Esc.
- Approving the CRM change adds a version ("Колонка Email і експорт у CSV"), switches the view back to Зараз, and posts a system line.
- Sending a message adds a user bubble, then a running run card from the target helper.

## State (suggested store shape)
```ts
ui: { menuOpen, addOpen, advancedMode, welcomeDismissed, query }
wm: { tiles: {id, app}[], focusIndex, ratio, preset: 'hypr'|'i3', mod: 'Alt'|'Ctrl+Alt'|'Super', barEdge }
apps: { installed: string[], enabled: Record<builtinId, boolean>, extra: Record<id, AppMeta> }
chats: Record<chatId, Message[]>   // Message = sys | own | agent | run | approval | alert
chatUi: { selected, topic, pane: 'list'|'chat', runOpen: Set, codeOpen: Set, compose: Record<chatId,string> }
appChat: { open: Record<appId,bool>, team: Record<appId, agentId[]> }
versions: Record<appId, {note, when}[]>; draftView: 'live'|'draft'
agents: Record<id, {name, role, prompt, engine, perms, budget:{used,limit}}>
skills: {id,name,desc,users[],enabled}[]; memory: {id,text,owner,where,when}[]
engines: {id,name,kind:'cli'|'api',status,ok}[]; sandbox: 'auto'|'required'|'off'
```
The pending-approvals count is derived: the number of approval messages with `state === 'pending'` across all chats.

## Design tokens (shadcn names + Aura extras)

| Token | Light | Dark |
|---|---|---|
| --background | #f2f2f3 | #17191b |
| --foreground | #1d1f20 | #e7e7ea |
| --card | #f5f5f8 | #1e2022 |
| --popover | #f5f5f8 | #232527 |
| --primary | #416180 | #94bce3 |
| --primary-foreground | #f5f5f8 | #1d2d3d |
| --secondary | #e7e7ea | #2b2b2d |
| --muted | #e9e9ea | #26282a |
| --muted-foreground | #5d5d60 | #a6a6a9 |
| --accent | #d6ebff | #2c455d |
| --accent-foreground | #2c455d | #d6ebff |
| --destructive | oklch(0.52 0.15 27) | oklch(0.70 0.14 27) |
| --warning | oklch(0.60 0.13 70) | oklch(0.78 0.12 75) |
| --warning-text | oklch(0.48 0.11 65) | oklch(0.82 0.11 78) |
| --border | #1d1f20 @16% | #e7e7ea @14% |
| --input | #1d1f20 @22% | #e7e7ea @20% |
| --ring | #5980a6 | #94bce3 |
| --radius | 0 | 0 |
| --rail | #1d2d3d | #0f161d |
| --rail-foreground | #d6ebff | #b5d9fd |
| --bubble-own | #d6ebff | #2c455d |
| --bubble-other | #f5f5f8 | #1e2022 |
| --chat-bg | #f2f2f3 | #17191b |
| --grid-dot | #1d1f20 @13% | #e7e7ea @9% |
| --signal | #5980a6 | #94bce3 |
| --signal-text | #416180 | #b5d9fd |
| --wm-gap / --wm-radius / --wm-border | 10 / 10 / 2 (Hyprland) · 0 / 0 / 1 (i3) | same |

Shadows:
- `--shadow-md` (light): `0 3px 10px rgb(43 43 45 / .16)`
- `--shadow-md` (dark): `0 0 0 1px rgb(231 231 234 / .08), 0 8px 24px rgb(0 0 0 / .45)`

**Type** (current: Barlow body, Barlow Condensed 600 headings, Geist Mono for numbers, code, time and the clock):

| Role | Size and weight |
|---|---|
| H1 onboarding | 48–52px |
| Section headings | 24–26px |
| Card titles | 19–21px |
| Body | 14–14.5px / 1.45–1.55 |
| Small | 12–13px |
| Mono meta | 10.5–11.5px |

**Spacing** follows a 4px base (×0.85 density in the prototype). Common values: 4, 6, 8, 10, 12, 14, 16, 20, 24, 28.

**Agent marks** are squares told apart by fill style, not hue, so they work with any theme:

| Helper | Mark |
|---|---|
| Помічник | solid primary |
| Майстер | solid foreground |
| Програміст | accent tint |
| Перевіряльник | primary outline |
| Тестувальник | dashed outline |

Humans are round.

## Assets
- Icons: lucide (stroke 1.5): message-square, bell, clock, bot, sliders-horizontal, languages, history, smartphone, package, users, check-square, file-text, wallet, search, plus, x, more-horizontal, key-round, database, send, user-plus, panel-right, square-plus, layout-grid.
- No images. The "A" logo is a placeholder.

## Files
- `prototype/Aura R4.dc.html`: the main prototype (onboarding, shell, Start menu, chats, CRM, Помічники). The logic class at the bottom holds all the mock data and behaviour.
- `prototype/Aura Simple Chat Feed.dc.html`: the chat feed (message and card types, composer).
- `prototype/Aura R1 Design System.dc.html`: tokens, components and the Hyprland vs i3 tile presets.
- `prototype/_ds/…/styles.css`: the Industry base stylesheet (`.btn`, `.input`, `.seg`, `.table` classes the prototype uses). In the real app, map these to shadcn Button, Input, ToggleGroup and Table.
