# Starter patterns - apply on touch

Apply these when already editing the relevant code. Never as a bulk refactor.

- Editing a file over 300 lines: split per the file-size hook's suggestions
  (types / constants / validation / utils).
- Touching a `throw` site: route it through the error registry (`lib/errors.js`).
- Changing a fallible function's signature: consider returning a Result object
  instead of throwing across the panel/background/content boundaries.
- Touching a `chrome.storage` read for config: move it behind `lib/config.js`.
- Adding a long-running operation: make it cancellable and surface progress in the
  panel status line.
- Adding a new message type across extension contexts: register it in one place with
  its request and response shape.
