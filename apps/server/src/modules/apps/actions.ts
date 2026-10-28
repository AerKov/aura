import { type ZodRawShape, z } from "zod";
import { errorMessage } from "../../lib/log";
import type { AgentTool } from "../../providers/types";
import type { ApprovalService } from "../approvals/service";
import type { Action, Contract } from "./contract";
import type { AppDataService, Query } from "./data";

export class ActionError extends Error {
  override name = "ActionError";
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function query(input: Record<string, unknown>): Query {
  return {
    where: isRecord(input.where) ? input.where : undefined,
    search: typeof input.search === "string" ? input.search : undefined,
    sort: typeof input.sort === "string" ? input.sort : undefined,
    limit: typeof input.limit === "number" ? input.limit : undefined,
  };
}

function id(input: Record<string, unknown>): string {
  if (typeof input.id !== "string" || !input.id) throw new ActionError("give the record's id");
  return input.id;
}

/**
 * An app's actions (ADR 0024, phase 25): named operations over its collections that agents in its
 * chat use like tools, the app itself calls, and other apps may call through a contract: the app
 * offers them (`provides`) and the user approved the caller's `uses`.
 */
export class AppActions {
  constructor(
    private readonly deps: {
      data: AppDataService;
      contract: (app: string) => Promise<Contract>;
      /** "app.action" calls the caller app was granted, or null without `apps.call`. */
      grantedCalls: (app: string) => Promise<string[] | null>;
      approvals: ApprovalService;
    },
  ) {
    deps.approvals.register("app_data_delete", async (payload) => {
      const app = String(payload.app);
      const action = String(payload.action);
      const done = await this.run(app, action, { id: payload.id });
      return done ? `Deleted ${String(payload.id)} from ${app}.` : "It was already gone.";
    });
  }

  private async action(app: string, name: string): Promise<Action> {
    const action = (await this.deps.contract(app)).actions[name];
    if (!action) throw new ActionError(`${app} has no action "${name}"`);
    return action;
  }

  async run(app: string, name: string, input: unknown): Promise<unknown> {
    const a = await this.action(app, name);
    const args = isRecord(input) ? input : {};
    const { data } = this.deps;
    switch (a.kind) {
      case "list":
        return data.list(app, a.collection, query(args));
      case "count":
        return data.count(app, a.collection, query(args));
      case "get":
        return data.get(app, a.collection, id(args));
      case "insert":
        return data.insert(app, a.collection, args.record);
      case "update":
        return data.update(app, a.collection, id(args), args.patch);
      case "delete":
        return data.remove(app, a.collection, id(args));
    }
  }

  /** Another app calls this app: only actions it provides, and only calls the user approved. */
  async callFrom(caller: string, app: string, name: string, input: unknown): Promise<unknown> {
    const granted = await this.deps.grantedCalls(caller);
    if (!granted?.includes(`${app}.${name}`))
      throw new ActionError(`${caller} may not call ${app}.${name} (not approved for it)`);
    if (!(await this.deps.contract(app)).provides.includes(name))
      throw new ActionError(`${app} does not offer "${name}" to other apps`);
    return this.run(app, name, input);
  }

  /** The app's actions as tools for agents in its chat; deleting asks the user first. */
  async tools(
    app: string,
    ctx: { handle: string; chatId: string; topicId?: string | null },
  ): Promise<AgentTool[]> {
    const contract = await this.deps.contract(app).catch(() => null);
    if (!contract) return [];
    return Object.entries(contract.actions).map(([name, a]): AgentTool => {
      const spec = contract.collections[a.collection];
      const fields = Object.entries(spec?.fields ?? {})
        .map(([f, t]) => `${f}: ${t.type}${t.optional ? "?" : ""}`)
        .join(", ");
      return {
        name: `app_${name}`,
        description: `${a.description} (${a.kind} in ${app}'s ${a.collection}${fields ? `; fields: ${fields}` : ""})`,
        inputSchema: schemaFor(a),
        handler: async (input: Record<string, unknown>) => {
          try {
            if (a.kind === "delete") {
              await this.deps.approvals.request({
                kind: "app_data_delete",
                requestedBy: ctx.handle,
                chatId: ctx.chatId,
                topicId: ctx.topicId ?? null,
                title: `Delete a ${a.collection} record from ${app}`,
                why: typeof input.why === "string" ? input.why : "",
                preview: `\`\`\`json\n${JSON.stringify(await this.deps.data.get(app, a.collection, id(input)), null, 2)}\n\`\`\``,
                payload: { app, action: name, id: id(input) },
              });
              return { text: "Approval requested: the record is deleted when the user approves." };
            }
            return { text: JSON.stringify(await this.run(app, name, input), null, 2) };
          } catch (error) {
            return { text: `Error: ${errorMessage(error)}`, isError: true };
          }
        },
      };
    });
  }
}

function schemaFor(a: Action): ZodRawShape {
  const where = z.record(z.string(), z.unknown()).optional().describe("fields that must be equal");
  switch (a.kind) {
    case "list":
      return {
        where,
        search: z.string().optional().describe("text to look for"),
        sort: z.string().optional().describe("field, or -field for descending"),
        limit: z.number().optional(),
      };
    case "count":
      return { where, search: z.string().optional() };
    case "get":
      return { id: z.string() };
    case "insert":
      return { record: z.record(z.string(), z.unknown()).describe("the new record's fields") };
    case "update":
      return {
        id: z.string(),
        patch: z.record(z.string(), z.unknown()).describe("fields to change"),
      };
    case "delete":
      return { id: z.string(), why: z.string().optional() };
  }
}
