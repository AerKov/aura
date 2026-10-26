import type { App } from "@crew/server";
import { WS_PATH } from "@crew/shared";
import { treaty } from "@elysiajs/eden";

/** Base URL of the local crew server (the Bun sidecar). */
export const SERVER_URL: string = import.meta.env.VITE_CREW_SERVER_URL ?? "http://127.0.0.1:4517";

export const WS_URL = `${SERVER_URL.replace(/^http/, "ws")}${WS_PATH}`;

/** Typed API client. Types come from the server through Eden Treaty; never hand-write them. */
export const api = treaty<App>(SERVER_URL);
