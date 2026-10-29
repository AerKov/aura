# Aura: redesign brief for Claude Design

Paste this as the first message in Claude Design. It is written for Claude: the context first, then
what to make, in what order, and the rules. Work in rounds: show each round, wait for feedback, then
go on.

---

## Your role and the goal

You are the product designer of Aura. Redesign the whole interface so it feels like a calm,
keyboard-first **desktop OS shell for AI agents and the user's own apps**, with the quality of
Linear, Raycast and Telegram Desktop, and the soul of a tiling window manager (Hyprland, i3).

The design goes back into a real app built with React, Tailwind CSS v4 and shadcn/ui. So design
with that system in mind: tokens as CSS variables, shadcn-like components, lucide icons.

## 1. What Aura is

Aura is a **local-first desktop app** (Tauri, later a phone client): a **shell for the user's own
apps**, laid out as **tiles like a tiling window manager** (Hyprland / i3 feel).

- **Every app has a chat.** The user uses and changes an app by talking to AI agents in its chat.
- The first and main app is a **Telegram-simple messenger** where the user works with an AI
  **orchestrator** and a team of AI **agents** (@coder, @reviewer, @builder…). Agents talk to each
  other in chats like people, write code and files, handle monitoring alerts, and ask the user to
  **approve** anything that matters (a diff, a new agent, a deletion).
- The user builds their own apps (a CRM, a task board, a dashboard) by describing them; **@builder**
  writes them, and each change is a diff the user approves.
- Everything runs on the user's computer. No accounts, no cloud.

Audience: one technical person (developer, maker) who likes keyboard-driven tools, Telegram,
Linear, Raycast, tiling WMs. The UI must feel **calm, dense but airy, fast, keyboard-first**.

## 2. Design system rules

- **Fonts:** Geist (interface) and Geist Mono (small labels, code, numbers, the clock).
- **Colour only as tokens**, with shadcn names: `--background`, `--foreground`, `--card`, `--popover`,
  `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`,
  `--ring`, `--radius`, plus Aura's `--rail`, `--rail-foreground`, `--bubble-own`, `--bubble-other`,
  `--chat-bg`, `--grid-dot`, `--signal`. Users install themes that override these variables, so
  every component must look right with any palette.
- **Light and dark** are both first-class. Contrast AA. Visible focus rings.
- **Tiles** take their look from `--wm-gap` (0–24px), `--wm-radius` (0–20px) and `--wm-border`
  (0–4px). Two presets must both look great with no other change: **Hyprland** (gaps, rounded, an
  accent border on the focused tile) and **i3** (no gaps, square corners, thin borders, title bars).
- **Current identity** (keep its spirit unless you have something better and say why): cool airy
  surfaces, slate ink, soft rounded shapes, **one signal colour, clear blue**; a faint **dot grid**
  behind conversations; small **mono uppercase kicker labels** (RUN, APPROVAL, SYSTEM).
- Motion: 150–200ms, subtle; no bounces.
- Desktop first (1280–1920px), and every screen also at **390px** (phone: one app at a time, the bar
  at the bottom).

## 3. Product rules the design must respect

- **No tabs** inside tiles. A tile shows exactly one app. Opening an app replaces the focused
  tile's app or focuses the tile that already shows it.
- **Only three chat kinds:** direct (user + orchestrator), group (a project or an app), system
  (alerts). Chats have **topics**, one level, like Telegram forum topics. **Replies** to a message,
  like Telegram. No workspaces, channels or nested threads.
- Built-in apps can be **turned off** (Chats, Skills, Memory, Schedule, Signals); off means gone
  from the bar and the launcher shows them dimmed.
- Anything with side effects shows an **approval card**; nothing happens until the user approves.

## 4. The shell

### The bar (rail)

- A thin bar on **any edge** (left by default; top, right, bottom possible), thickness 24–96px.
- Top: the Aura logo = **Home**. Then app icons (Chats, Skills, Memory, Agents, Catalog, Schedule,
  user apps…, Engines, Customize, Localization, Restore points, Devices). Active app: highlighted.
