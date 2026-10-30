---
description: "Write a failing test first, then the code; keep tests fast and close to the behavior."
---

- Before you implement a behavior, write a test that fails without it. Run it and see it fail.
- Test behavior through the public interface, not private details.
- Cover the edge cases the brief implies: empty input, invalid input, limits, errors.
- Keep tests fast (seconds, not minutes) and independent of each other and of the network.
- A bug fix starts with a test that reproduces the bug.
- Use the test runner the project already has (for Bun projects: `bun test`).
