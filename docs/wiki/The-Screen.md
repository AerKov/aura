# The screen

Aura is a core you fill with apps. It opens on **Home**, the shelf of your apps, and lays out the
apps you open as **tiles**, like a tiling window manager. Even the built-in parts (Chats, Skills,
Memory…) are apps, and you can turn off the ones you do not need.

## Home

Click the logo at the top of the rail to open Home. It shows:

- **Your apps:** the apps you built or installed. Click one to open it.
- **Add an app:** start from a template (CRM, Tasks, Notes), browse the [Catalog](Catalog), or, with
  Chats on, start an empty app that @builder makes from your description.
- **Built in:** Chats, Skills, Memory, Schedule, Signals and Integrations, each with a switch.
- **Aura:** Catalog, Customize and Devices, which are always there.

## Tiles

- **Open an app:** click its icon in the rail or on Home. It replaces the app in the focused tile
  (the one with the blue line), or comes to the front if it is open already. There are no tabs: a
  tile shows one app.
- **Side by side:** **Shift-click** an icon to open it in a new tile on the right, or use **+** in a
  tile's bar and choose **Here**, **Right** or **Below**.
- **Close:** the **×** at the end of a tile's bar. Closing the last tile brings Home back.
- **Home is a launcher:** it can be open in several tiles; opening an app from one replaces it.
- **Resize:** drag the line between two tiles (or focus it and use the arrow keys).
- The screen is saved as you change it and comes back the same next time.

You can also ask the orchestrator: _"open Agents on the right"_, _"close Skills"_,
_"what is on my screen?"_. Arranging the screen needs no approval: nothing is deleted, and you can
change it back with a click.

## Look and keys, like a tiling window manager

**Customize → Window manager** sets how it looks: the **Hyprland** preset (gaps, round corners, a
coloured border on the focused tile, thin title bars) or **i3** (no gaps, square, full title bars),
then gaps, corners, borders and title bars one by one (**Thin** and **Hidden** show a tile's buttons
when you point at it). **Bar** puts the bar on the left, right, top or bottom. The bar ends with the
status: approvals waiting, agents at work, the clock and the connection.

Keyboard, with **Mod** set to Alt (default), Ctrl+Alt (best on macOS) or Super:

| Keys                        | Does                                    |
| --------------------------- | --------------------------------------- |
| Mod+←↑→↓                    | focus the tile in that direction        |
| Mod+Shift+←↑→↓              | swap the tile with that one             |
| Mod+Enter / Mod+Shift+Enter | new tile with Home on the right / below |
| Mod+Q                       | close the tile                          |
| Mod+H                       | Home                                    |
| Mod+1…9                     | the bar's apps, in order                |

They work while the focus is outside an app's own frame (click the tile's title bar or the
desktop around the tiles first). In a text field Mod+arrows keep moving by word. You can also ask
the orchestrator: _"make it look like i3 with the bar on top"_.

## Your own bar

**Customize → Window manager → Bar** chooses the bar:

- **Built-in**: Aura's own bar.
- **Your own (code)**: the bar becomes an app you can change completely: other widgets, another
  look, other behaviour. It starts looking like the built-in one. Change it in its chat (**Change it
  in its chat**) or ask the orchestrator (_"add the weather to the bar"_); @builder writes the code
  and you approve the change as a diff. **Try the change waiting for approval** shows it before you
  decide, and **Versions** brings back any earlier bar.
- **Off**: no bar. Use Home (Mod+H) and the keyboard. Phones keep their tab bar.

If your bar fails (an error, or it does not start), Aura shows the built-in bar instead and
Customize says why; fix it or restore a version, then **try again**.

## An app's chat

Every app you build or install has a chat, where you use it and change it with @builder (see
[Apps](Apps)). **Chat** in the app's bar opens it as a panel inside the app's tile, and closes it
again. Nothing opens by itself: a project's chat has an **Apps** button to open its app beside it.

## Turning built-in apps off

Not everyone needs agents: you may only want to use the apps you installed. Turn an app off with
its switch on Home:

- **Chats** is the messenger with the orchestrator and AI agents, and every app's chat. Skills,
  Memory, Schedule and Signals work through it, so turning Chats off turns them off too (Home asks
  first); turning one of them on turns Chats on.
- Off means off: its pages and features are gone, agents get no tools from it, and nothing runs in
  the background for it. Your data stays, and turning it on brings everything back.
- The choice is saved in `~/.aura/modules.json`, like the rest of your setup.

## Phone

A phone shows one app at a time, with the main icons at the bottom. Moving around on the phone
does not change the tiles on your computer.
