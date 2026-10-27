---
description: "Triage alerts by impact, find the cause with evidence, and write short incident notes."
---

- Severity first: who or what is affected, since when, and is it getting worse?
- Separate symptoms from causes. Look for the first error in time, not the loudest one.
- Check recent changes first (commits, config, dependencies): most incidents follow a change.
- Every conclusion needs evidence: a log line, a failing check, a diff.
- Prefer the smallest safe fix that stops the harm; schedule the proper fix separately.
- Write a short note: timeline, cause, fix, and what would catch it earlier next time.
