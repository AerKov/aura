# Apps

An **app** is a tool you run on [the screen](The-Screen): a client list, a board, a tracker,
a dashboard. You make it by describing it, then use it and change it by talking about it in **its
own chat**. Every change is shown to you first, and every version can be brought back.

## Make an app

- **Home** → **Add an app**: start from a template (**CRM**, **Tasks**, **Notes**), or empty:
  give it a name and, if you like, say what it should do (an empty app needs Chats on).
- Or ask the orchestrator: _"make me an app to track clients and deals"_. It proposes the app on a
  card; approve it.

Aura creates the app's chat (under **Apps** in the chat list) with **@builder**, the agent that
writes apps, and opens the app. An empty app opens with its chat panel (**Chat** in the app's bar)
so you can talk to @builder right there. If you described it, @builder starts right away;
otherwise it waits for you in the chat.

## Change it

Say what you want in the app's chat: _"add an email column"_, _"sort by status"_,
_"make the Add button green"_. @builder edits the app's files, then you get a card with the diff:

- **Approve**: the change goes live and the app reloads.
- **Reject**: the change is thrown away.
- Before deciding, **Draft** on the app's tile shows the change running; **Live** goes back.
  The bin next to it discards the change too.

If a change asks for more than the app has now (another permission, a host, a secret), the card
says so in bold. Until you approve, the app keeps what it had.

Use [topics](Chats-and-Agents#topics) to keep changes apart from everyday use, for example a
_Customization_ topic.

## Versions

The clock button on the app's tile lists its versions. **Restore** brings an older one back as a
new version, so that can be undone too. The app's folder is `~/.aura/projects/<app>` (a git
repository).

## Its data

An app keeps its data in **its own store**, never in Aura's database. The database button on the
app's tile shows where and how much:

- **Its own database** (the default): a database of its own in `~/.aura/state/apps/<app>`.
- **Files in its folder**: JSON files in `~/.aura/projects/<app>/data`, easy to read and copy.

Switching moves the data. **Export** saves everything as one JSON file; **Delete data** clears it.
Restoring an older version of the app does not touch its data.

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

## What an app can do

Apps run in a sandbox and use the [extension permissions](Customization): their own data, the
hosts you allowed (with keys kept by Aura), asking agents for you, reading project files, forms
and buttons. A new app starts with a panel and its own data only.
