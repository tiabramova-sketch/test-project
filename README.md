# Interview Lab

A private, local-first app for practising behavioural interview stories in
English through **progressively reduced scaffolding**: start by reading the
full story, then practise with an outline, then with cues only, and finally
answer from the question alone.

Everything stays in your browser. See [PRIVACY.md](PRIVACY.md).

## Screens

| Screen | What it does |
| --- | --- |
| **Dashboard** | Counts, the stories to practise next with a suggested support level, and controls for local data (delete all, re-add samples, ask the browser to keep data). |
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
- `src/lib/validation.test.ts` — story validation and normalisation, plus checks
  that the sample data is valid and marked as fictional.
- `src/lib/progression.test.ts` — level suggestions and formatting helpers.

## Project structure

```
src/
  App.tsx                 navigation shell and privacy banner
  types.ts                Story, PracticeAttempt, Recording, scaffold levels
  data/sampleStories.ts   synthetic demonstration stories
  lib/db.ts               IndexedDB storage
  lib/validation.ts       story validation
  lib/progression.ts      level suggestions, prompts, formatting
  lib/useRecorder.ts      MediaRecorder hook
  components/             StoryForm, ScaffoldView, AudioPlayer, PrivacyNotice
  screens/                Dashboard, StoryLibrary, PracticeSession, PracticeHistory
```

## Browser notes

- **Microphone access needs a secure context.** Recording works on
  `http://localhost` and HTTPS, but not when the dev server is opened over a
  LAN IP (`http://192.168.x.x`). You can still practise without recording.
- **Recording formats differ by browser.** Chrome, Edge and Firefox record
  WebM/Opus or Ogg/Opus; Safari records MP4/AAC. A recording may not play in a
  different browser from the one that made it.
- **WebM recordings from Chrome have no duration header**, so the audio player
  may show an unknown length until playback reaches the end. The round's
  length is stored separately and shown in Practice History.
- **Storage can be evicted.** Browsers may clear site data under storage
  pressure, and Safari may delete data for sites you have not visited for a
  while. "Ask browser to keep data" requests persistent storage, but the
  browser may decline. Private/incognito windows discard everything on close.
- **Data is per browser and per origin.** Different browsers, profiles or ports
  (for example `5173` for dev and `4173` for preview) each keep separate data.
- There is no export or backup in this first version.
