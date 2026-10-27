# Alerts and schedules

## Alerts

Monitoring systems can send alerts to Aura's **Alerts** chat. Open it and press **Connect** to see
your webhook URL and a `curl` example.

```sh
curl -X POST "http://127.0.0.1:4517/hooks/alerts/uptime?token=<your token>" \
  -H 'content-type: application/json' \
  -d '{"title":"DiskAlmostFull","message":"/ is 91% full on build-box","severity":"warning"}'
```

- Generic JSON (`title`, `message`, `severity`), Prometheus Alertmanager and Grafana payloads are
  understood; anything else is shown as raw data.
- The same alert repeating within 10 minutes increases a counter instead of adding new cards.
- **Warning** and **critical** alerts wake the orchestrator. It summarizes, tells you what matters,
  or passes the problem to the right project agent. Alert text is treated as data, never as
  instructions.
- To receive alerts from the internet, expose the server through a tunnel and set `AURA_PUBLIC_URL`
  to the tunnel's URL so Aura shows the right webhook address. The token is required either way.

## Schedules

Ask the orchestrator for something recurring: "every morning at 8, have @news give me a digest of
Bun releases". It proposes a **job** (a cron schedule, an agent, a prompt); you approve it because
every run costs money. Jobs run at most every 10 minutes.

The target chat is your direct chat, a project chat, or the alerts chat (for example a nightly
check that reports there). At the scheduled time a scheduler bot mentions the agent in the target chat, so the usual budgets
and guards apply. The **Schedule** screen (calendar icon) lists jobs with their next run and can
pause, resume or delete them.
