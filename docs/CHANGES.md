# Cronos — Changes Summary (2026-05-11)

## iOS Layout Fixes

- Added `apple-mobile-web-app-capable` and `black-translucent` status bar meta tags to `index.html` for proper standalone PWA behavior on iOS.
- Changed `100vh` to `100dvh` in the chat page and chat history so containers respect the iOS dynamic viewport (avoids content hidden behind Safari chrome or home indicator).
- Added safe-area bottom padding to the chat input area so it clears the iPhone home indicator gesture bar.

## Chat — Flash Fix

- Rewrote `use-chat-stream.ts` to optimistically inject both the user message and the completed assistant message into the TanStack Query cache before invalidating. This eliminates the visual flash/refresh that occurred when streaming finished and the query refetched.

## Chat — Stop Button Fix

- `sendMessageStream` in `api.ts` now accepts an optional `AbortSignal` and passes it to `fetch`.
- The `useChatStream` hook wires the abort controller signal through, so the stop button actually cancels the in-flight request.

## Chat — Markdown Rendering

- Assistant messages now render through `markdown-it` using the existing `.prose` CSS styles (headings, code blocks, lists, links, bold/italic).
- User messages remain plain text with `whitespace-pre-wrap`.

## Chat — Copy Button

- Added a copy-to-clipboard button that appears on hover for assistant messages.

## Chat — Prompt Visibility

- Added a visible indicator above the chat input showing the active system prompt name with an ✕ to deselect it (previously only visible inside the gear dropdown).

## Prompt Dialog

- Widened the system prompt management dialog from `max-w-lg` (512px) to `max-w-2xl` (672px) for more comfortable editing.

## Settings

- Settings is a dedicated page (`/settings`) accessible from the sidebar on all devices.
- Font size slider range: 12px–36px (already at max 36px).

## Infrastructure

- Bumped `aws-cdk-lib` from 2.252.0 to 2.253.1.
- Bumped `aws-cdk` CLI from 2.1120.0 to 2.1121.0.

## Tauri Desktop Configuration

- **Identifier:** `com.cronos.wiki`
- **Apple Developer Team ID:** `55JLL7A9HM`
- **Tauri version:** 2.11.0
- **Window:** 1024×768 default, 480×400 minimum, overlay title bar (hidden title)
- **macOS minimum:** 13.0 (Ventura)
- **Frontend:** serves from `../dist`, dev server at `localhost:5173`
- **Bundle targets:** all (macOS `.app`/`.dmg`, Windows `.msi`/`.exe`, Linux `.deb`/`.AppImage`)
- **Capabilities:** `core:default` only (no filesystem, shell, or network permissions beyond webview)
- **Rust edition:** 2021, minimum rustc 1.77.2
