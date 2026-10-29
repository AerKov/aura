/**
 * The orchestrator's first message on a new install (ADR 0024): what Aura is and what to ask.
 * Fixed text, so the first launch costs nothing; the orchestrator answers in the user's language.
 */
export const WELCOME = `👋 Hi! I'm your orchestrator in **Aura**.

Aura is a home for your own apps. Each app opens as a tile on this screen and has a chat where you use it and change it together with AI agents. Chats, this one included, are an app too: you can turn them off on **Home** if you only want to use your apps.

**Things you can ask me**
- *"Make me a panel to track clients and deals"*: I plan it with you, and you approve it before it is installed.
- *"Open Agents on the right"*, *"close Skills"*: I arrange your screen.
- *"Make the theme darker"*: I change how Aura looks.
- *"Start a project: a small CLI that converts temperatures"*: a team of agents builds it in its own chat.

**Around the screen**
- **Home** (the logo at the top left) shows all your apps. The icons on the left open them; Shift-click opens one beside. Drag the border between tiles to resize them.
- Nothing changes without you: I show every change first, and it is saved in \`~/.aura\` (a git repository), so it can be undone.
- **AI connection**: helpers think with an AI you connect. The easiest is a free service (Google Gemini, Groq, OpenRouter…): make a key, paste it. Claude Code and other agent apps or local models are there for advanced use.

What would you like to make? Write in any language.`;
