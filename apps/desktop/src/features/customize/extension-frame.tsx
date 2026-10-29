import {
  type ExtensionInfo,
  type ExtensionPermission,
  type Message,
  mimeOf,
  type Placement,
} from "@aura/shared";
import { useEffect, useRef, useState } from "react";
import { reportError } from "@/features/chat/actions";
import { getState, useChatStore } from "@/features/chat/store";
import { askForFiles } from "@/features/files/picker";
import { useLocale } from "@/features/localization/i18n";
import { api, call, SERVER_URL } from "@/lib/api";
import { fetchFile, openFile, saveBlob } from "@/lib/files";
import { cn } from "@/lib/utils";

const THEME_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--muted",
  "--muted-foreground",
  "--border",
  "--primary",
  "--primary-foreground",
  "--accent",
  "--radius",
];

/** The biggest file an app can read back into its frame. */
const MAX_READ = 10 * 1024 * 1024;

const docPath = (app: string, id: string) =>
  `/extensions/${encodeURIComponent(app)}/docs/${encodeURIComponent(id)}`;

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

type Request = { aura: 1; id?: number; method: string; params?: Record<string, unknown> };

const METHOD_PERMISSION: Record<string, ExtensionPermission | null> = {
  "chat.list": "chat.read",
  "chat.messages": "chat.read",
  "chat.post": "chat.write",
  "alerts.recent": "alerts.read",
  "alerts.post": "alerts.write",
  // Checked per event below: "context" needs nothing, "message.created" needs chat.read.
  "events.subscribe": null,
  "ui.setTitle": "ui.panel",
  "context.get": null,
  "storage.get": "storage",
  "storage.set": "storage",
  "storage.keys": "storage",
  "net.fetch": "net",
  "agents.ask": "agents.ask",
  "files.list": "files.read",
  "files.read": "files.read",
  "docs.pick": "docs",
  "docs.list": "docs",
  "docs.put": "docs",
  "docs.read": "docs",
  "docs.remove": "docs",
  "docs.view": "docs",
  "docs.save": "docs",
  data: "storage",
  "actions.run": "storage",
  "apps.call": "apps.call",
  "snapshot.result": null,
  "bar.state": "ui.bar",
  "bar.open": "ui.bar",
  "bar.menu": "ui.bar",
  error: null,
};

/** What the bar app sees and can do (ADR 0029); the host is the shell's bar. */
export interface BarHost {
  state: () => unknown;
  open: (key: string, where: Placement) => void;
  menu: (items: { label: string; value: string }[]) => Promise<string | null>;
}

/** The chat the extension is open next to (side panel), or nothing (a page in the rail). */
export interface ExtensionContext {
  chatId: string | null;
  projectId: string | null;
}

const NO_CONTEXT: ExtensionContext = { chatId: null, projectId: null };

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)]));
}

/** What an extension may see of a message: no run internals. */
function publicMessage(m: Message) {
  return {
    id: m.id,
    chatId: m.chatId,
    author: m.author,
    body: m.body,
    card: m.card?.type === "run" ? null : m.card,
    createdAt: m.createdAt,
  };
}

/**
 * Hosts one UI extension in a sandboxed iframe (opaque origin, no network) and answers its
 * postMessage requests, checking each against the permissions the user granted. The server checks
 * them again for everything it serves (ADR 0021).
 */