- Bottom: a **status** block: a vertical 24h clock (stacked HH / MM), a connection dot, a badge
  with the number of approvals waiting.
- The user can replace the bar with their own app (code), so keep it simple and modular.

### Tiles

- The screen is a tree of splits (horizontal/vertical) with resizable gutters.
- Each tile: a **minimal title bar** (app icon + name, `+` "open an app here / right / below",
  close ×). The **focused tile** has an accent border.
- Keyboard: `Mod+arrows` focus, `Mod+Shift+arrows` move/swap, `Mod+Enter` split, `Mod+Q` close,
  `Mod+H` home, `Mod+1…9` open bar items. Mod is Alt, Ctrl+Alt or Super. Show these in tooltips.
- An app tile can open its **chat as a side panel** inside the tile (button "Chat" in the tile bar).

## 5. Screens

Use realistic mock data (Ukrainian and English mixed is fine; the UI supports both languages).

1. **Home: the launcher** (like the Start menu / Android app drawer)
   - Header: "Your apps", a search box ("Find an app"; Enter opens the first match), "+ Add an app".
   - Apps **grouped**: the user's groups first (Work, Home, Money…), then built-in groups
     **Communication** (Chats, Signals), **Agents** (Agents, Skills, Memory, Schedule),
     **System** (Engines, Catalog, Customize, Localization, Restore points, Devices).
   - Each app card: icon, name, **one-line description**. Built-in modules have an on/off switch
     (turning Chats off also turns off what depends on it: confirm popover). User apps have a ⋯
     menu with **Uninstall…** (confirm: "a backup is kept").
   - First-run welcome card (dismissible). "Add an app" panel: templates (CRM, Tasks, Notes), or
     Empty with a name and "what it should do".

2. **Chats (the messenger)**: two panes.
   - **Chat list**: direct chat with the orchestrator pinned on top, project chats, app chats
     (under "Apps"), the system chat "Signals". Each row: avatar mark, title, last message preview,
     time, unread count, a "working…" indicator when an agent runs.
   - **Chat view**: header (title, members as small avatars, budget used, topics button, "app"
     button for project apps), a **topic bar** (General + user topics), messages on a dot grid.
   - **Messages**: user messages right-aligned in a soft bubble (`--bubble-own`); agents' messages
     left, no bubble, with a coloured mark and @handle; markdown, code, diffs; reply quote; streaming
     text with a caret.
   - **Cards inside the chat** (most important to get right):
     - **Run card**: an agent is working: status (running/done/error/stopped), live list of tool
       calls (Read file, Bash `bun test`, Edit…), tokens and estimated cost, "Stop", a commit hash
       when it changed files.
     - **Approval card**: kicker APPROVAL, title ("Change CRM", "Create agent @tester"), why, a
       preview (markdown, often a unified **diff**, sometimes "⚠️ It asks for more: permission
       X"), buttons **Approve** / **Reject**, then the decided state.
     - **Alert card**: severity (info/warning/critical), source, title, summary, a count when it
       repeats, last seen time.
     - **Task card**: title, assignee, status (todo/doing/done/blocked).
     - **System line**: small centred text ("App created · budget: none · team: @builder").
   - **Composer**: multiline, `@` opens agent suggestions (handle, name, role), `/` commands,
     reply-to chip, send button; shows who will answer ("→ @orchestrator").
   - Empty states: no chats yet; agent engine not ready (with a "Set up" action).

3. **An app tile** (e.g. CRM): the app's own UI runs in a sandboxed frame (design a sample CRM:
   tabs Clients / Deals board / Overview, a table, a kanban, small stat tiles) with the tile bar
   buttons: **Chat** (side panel), **Draft/Live** toggle when a change waits for approval,
   **Versions** (list with Restore), **Data** (where it is stored, export, delete), **Secrets**
   (key icon: names and set/unset state, never values).

