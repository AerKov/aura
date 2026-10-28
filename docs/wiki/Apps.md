# Apps

An **app** is a tool you run on [the screen](The-Screen): a client list, a board, a tracker,
a dashboard. You make it by describing it, then use it and change it by talking about it in **its
own chat**. Every change is shown to you first, and every version can be brought back.

## Make an app

- **+** on any tile → **New app**: give it a name and, if you like, say what it should do.
- Or ask the orchestrator: _"make me an app to track clients and deals"_. It proposes the app on a
  card; approve it.

Aura creates the app's chat (under **Apps** in the chat list) with **@builder**, the agent that
writes apps, and opens the app in a tile next to its chat. If you described it, @builder starts
right away; otherwise it waits for you in the chat.

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

## What an app can do

Apps run in a sandbox and use the [extension permissions](Customization): their own data, the
hosts you allowed (with keys kept by Aura), asking agents for you, reading project files, forms
and buttons. A new app starts with a panel and its own data only.
