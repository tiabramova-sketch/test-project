# Interview Lab

A private, local-first app for practising behavioural interview stories in
English through **progressively reduced scaffolding**: start by reading the
full story, then practise with an outline, then with cues only, and finally
answer from the question alone.

Everything stays in your browser. See [PRIVACY.md](PRIVACY.md).

## Screens

| Screen | What it does |
| --- | --- |
| **Dashboard** | Counts, the stories to practise next with a suggested support level, and controls for local data (delete all, re-add samples, ask the browser to keep data) and **Backup and restore**. |
| **Story Library** | Create, view, edit, filter and delete stories (situation, task, personal actions, decision/trade-off, result, follow-up questions, useful phrases). |
| **Practice Session** | Pick a story and a support level (1 Full script → 4 Question only), answer out loud with optional audio recording, then review, rate your confidence and save. |
| **Practice History** | All saved rounds with level, length, confidence, notes and playback of stored recordings. |

After each round the suggested level goes up after a confident round (4–5),
down after a difficult one (1–2), and stays the same otherwise.

## Tech

- Vite, React, TypeScript
- IndexedDB (no wrapper library) for stories, practice rounds and audio blobs
- `MediaRecorder` for audio
- No backend, authentication, external APIs, analytics or runtime network calls

## Setup

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

On first launch the app adds four **synthetic** sample stories. Delete them or
add your own in the Story Library.

## Scripts

```bash
npm run dev        # development server
npm run build      # type-check and production build into dist/
npm run preview    # serve the production build locally
npm run lint       # ESLint
npm test           # unit tests (Vitest, single run)
npm run test:watch # unit tests in watch mode
```

Tests run in Node with [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB),
so they need no browser:

- `src/lib/db.test.ts` — story CRUD, timestamps, practice rounds, audio blobs,
  one-time sample seeding and "delete all data".
- `src/lib/backup.test.ts` — stories export/import round trip, invalid stories,
  duplicate ids (skip/replace), full backup/restore round trip with audio bytes,
  attempt↔recording relationships, unsupported schema versions, corrupted
  files, atomic rollback and confirmation requirements.
- `src/lib/validation.test.ts` — story validation and normalisation, plus checks
  that the sample data is valid and marked as fictional.
- `src/lib/progression.test.ts` — level suggestions and formatting helpers.
- `src/lib/recording.test.ts` — WebM format choice, recording support checks and
  microphone error messages (including permission denied).

## Project structure

```
src/
  App.tsx                 navigation shell and privacy banner
  types.ts                Story, PracticeAttempt, Recording, scaffold levels
  data/sampleStories.ts   synthetic demonstration stories
  lib/db.ts               IndexedDB storage, story import, atomic restore
  lib/backupFormat.ts     export/backup file formats and validation
  lib/download.ts         saves a file from a local blob: URL
  lib/validation.ts       story and practice-round validation
  lib/progression.ts      level suggestions, prompts, formatting
  lib/recording.ts        format choice, support checks, microphone errors
  lib/useRecorder.ts      MediaRecorder hook (timer-based duration)
  components/             StoryForm, ScaffoldView, AudioPlayer, PrivacyNotice,
                          BackupRestore, ConfirmPanel
  screens/                Dashboard, StoryLibrary, PracticeSession, PracticeHistory
```

## Browser support (MVP)

- **Chromium-based browsers first** (Chrome, Edge, Brave, Arc). Other browsers
  may work but are not tested yet.
- **Run on `localhost`.** Use `npm run dev` or `npm run preview` and open the
  `http://localhost:…` address. Browsers only allow microphone access on secure
  origins, so opening the dev server through a LAN IP (`http://192.168.x.x`)
  disables recording. The app explains this and lets you practise without
  recording.
- **WebM recording.** Audio is recorded as `audio/webm;codecs=opus` (or
  `audio/webm`) where supported; otherwise the browser's default format is
  used as-is. There is no cross-browser audio conversion yet, so a recording
  may not play in a different browser from the one that made it.
- **Duration comes from the session timer.** WebM files written by
  `MediaRecorder` have no reliable duration header, so the app measures each
  round from start to stop and stores `durationMs` on both the practice round
  and the recording. The audio player itself may still show an unknown length
  until playback reaches the end.
- **Microphone permission denied.** The app shows what happened, how to
  re-allow the microphone (site settings icon at the left of the address bar →
  Microphone → Allow), and offers *Try again* or *Continue without recording*.
  In Chromium a blocked microphone is detected before you press record. If the
  microphone disconnects mid-answer, the audio captured so far is kept.
- **Storage is separate per origin and port.** IndexedDB data belongs to the
  exact origin: `http://localhost:5173` (dev) and `http://localhost:4173`
  (preview) have separate, independent data, as do different browsers and
  browser profiles. Use the same address every time.
- **Storage can be evicted.** Browsers may clear site data under storage
  pressure. "Ask browser to keep data" on the Dashboard requests persistent
  storage, but the browser may decline. Private/incognito windows discard
  everything on close.

## Backup and restore

The Dashboard's **Backup and restore** section protects your data against
browser storage being cleared. Files are built and read entirely in the
browser; nothing is uploaded.

- **Export stories** saves `interview-lab-stories-YYYY-MM-DD.json`: readable
  JSON with `format`, `schemaVersion` and `exportedAt`.
- **Import stories** validates the file first and shows a preview (valid and
  invalid stories, validation errors, ids that already exist). Nothing is
  written until you press *Import*; you can cancel. If ids already exist you
  must choose **Skip existing** or **Replace existing**.
- **Create full backup** saves `interview-lab-backup-YYYY-MM-DD.ilbackup.json`
  with stories, practice rounds (notes, confidence, duration), recording
  metadata and the audio itself (base64). The date of the last backup made in
  this browser is shown.
- **Restore full backup** checks file type, schema version, structure, ids,
  round↔recording links, audio types and sizes before touching storage, shows
  a preview, and requires typing `RESTORE`. All data is replaced in a single
  IndexedDB transaction: if anything fails, nothing changes.
- **Delete all data** requires typing `DELETE`.

Limits: files up to 512 MB, recordings up to 100 MB each. The whole backup is
held in memory while it is created or read, and base64 makes audio about a
third larger. Backups contain your voice and stories unencrypted — store them
somewhere private.
