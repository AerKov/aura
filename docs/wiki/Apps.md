# Apps

An **app** is a tool you run on [the screen](The-Screen): a client list, a board, a tracker,
a dashboard. You make it by describing it, then use it and change it by talking about it in **its
own chat**. Every change is shown to you first, and every version can be brought back.

## Make an app

Every app has a name, a one-line **description** and a **group**, shown in My apps. @builder keeps them
in the app's manifest; say in its chat if you want them changed.

- **My apps** → **New app**: start from a template pack you installed, or empty:
  give it a name and, if you like, say what it should do (an empty app needs Chats on).
- Or ask the orchestrator: _"make me an app to track clients and deals"_. It proposes the app on a
  card; approve it.

Aura creates the app's chat (under **Apps** in the chat list) with **@builder**, the agent that
writes apps, and opens the app. An empty app opens with its chat panel (**Chat** in the app's bar)
so you can talk to @builder right there. If you described it, @builder starts right away;
otherwise it waits for you in the chat.

## Change it

![A change waiting for a decision](https://raw.githubusercontent.com/AerKov/aura/HEAD/docs/assets/app-chat.png)

Say what you want in the app's chat: _"add an email column"_, _"sort by status"_,
_"make the Add button green"_. @builder edits the app's files, then you get a card that says in
plain words what will change (the diff is under **Technical details**):

- **Yes, do it**: the change goes live and the app reloads.
- **No, thanks**: the change is thrown away.
- Before deciding, **After the change** on the app's tile shows the change running; **Now** goes
  back. In advanced mode the bin next to it discards the change too.

If a change asks for more than the app has now (another permission, a host, a secret), the card
warns you. Until you approve, the app keeps what it had.

Use [topics](Chats-and-Agents#topics) to keep changes apart from everyday use, for example a
_Customization_ topic.

## Versions

The clock button on the app's tile (**History of changes**) lists its versions. **Bring back** brings an older one back as a
new version, so that can be undone too. The app's folder is `~/.aura/projects/<app>` (a git
repository).

## Its data

An app keeps its data in **its own store**, never in Aura's database. The database button on the
app's tile shows where and how much:

- **Its own database** (the default): a database of its own in `~/.aura/state/apps/<app>`.
- **Files in its folder**: JSON files in `~/.aura/projects/<app>/data`, easy to read and copy.

Switching moves the data. **Export** saves everything as one JSON file; **Delete data** clears it.
Restoring an older version of the app does not touch its data.

## Its files

![A PDF in the viewer, with Print and Save](https://raw.githubusercontent.com/AerKov/aura/HEAD/docs/assets/viewer.png)

An app with the `docs` permission keeps **files of its own** (PDFs, images, exports): it asks you to
add them (a window with a button and a drop area), shows them, and saves them to your computer. A PDF
opens in the viewer with **Print** and **Save**. They live in `~/.aura/files/apps/<app>/`, outside the
app's git history, go into the app's backup when you uninstall it, and come back with it. Ask in the
app's chat: _"let me add the invoices as PDFs and show them in a window I can print"_.

## Its secrets

An app that talks to a service (a weather API, your tracker) gets its key from **its own
secrets**: the key button next to the **Chat** button on its tile lists the names its manifest uses; type a value and save. @builder names the secrets and tells you to enter them there; it never asks for a value in the chat.
Only that app can use it, and only in its requests to the hosts you approved for it: the app's code
never sees the value, other apps and agents cannot read it, and Aura never shows it again. Agents'
secrets are separate (see [Agents](Agents)).

## Use it from the chat

An app can offer **actions**: _find clients_, _add a client_, _mark a deal won_. In the app's chat,
agents use them for you: _"add Petrenko, a lead from the fair"_, _"how many deals did we win?"_.
Deleting a record always asks you first, on a card.

## Apps that work together

An app can offer some of its actions to other apps (for example, a CRM offers _find clients_). Another
app that wants to use them says so in its manifest, and the card you approve lists exactly which
actions of which app it will call. It can call nothing else, and only what the first app still offers.

## Apps from others

Apps come in [Catalog](Catalog) packs, built in or from a link (community apps). Installing one
creates the app with its own chat, like one you made. You can change it in its chat as usual.

When the author ships a new version, install the pack again (**Update**): your own changes stay, and
where you and the author changed the same lines, the author's version is used. The preview says so
before you install, and **Versions** on the app's tile brings yours back if needed. If the app has a
change waiting for your approval, decide on that first.

## Uninstall and bring back

The **⋯** menu on your app in a New window has **Uninstall**. Aura keeps a backup first, in
`~/.aura/backups/apps`: its code with all its versions, its data, what you allowed it, and its chat
as text. Then the app, its chat and its data are gone. Its secrets are deleted, never backed up.

**Backups** → **Uninstalled apps** → **Bring back** puts the app back as it was, with a new
chat (the old one is in the backup as `chat.md`).

## Libraries

Apps are not limited to the built-in kit. For charts, calendars, markdown or maps, @builder adds a
library from npm with an exact version: Aura downloads it once into the app's `lib/` folder, and the
change card lists it (`library: lib/chart.js@4.4.1/chart.umd.js`). It runs only inside the app's
frame, which has no network; nothing loads from the internet while the app runs.

## Its language

An app gets the language you chose in **Language** as `ctx.language` and writes its own texts in
it; it reloads when you change the language.

## What an app can do

Apps run in a sandbox and use the [extension permissions](Customization): their own data, the
hosts you allowed (with keys kept by Aura), asking agents for you, reading project files, forms
and buttons, posting alert cards to the Alerts chat (`alerts.write`, see
[Alerts](Alerts-and-Schedules)). A new app starts with a panel and its own data only.

**@builder can look at the app.** After a change it can ask to see the app as you see it: an outline
of the page (headings, buttons, fields, tables) and its recent errors. This works while the app is
open on your screen; to let it see a change before you approve it, click **After the change** on the app's
tile.