export function ExtensionFrame({
  extension,
  context = NO_CONTEXT,
  variant = "page",
  draft = false,
  bar,
  barState,
  onReady,
  onError,
}: {
  extension: ExtensionInfo;
  context?: ExtensionContext;
  /** "side": inside a tile, which has its own header; "bar": the shell's bar. */
  variant?: "page" | "side" | "bar";
  /** An app's changes that wait for approval (ADR 0024). */
  draft?: boolean;
  /** For the bar app: what it sees and can do, and its state to push on changes. */
  bar?: BarHost;
  barState?: unknown;
  /** The frame asked for its state (the bar is alive). */
  onReady?: () => void;
  /** The frame reported an error. */
  onError?: (message: string) => void;
}) {
  const locale = useLocale();
  const barRef = useRef(bar);
  barRef.current = bar;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const ref = useRef<HTMLIFrameElement>(null);
  const [title, setTitle] = useState(extension.name);
  const subscribed = useRef(new Set<string>());
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    const frame = ref.current;
    const has = (p: ExtensionPermission) => extension.permissions.includes(p);
    const ext = () => api.extensions({ extensionId: extension.id });
    const reply = (id: number | undefined, result: unknown, error?: string) =>
      frame?.contentWindow?.postMessage({ aura: 1, id, result, error }, "*");

    const handle = async (req: Request) => {
      const needed = METHOD_PERMISSION[req.method];
      if (needed === undefined) return reply(req.id, null, `Unknown method ${req.method}`);
      if (needed && !has(needed))
        return reply(req.id, null, `Permission "${needed}" was not granted`);
      const p = req.params ?? {};
      switch (req.method) {
        case "chat.list":
          return reply(
            req.id,
            Object.values(getState().chats).map((c) => ({
              id: c.id,
              kind: c.kind,
              title: c.title,
            })),
          );
        case "chat.messages": {
          const chatId = String(p.chatId ?? "");
          const messages = await call(() =>
            api.chats({ chatId }).messages.get({ query: { limit: 100 } }),
          );
          return reply(req.id, messages.map(publicMessage));
        }
        case "chat.post": {
          const message = await call(() =>
            api
              .extensions({ extensionId: extension.id })
              .messages.post({ chatId: String(p.chatId ?? ""), body: String(p.body ?? "") }),
          );
          return reply(req.id, publicMessage(message as Message));
        }
        case "alerts.recent": {
          const messages = await call(() =>
            api.chats({ chatId: "system" }).messages.get({ query: { limit: 100 } }),
          );
          return reply(
            req.id,
            messages.flatMap((m) =>
              m.card?.type === "alert" ? [{ ...m.card, raw: undefined, messageId: m.id }] : [],
            ),
          );
        }
        case "alerts.post":
          return reply(
            req.id,
            await call(() =>
              ext().alerts.post({
                title: String(p.title ?? ""),
                summary: typeof p.summary === "string" ? p.summary : undefined,
                severity:
                  p.severity === "info" || p.severity === "critical" ? p.severity : "warning",
                fingerprint: typeof p.fingerprint === "string" ? p.fingerprint : undefined,
              }),
            ),
          );
        case "context.get":
          return reply(req.id, contextRef.current);
        case "storage.get": {
          const { value } = await call(() =>
            ext().storage.get({ query: { key: String(p.key ?? "") } }),
          );
          return reply(req.id, value ?? null);
        }
        case "storage.keys": {
          const { keys } = await call(() => ext().storage.get({ query: {} }));
          return reply(req.id, keys ?? []);
        }
        case "storage.set":
          await call(() => ext().storage.put({ key: String(p.key ?? ""), value: p.value ?? null }));
          return reply(req.id, true);
        case "net.fetch":
          return reply(
            req.id,
            await call(() =>
              ext().fetch.post({
                url: String(p.url ?? ""),
                method: typeof p.method === "string" ? p.method : undefined,
                headers: stringRecord(p.headers),
                body: typeof p.body === "string" ? p.body : undefined,
              }),
            ),
          );
        case "agents.ask": {
          const chatId = typeof p.chatId === "string" ? p.chatId : contextRef.current.chatId;
          if (!chatId)
            return reply(req.id, null, "Open the extension next to a chat, or pass chatId");
          const message = await call(() =>
            ext().ask.post({ chatId, agent: String(p.agent ?? ""), text: String(p.text ?? "") }),
          );
          return reply(req.id, publicMessage(message as Message));
        }
        case "files.list":
        case "files.read": {
          const project = typeof p.project === "string" ? p.project : contextRef.current.projectId;
          if (!project)
            return reply(
              req.id,
              null,
              "Open the extension next to a project chat, or pass project",
            );
          const read = req.method === "files.read";
          const result = await call(() =>
            ext().files.get({ query: { project, path: String(p.path ?? ""), read } }),
          );
          return reply(req.id, read ? result.content : result.entries);
        }
        case "docs.pick": {
          const files = await askForFiles({
            appName: extension.name,
            accept: typeof p.accept === "string" ? p.accept : undefined,
            multiple: p.multiple === true,
          });
          const saved = [];
          for (const file of files) saved.push(await call(() => ext().docs.post({ file })));
          return reply(req.id, saved);
        }
        case "docs.list":
          return reply(req.id, await call(() => ext().docs.get()));
        case "docs.put": {
          const bytes =
            typeof p.base64 === "string"
              ? Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0))
              : new TextEncoder().encode(String(p.text ?? ""));
          const file = new File([bytes], String(p.name ?? "file"));
          return reply(req.id, await call(() => ext().docs.post({ file })));
        }
        case "docs.read": {
          const blob = await fetchFile(docPath(extension.id, String(p.id ?? "")));
          if (blob.size > MAX_READ)
            return reply(req.id, null, "The file is too large to read here");
          return reply(req.id, p.as === "base64" ? await toBase64(blob) : await blob.text());
        }
        case "docs.remove":
          await call(() =>
            ext()
              .docs({ fileId: String(p.id ?? "") })
              .delete(),
          );
          return reply(req.id, true);
        case "docs.save": {
          const id = String(p.id ?? "");
          const found = (await call(() => ext().docs.get())).find((f) => f.id === id);
          if (!found) return reply(req.id, null, "No such file");
          saveBlob(await fetchFile(docPath(extension.id, id)), found.name);
          return reply(req.id, true);
        }
        case "docs.view": {
          if (typeof p.id === "string") {
            const id = p.id;
            const found = (await call(() => ext().docs.get())).find((f) => f.id === id);
            if (!found) return reply(req.id, null, "No such file");
            openFile({
              name: found.name,
              type: found.type,
              load: () => fetchFile(docPath(extension.id, id)),
            });
          } else {
            // Content the app has right now, shown without being kept.
            const name = String(p.name ?? "file");
            const bytes =
              typeof p.base64 === "string"
                ? Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0))
                : new TextEncoder().encode(String(p.text ?? ""));
            const type = typeof p.type === "string" ? p.type : mimeOf(name);
            openFile({ name, type, load: async () => new Blob([bytes], { type }) });
          }
          return reply(req.id, true);
        }
        case "data": {
          const { result } = await call(() =>
            ext().data.post({
              op: p.op as "list" | "count" | "get" | "insert" | "update" | "delete" | "schema",
              collection: String(p.collection ?? ""),
              id: typeof p.id === "string" ? p.id : undefined,
              record: p.record,
              patch: p.patch,
              query: (p.query ?? undefined) as Record<string, never> | undefined,
            }),
          );
          return reply(req.id, result);
        }
        case "actions.run": {
          const { result } = await call(() =>
            ext()
              .actions({ action: String(p.name ?? "") })
              .post({ input: p.input }),
          );
          return reply(req.id, result);
        }
        case "apps.call": {
          const { result } = await call(() =>
            ext().call.post({
              app: String(p.app ?? ""),
              action: String(p.action ?? ""),
              input: p.input,
            }),
          );
          return reply(req.id, result);
        }
        case "events.subscribe":
          if (p.name === "message.created" && !has("chat.read"))
            return reply(req.id, null, 'Permission "chat.read" was not granted');
          subscribed.current.add(String(p.name ?? ""));
          return reply(req.id, true);
        case "ui.setTitle":
          setTitle(String(p.title ?? extension.name).slice(0, 60));
          return reply(req.id, true);
        case "snapshot.result":
          await call(() =>
            ext()
              .snapshots({ requestId: String(p.requestId ?? "") })
              .post({
                draft: draftRef.current,
                width: Number(p.width ?? 0),
                height: Number(p.height ?? 0),
                outline: String(p.outline ?? "").slice(0, 50_000),
                errors: (Array.isArray(p.errors) ? p.errors : []).map(String).slice(-50),
              }),
          );
          return;
        case "bar.state": {
          const host = barRef.current;
          if (!host) return reply(req.id, null, "Not the bar");
          callbacks.current.onReady?.();
          return reply(req.id, host.state());
        }
        case "bar.open": {
          const where = p.where === "right" || p.where === "below" ? p.where : "here";
          barRef.current?.open(String(p.key ?? ""), where);
          return reply(req.id, true);
        }
        case "bar.menu": {
          const items = (Array.isArray(p.items) ? p.items : []).slice(0, 30).map((i: unknown) => {
            const item = (i ?? {}) as Record<string, unknown>;
            return {
              label: String(item.label ?? "").slice(0, 80),
              value: String(item.value ?? ""),
            };
          });
          return reply(req.id, (await barRef.current?.menu(items)) ?? null);
        }
        case "error":
          console.warn(`extension ${extension.id} error:`, p.message);
          callbacks.current.onError?.(String(p.message ?? "error"));
          await call(() => ext().error.post());
          return;
      }
    };

    const onMessage = (event: MessageEvent) => {
      // Only messages from this extension's own frame are accepted.
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as Request;
      if (data?.aura !== 1 || typeof data.method !== "string") return;
      handle(data).catch((error: unknown) =>
        reply(data.id, null, error instanceof Error ? error.message : "Request failed"),
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [extension]);

  // An agent asks how the app looks (WISH-2): the frame makes the snapshot itself.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const detail = (e as CustomEvent<{ app: string; requestId: string }>).detail;
      if (detail.app !== extension.id) return;
      ref.current?.contentWindow?.postMessage(
        { aura: 1, event: "snapshot", payload: { requestId: detail.requestId } },
        "*",
      );
    };
    window.addEventListener("aura:app-snapshot", onAsk);
    return () => window.removeEventListener("aura:app-snapshot", onAsk);
  }, [extension.id]);

  // An app's data changed (also by agents or other apps): it can refresh (phase 24).
  useEffect(() => {
    const onData = (e: Event) => {
      const detail = (e as CustomEvent<{ app: string; collection: string }>).detail;
      if (detail.app !== extension.id) return;
      ref.current?.contentWindow?.postMessage(
        { aura: 1, event: "data.changed", payload: { collection: detail.collection } },
        "*",
      );
    };
    window.addEventListener("aura:app-data", onData);
    return () => window.removeEventListener("aura:app-data", onData);
  }, [extension.id]);

  // The bar app gets its state again whenever it changes (ADR 0029).
  useEffect(() => {
    if (barState === undefined) return;
    ref.current?.contentWindow?.postMessage(
      { aura: 1, event: "bar.state", payload: barState },
      "*",
    );
  }, [barState]);

  // Tell the extension when the chat next to it changes.
  useEffect(() => {
    ref.current?.contentWindow?.postMessage(
      {
        aura: 1,
        event: "context",
        payload: { chatId: context.chatId, projectId: context.projectId },
      },
      "*",
    );
  }, [context.chatId, context.projectId]);

  // Forward new messages to an extension that subscribed (and may read chats).
  const messages = useChatStore((s) => s.messages);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!subscribed.current.has("message.created") || !extension.permissions.includes("chat.read"))
      return;
    for (const list of Object.values(messages)) {
      for (const m of list) {
        if (seen.current.has(m.id) || m.status !== "final") continue;
        seen.current.add(m.id);
        ref.current?.contentWindow?.postMessage(
          { aura: 1, event: "message.created", payload: publicMessage(m) },
          "*",
        );
      }
    }
  }, [messages, extension.permissions]);

  useEffect(() => {
    // Messages that existed before the frame loaded are not "new".
    for (const list of Object.values(getState().messages))
      for (const m of list) seen.current.add(m.id);
  }, []);

  // Share the app's design tokens with the frame, now and whenever the theme changes.
  const appearance = useChatStore((s) => s.appearance);
  const sendTheme = () => {
    const styles = getComputedStyle(document.documentElement);
    const tokens = Object.fromEntries(
      THEME_TOKENS.map((name) => [name, styles.getPropertyValue(name).trim()]),
    );
    ref.current?.contentWindow?.postMessage({ aura: 1, event: "theme", payload: tokens }, "*");
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: resend when the appearance changes
  useEffect(sendTheme, [appearance]);

  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col",
        // The bar's frame is exactly its strip: an iframe is 150 px high by default (BUG-1).
        variant === "bar" && "h-full w-full overflow-hidden",
      )}
    >
      {variant === "page" && (
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <h1 className="font-semibold">{title}</h1>
          <span className="text-muted-foreground text-xs">
            extension · {extension.permissions.join(", ")}
          </span>
        </header>
      )}
      <iframe
        ref={ref}
        title={title}
        sandbox="allow-scripts"
        // A new language reloads the frame: apps read it once as ctx.language (ADR 0033).
        src={`${SERVER_URL}/extensions/${extension.id}/frame?lang=${locale}${draft ? "&draft=1" : ""}`}
        className={cn("flex-1 border-0", variant === "bar" && "h-full min-h-0 w-full min-w-0")}
        onLoad={sendTheme}
        onError={() => reportError(new Error(`extension ${extension.id} failed to load`))}
      />
    </section>
  );
}