4. **Agents**: chips to pick an agent, then its card:
   - Header: mark, name, @handle, role, engine + model with a ready dot, warnings (amber box).
   - **System prompt**: collapsible parts in order, the first is "Its prompt" (editable: textarea →
     "Review changes" shows a diff → Save), the rest marked "added by Aura" (team rules, skills,
     sandbox, variables, memory, language). **Versions of its prompt**: list, click shows the diff,
     "Bring this version back".
   - **Tools** (toggle tiles: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch), variables
     editor (name = value or a secret reference), **Budget** (tokens or dollars, used bar).
   - **Memory and recent runs**: its notes; a list of runs (time, chat, tools, tokens, "3 notes"
     expandable).
   - Below: **Tool servers (MCP)** list with Add / Test / status, and **Secrets** (names only).

5. **Skills**: list of skills, each with description, which agents use it, versions with diffs.
6. **Memory**: search box, notes list (text, owner agent or project, date), delete.
7. **Schedule**: recurring jobs (cron in words, agent, chat, next run, on/off).
8. **Catalog**: packs (Dev team, Writers, On-call, CRM, Tasks, Notes, themes) as cards with
   contents, "Preview" (files and diff) and "Install"; install from a link.
9. **Engines**: Claude Code / Gemini CLI / Codex / OpenCode (status: logged in or not), Aura's own
   loop on OpenRouter / Ollama / LM Studio (key or URL, models), default engine, the **command
   sandbox** card (Auto / Required / Off, status).
10. **Customize**: theme picker (previews), CSS snippets, **Window manager** (preset Hyprland/i3,
    gaps, radius, border, title style, Mod key, live preview), **Bar** (edge, size, built-in / your
    own app / off, items order and visibility), extensions list.
11. **Localization**: Automatic / English / Українська (+ languages from files) as selectable cards.
12. **Restore points**: "Save the present" with a name; list of points (name, automatic badge, date,
    apps, size, "Go to this point" with confirm, delete); **Uninstalled apps** with "Bring back".
13. **Devices**: pair a phone (big one-time code XXXX-XXXX, QR, addresses), paired devices list.
14. **Startup / errors**: "Starting Aura…" splash; "Cannot reach the Aura server" with the server's
    last log lines and "Try again"; **Safe mode** banner; an app that failed ("App unavailable").
15. **Phone (390px)**: bottom bar, one app at a time, chat list → chat, cards full width, pairing
    screen.

## 6. What to improve

- **Chat hierarchy.** Run, approval and alert cards must be scannable at a glance: a status colour,
  one primary action. Long agent runs must not flood the conversation (collapse tool calls).
- **The launcher** should feel like a real OS shell (Raycast, the Start menu), not a settings page.
- **One layout for the built-in apps** (Agents, Skills, Engines, Customize…): header, sections as
  cards, max width about 760px, one spacing scale.
- Polished **empty, loading and error states**.

## 7. Rounds

1. **Design system:** tokens for light and dark (with values), type scale, spacing, radius, the
   core components (buttons, inputs, switch, chips, cards, popover, the kicker label, avatar marks
   for agents). Show the two tile presets side by side.
2. **The shell:** the bar on the left and on the top, a 2–3 tile layout with the focused tile,
   the tile bar, the "open an app" popover, keyboard hints.
3. **Chats:** chat list and chat view with every card type and the composer, light and dark.
4. **Home launcher** and an **app tile** (the CRM) with its chat panel and draft/versions controls.
5. **Agents** page, then the other built-in apps (Skills, Memory, Schedule, Catalog, Engines,
   Customize, Localization, Restore points, Devices).
6. **States and phone:** startup, server unreachable, safe mode, empty states; every key screen at
   390px.

For each round give an interactive HTML prototype with realistic mock data (Ukrainian and English
mixed is fine), and a short note on the decisions you made and what you would like me to choose.

## 8. Do not

- Do not add tabs, workspaces, channels, nested threads, user accounts or a login screen.
- Do not hard-code colours or fonts outside the tokens; no gradient-heavy identity.
- Do not invent features that are not listed here; ask instead.
- Never show secret values: only names and "set / not set".
