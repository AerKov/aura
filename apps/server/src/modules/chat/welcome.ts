/**
 * The orchestrator's first message on a new install (ADR 0024): what Aura is and what to ask.
 * Fixed text, so the first launch costs nothing; the orchestrator answers in the user's language.
 */
export const WELCOME = `👋 Hi! I'm your orchestrator in **Aura**.

Aura is a home for your own apps. Each app opens as a tile on this screen and has a chat where you use it and change it together with AI agents. This chat with me is the first app.

**Things you can ask me**
- *"Make me a panel to track clients and deals"*: I plan it with you, and you approve it before it is installed.
- *"Open Agents on the right"*, *"close Skills"*: I arrange your screen.
- *"Make the theme darker"*: I change how Aura looks.
- *"Start a project: a small CLI that converts temperatures"*: a team of agents builds it in its own chat.

**Around the screen**
- The icons on the left open apps. Drag the border between tiles to resize them; the buttons on a tile split it or close it.
- Nothing changes without you: I show every change first, and it is saved in \`~/.aura\` (a git repository), so it can be undone.
- **Engines** decide what runs the agents: Claude Code under your own login, other agent apps, or local models.

What would you like to make? Write in any language.`;
