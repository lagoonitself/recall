# Recall UI redesign spec (Nov 2026)

Every frontend agent reads this whole file before writing code. It is the contract between parallel agents.

## What is wrong today (from screenshots of the running app)

1. **Generic "AI template" look.** Giant Georgia headings for throwaway names ("kjdbff" at 64px), tracked uppercase eyebrows everywhere ("YOUR LIBRARY / COLLECTION"), filler copy ("Your source material, all in one place."), boxed cards inside boxed cards.
2. **Broken proportions.** Topbar content sits in a narrow centered column while the chat page is full-bleed; the chat sidebar starts at the screen edge but the logo does not. Dropzone is a 300px-tall dashed box that dominates the page after files exist.
3. **Unicode glyphs as icons** (▤ ♫ ▶ ≡ ↑ × ⌄ and emoji-like composer icons). They render inconsistently and look cheap.
4. **Library file rows**: empty white thumbnail square, status pill, Preview button and × all float far right with no alignment.
5. **Preview modal shows only page 1 of a PDF as a static image.** No paging, no zoom, no download, no way to see the whole document.
6. **Chat**: raw JSON tool arguments dumped in "Agent activity"; orange boxed `[S1]` citation chips break the reading flow; the user's own message is a big bordered card with a "YOU" label; "RECALL AGENT" label; the "All collections" scope badge duplicates the select box next to it.
7. **Composer**: three icon buttons (photo, file, mic) where photo and file do the same thing; the voice-recorder is unwanted. Send button looks disabled even when it isn't obvious why.
8. **Sources list** at the end is a stack of heavy bordered accordions.

## Direction

A calm, precise research tool — think Linear / Notion / Readwise Reader, not a marketing page. Content first, chrome quiet.

- **Neutral warm paper, ink text, one deep-green accent** used sparingly (primary action, active state, citations). All values are in `tokens.css`. **Never write a raw hex/rgb color, font stack, radius or shadow in feature CSS** — use `var(--…)`. Dark mode works automatically if you follow this.
- **Type**: Geist (UI, 14px default), Geist Mono (code, ids, timestamps when tabular), Newsreader serif ONLY for: the auth page headline, empty-state headlines, and the preview document title. Page titles in the app are Geist 24px semibold, not serif.
- **No uppercase tracked eyebrows.** Use sentence case. No decorative filler copy. Labels must say what things are.
- **Icons**: `lucide-react` only (already installed). 16px in buttons, 14px inline, `strokeWidth={1.75}`. Every icon-only button has an `aria-label` and a native `title` tooltip.
- **Borders over shadows.** 1px `--color-border`. Shadows only for floating layers (menus `--shadow-md`, modals `--shadow-lg`).
- **Spacing** on the 4px scale (`--space-*`). Radii: controls `--radius-sm`, cards `--radius-md`, modals `--radius-lg`.
- **Motion**: 120–200ms, `--ease-out`, opacity/transform only. Enter animations: `fade-in`, `rise-in`, `scale-in` keyframes from base.css. Respect reduced motion (already global).
- **States**: every async view has loading (use `.skeleton` shapes, not "Loading…" text), empty, and error (with a Retry) states. Hover, focus-visible, active and disabled are all designed.
- **Accessibility**: real `<button>`s, visible focus, labels on inputs, `aria-live` for streaming/progress, dialogs trap focus and restore it on close, Escape closes, all text ≥ 4.5:1 contrast.
- **Responsive**: works at 375px wide with no horizontal scroll.

## Shared primitives (base.css — do not edit, just use)

`.btn` + one of `.btn-primary | .btn-secondary | .btn-ghost | .btn-danger`, size `.btn-sm | .btn-lg`, `.btn-icon` for square icon buttons. `.input`. `.badge` + `.badge-success | -warning | -danger | -accent`. `.kbd`. `.spinner`. `.skeleton`. `.visually-hidden`. `.tabular`. `.font-serif`.

Old classes (`.button`, `.primary`, `.secondary`, `.icon-button`, `.eyebrow`, …) live in `legacy-base.css` and will be deleted at integration. **Stop using them in the files you own.**

## File ownership (parallel agents — stay inside yours)

| Agent | Owns (may edit/create) |
|---|---|
| A · Shell + Library | `components/AppShell.tsx`, `pages/Auth.tsx`, `pages/Collections.tsx`, `pages/Collection.tsx`(+test), `components/UploadDropzone.tsx`(+test), `components/GoogleSignIn.tsx`(+test, visual only), `styles/shell.css`, new files under `components/library/` |
| B · Preview | `components/FilePreview.tsx`, `components/viewers/*`, `styles/preview.css`, new files under `components/preview/` |
| C · Chat layout + Composer | `pages/Chat.tsx`, `components/Composer.tsx`(+test), `styles/chat.css`, `styles/composer.css`, new files under `components/chat/` |
| D · Messages | `components/MessageList.tsx`(+test), `components/ActivityLog.tsx`(+test), `components/SourceCard.tsx`(+test), `styles/messages.css`, new files under `components/messages/` |

Integration (Claude) owns `tokens.css`, `base.css`, `legacy-base.css`, `style.css`, `main.tsx`, `lib/*`, `mocks/*`, `shared/`, `server/`. If you need a change there, do not make it — write it in your final report.

## Cross-agent contracts

- `<FilePreview file={LibraryFile} initialPage?={number} onClose={fn} />` (B implements, A and D call it). For PDFs it must show the **whole document** via `api.fileMedia(file.id)`, opened at `initialPage`.
- `api.chunkDocument(chunkId)` → `{ url, fileId }`: the whole original file a cited chunk belongs to (D uses it to open a citation in the full document; B's `PdfViewer` may use it too).
- `api.fileMedia(fileId)` → `{ url }`: signed URL of the original upload.
- `PdfViewer`, `ImageViewer`, `MediaViewer`, `TextViewer` keep their current props (B may add optional props only); D renders them inside source cards.
- Layout: the topbar is `--topbar-height` tall and full-width (A). The chat page fills the viewport below it (C). The chat thread column is `--reading-max` wide (C sets the column, D styles what is inside it).
