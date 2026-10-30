# The screen

Aura is a shell you fill with apps. It lays out the apps you open as **tiles** side by side.
Even the built-in parts (Chats, Helpers, Reminders…) are apps, and you can turn
off the ones you do not need.

![My apps](https://raw.githubusercontent.com/AerKov/aura/HEAD/docs/assets/my-apps.png)

## My apps

Click the **A** at the top of the bar (or press Alt+H) to open **My apps** over your work. It lists
every app by **group**, each with a line on what it is for:

- **Your groups first:** the apps you built or installed, grouped as their manifest says (_Work_,
  _Home_…; an app without a group is under _Apps_). Ask in an app's chat to change its group or
  description.
- **Essentials:** Chats and Alerts. **Settings:** one app with tabs: AI, Helpers (team, skills,
  memory, tools and keys), Automations (reminders, alerts from your tools), Look (theme, windows,
  bar, language) and History (restore points, uninstalled apps).
- **Find an app or a setting:** type to filter by name, description or group; Enter opens the
  first match, Esc closes the menu.
- **New app:** a name and what it should do, which a helper builds in its chat.

An empty tile, **New window**, shows the same list. There the **⋯** on one of your apps uninstalls
it (see [Apps](Apps#uninstall-and-bring-back)).

## One view for everyone

There is no separate advanced mode (ADR 0040): run cards show tokens and the commit, alerts have
their technical details, apps show their data and keys on their tiles. Everything built in is always
on.

## Tiles

- **Open an app:** click its icon on the bar or in My apps. It replaces the app in the focused tile
  (the one with the blue border), or comes to the front if it is open already. There are no tabs:
  a tile shows one app.
- **Side by side:** **Shift-click** an icon to open it in a new tile on the right, or use **New
  window beside** in a tile's bar. **Open another app here** swaps the app in that tile.
- **Close:** the **×** at the end of a tile's bar. Closing the last tile leaves a New window.
- **Resize:** drag the line between two tiles (or focus it and use the arrow keys).
- The screen is saved as you change it and comes back the same next time.

You can also ask the orchestrator: _"open Agents on the right"_, _"close Skills"_,
_"what is on my screen?"_. Arranging the screen needs no approval: nothing is deleted, and you can
change it back with a click.

## Windows and keys

**Look → Windows** sets how it looks: the **Airy** preset (gaps, round corners, a
coloured border on the focused tile, thin title bars) or **Compact** (no gaps, square, full title bars),
then gaps, corners, borders and title bars one by one (**Thin** and **Hidden** show a tile's buttons
when you point at it). **Bar** puts the bar on the left, right, top or bottom. The bar ends with the
status: the clock, the connection and the number of decisions waiting for you.

Keyboard, with **Mod** set to Alt (default), Ctrl+Alt (best on macOS) or Super:

| Keys                        | Does                              |
| --------------------------- | --------------------------------- |
| Mod+←↑→↓                    | focus the tile in that direction  |
| Mod+Shift+←↑→↓              | swap the tile with that one       |
| Mod+Enter / Mod+Shift+Enter | a New window on the right / below |
| Mod+Q                       | close the tile                    |
| Mod+H                       | My apps                           |
| Mod+1…9                     | the bar's apps, in order          |

They work while the focus is outside an app's own frame (click the tile's title bar or the
desktop around the tiles first). In a text field Mod+arrows keep moving by word. You can also ask
the orchestrator: _"make the windows compact with the bar on top"_.

## Your own bar

**Look → Windows → Bar** chooses the bar:

- **Built-in**: Aura's own bar.
- **Your own (code)**: the bar becomes an app you can change completely: other widgets, another
  look, other behaviour. It starts looking like the built-in one. Change it in its chat (**Change it
  in its chat**) or ask the orchestrator (_"add the weather to the bar"_); @builder writes the code
  and you approve the change as a diff. **Try the change waiting for approval** shows it before you
  decide, and **Versions** brings back any earlier bar.
- **Off**: no bar. Use Home (Mod+H) and the keyboard. Phones keep their tab bar.

If your bar fails (an error, or it does not start), Aura shows the built-in bar instead and
Look says why; fix it or restore a version, then **try again**.

**Bar thickness** (Look → Windows) sets how thick the bar is, 24–96 px (the built-in
bar needs at least 44). Your own bar can use the same permissions as other apps: `storage` for its
settings, `net` with the hosts it needs (a weather widget, for example); see the README in its
folder. Whatever its CSS does, the bar stays inside its strip.

## An app's chat

Every app you build or install has a chat, where you use it and change it with @builder (see
[Apps](Apps)). **Chat** in the app's bar opens it as a panel inside the app's tile, and closes it
again. Nothing opens by itself: a project's chat has an **Apps** button to open its app beside it.

## Backups and restore points

**Backups** (Settings) keeps restore points and the copies of uninstalled apps. A restore point keeps the whole Aura as it was at a moment: agents, skills,
themes, tool servers, settings files, the look and layout, the language, and every app with its
code, versions and data. Chats, memory and secrets are not part of them.

- **Save the present** with a name. The orchestrator also saves one before bigger changes.
- **Go to this point** takes Aura back. The present is saved first as an _automatic_ point, so you
  can go forward to it again. Apps made after the point are uninstalled with a backup.
- Points are folders in `~/.aura/restore-points`; delete the ones you no longer need.

## Language

**Language** (Settings) sets one language for Aura: its interface, the answers of its
agents, and your apps (they get it as `ctx.language`). _Automatic_ uses this computer's language for
the interface and lets agents answer in the language you write in. English and Ukrainian are built
in; texts without a translation stay in English. To add a language or correct a translation, put
`~/.aura/locales/<code>.json` with `{ "name": "Polski", "englishName": "Polish", "strings": {
"Your apps": "Twoje aplikacje" } }`.

## Phone

A phone shows one app at a time, with the main icons at the bottom. Moving around on the phone
does not change the tiles on your computer.
