# 0036: Files in chats and apps, and a viewer with printing

- Status: accepted
- Date: 2026-10-29
- Phase: 37 (follow-up)

## Context

Building a simple CRM, the user needed to show a PDF in a window with a Print button, and could not.
An app's frame is `sandbox="allow-scripts"` under a strict CSP: no `<embed>`, `<iframe>`, popups,
`window.print()` or downloads. There was also no way to bring a file from the computer into a chat
or an app, or to take one out to the computer.

## Decision

- **One file store**, `<data>/files/{chats,apps}/<id>/`, outside git (a PDF is not a diff). A file
  is `<id>__<name>`; names are sanitized, limits are 30 MB a file and 500 MB per chat or app. The
  type is a label from the extension. Files are served only with `nosniff` and a `sandbox` CSP,
  and the client fetches them with the session, so a hostile HTML or SVG file never runs.
- **Chats.** The composer has a paperclip, takes drops and pastes. A file is uploaded to the chat
  (`POST /chats/:id/files`), then the message names it by id (`attachments`); a message may have
  only files. Messages show pictures as thumbnails and other files as a row; a click opens the
  viewer, an arrow saves to the computer.
- **Helpers see the files.** The prompt lists them (`attachments/<id>__<name>`) and the run copies
  them into its working folder under `attachments/`, kept out of a project's git history. In a
  project chat a helper can hand a finished file back with `attach_file` (inside its folder only),
  so a report comes as an attachment the user can open and print.
- **Apps** get a `docs` permission and `ctx.docs`: `pick` (the host opens a window with a button and
  a drop area, so the click is real and the picker always opens), `list`, `put` (text, bytes or
  base64 the app made), `read`, `remove`, `view` (a stored file, or content the app has but does
  not keep), `save`. The frame never touches the network or the disk: the host does the work.
- **The viewer** is the host's modal window: PDFs (pdf.js, the legacy build, drawn on canvases),
  images and text, with Print and Save. Printing draws the pages as pictures into a block that is
  the only thing on paper. pdf.js is used because the Linux web view has no PDF viewer of its own
  and its printing differs across systems; fonts are drawn as shapes so the CSP stays strict
  (`script-src` only gains `wasm-unsafe-eval` for pdf.js's image decoders).
- **Backups.** Uninstalling an app keeps its files in the backup and bringing it back restores
  them; restore points leave files alone. Deleting a chat deletes its files.

## Consequences

- New dependency: `pdfjs-dist` (Apache-2.0, Mozilla), loaded only when a PDF is opened; its fonts
  and decoders are served from `/pdfjs/`.
- The `docs` permission shows on an app's install card like any other.
- Saving to the computer uses a download link; the Tauri desktop shells were not tried here.
