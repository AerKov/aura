/** Response of `POST /session/local`: an automatic session for the local owner (ADR 0003). */
export interface LocalSession {
  token: string;
  user: { id: string; name: string };
}

export const SESSION_HEADER = "authorization";
