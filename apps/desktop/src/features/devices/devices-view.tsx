import { Bell, Laptop, Smartphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { api, call, forgetPairing, IS_REMOTE } from "@/lib/api";
import { enableNotifications } from "./push";

type Device = {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  push: boolean;
};

/** Pair phones with this desktop, list and revoke them; on a phone: notifications and unpairing. */
export function DevicesView() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [pairing, setPairing] = useState<{
    code: string;
    expiresAt: string;
    urls: string[];
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => setDevices(await call(() => api.devices.get())), []);
  useEffect(() => {
    void load().catch(reportError);
  }, [load]);

  const startPairing = async () => {
    try {
      setPairing(await call(() => api.devices.pairing.post()));
    } catch (error) {
      reportError(error);
    }
  };

  const notifications = async () => {
    try {
      const result = await enableNotifications();
      setNotice(
        result === "granted"
          ? "Notifications are on."
          : result === "denied"
            ? "Notifications were blocked."
            : "Not supported here.",
      );
      await load();
    } catch (error) {
      reportError(error);
      setNotice(error instanceof Error ? error.message : "Could not enable notifications");
    }
  };

  return (
    <section className="min-w-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Devices" icon={<Smartphone className="text-primary size-7" />}>
          Your phone connects to this computer's Aura server. Start the server with{" "}
          <code>AURA_REMOTE=1</code> so it is reachable on your network, then pair the phone with a
          one-time code.
        </PageHeader>

        <div className="mb-6 flex flex-wrap gap-2">
          {!IS_REMOTE && (
            <Button onClick={() => void startPairing()}>
              <Smartphone /> Pair a device
            </Button>
          )}
          <Button variant="outline" onClick={() => void notifications()}>
            <Bell /> Enable notifications
          </Button>
          {IS_REMOTE && (
            <Button
              variant="ghost"
              onClick={() => {
                forgetPairing();
                window.location.reload();
              }}
            >
              Unpair this device
            </Button>
          )}
        </div>
        {notice && <p className="mb-4 text-sm">{notice}</p>}

        {pairing && (
          <div className="mb-6 rounded-2xl border p-5">
            <p className="text-muted-foreground text-sm">
              On the phone, open one of these addresses and enter the code:
            </p>
            <p className="my-3 font-mono text-4xl font-semibold tracking-widest">{pairing.code}</p>
            <ul className="text-sm">
              {pairing.urls.length > 0 ? (
                pairing.urls.map((url) => (
                  <li key={url}>
                    <code>{url}</code>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">
                  Remote access is off: start the server with AURA_REMOTE=1.
                </li>
              )}
            </ul>
            <p className="text-muted-foreground mt-2 text-xs">
              The code works once and expires {new Date(pairing.expiresAt).toLocaleTimeString()}.
            </p>
          </div>
        )}

        <ul className="divide-y rounded-2xl border">
          {devices?.length === 0 && (
            <li className="text-muted-foreground p-4 text-sm">No paired devices.</li>
          )}
          {devices?.map((d) => (
            <li key={d.id} className="flex items-center gap-3 p-4 text-sm">
              {/phone|android|iphone/i.test(d.name) ? (
                <Smartphone className="size-4" />
              ) : (
                <Laptop className="size-4" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium">{d.name}</div>
                <div className="text-muted-foreground text-xs">
                  paired {new Date(d.createdAt).toLocaleDateString()} · last seen{" "}
                  {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : "never"}{" "}
                  {d.push && "· push on"}
                </div>
              </div>
              {!IS_REMOTE && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void call(() => api.devices({ deviceId: d.id }).delete())
                      .then(load)
                      .catch(reportError)
                  }
                >
                  <Trash2 /> Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
