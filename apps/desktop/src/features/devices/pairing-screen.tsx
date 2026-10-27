import { Smartphone } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SERVER_URL, savePairing } from "@/lib/api";

/** First screen on a phone (or any remote browser): exchange the desktop's code for a device token. */
export function PairingScreen() {
  const [server, setServer] = useState(SERVER_URL);
  const [code, setCode] = useState("");
  const [name, setName] = useState(guessDeviceName());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pair = async () => {
    setBusy(true);
    setError(null);
    try {
      const base = server.replace(/\/+$/, "");
      const response = await fetch(`${base}/devices/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      const body = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!response.ok || !body.token)
        throw new Error(body.error ?? `Pairing failed (${response.status})`);
      savePairing(base, body.token);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        className="bg-card w-full max-w-sm space-y-4 rounded-2xl border p-6 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void pair();
        }}
      >
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Smartphone className="size-5" /> Connect to your desktop
        </div>
        <p className="text-muted-foreground text-sm">
          On your computer open <b>Devices → Pair a device</b> and type the code shown there.
        </p>
        <label className="block text-sm">
          <span className="text-muted-foreground">Server</span>
          <input
            className="bg-background mt-1 w-full rounded-md border px-3 py-2"
            value={server}
            onChange={(e) => setServer(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Code</span>
          <input
            className="bg-background mt-1 w-full rounded-md border px-3 py-2 font-mono tracking-widest uppercase"
            placeholder="XXXX-XXXX"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">This device</span>
          <input
            className="bg-background mt-1 w-full rounded-md border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button
          type="submit"
          className="w-full"
          disabled={busy || code.replace(/\W/g, "").length < 8}
        >
          Pair
        </Button>
      </form>
    </main>
  );
}

function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  return "Browser";
}
