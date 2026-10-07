# Privacy

Interview Lab is a **local-first** practice tool. Interview stories and voice
recordings are personal, so the app is built to keep them on your device.

## How the app handles data

- All stories, practice history and audio recordings are stored in your
  browser's **IndexedDB**, on this device only.
- There is **no backend, no account, no cloud sync, no analytics and no
  telemetry**. The app makes no network requests at runtime.
- The production build ships a Content-Security-Policy with
  `connect-src 'none'`, so the page cannot open network connections even by
  mistake.
- No web fonts, CDNs or third-party scripts are loaded.
- Audio is recorded with the browser's `MediaRecorder` API and played back from
  local `blob:` URLs. It is never uploaded.
- Story exports and full backups are generated in the browser and saved as
  files on your device through a local `blob:` URL. Imports and restores read
  a file you pick; they are validated as data and never rendered as HTML.
  No backup is sent anywhere. Backup files are **not encrypted** and contain
  your stories, notes and voice, so keep them somewhere private.
- "Delete all data" on the Dashboard removes every story, round and recording
  from this browser. Clearing site data in your browser does the same.

## What must never be committed to this repository

This repository contains **code and synthetic demonstration data only**.
Never commit:

- Real interview stories, CVs/resumes, cover letters or career history.
- Names of real people (colleagues, managers, interviewers, customers).
- Real employer, client or product names tied to your personal stories.
- Audio recordings of any kind (`*.wav`, `*.webm`, `*.ogg`, `*.mp3`, …).
- Exports or backups of the app's IndexedDB data.
- Screenshots that show real stories.
- Secrets or environment files (`.env`).

The following paths are already in `.gitignore` as a safety net. Keep any
personal material inside them if it has to live in the working copy at all:

```
private-data/
recordings/
exports/
interview-lab-stories-*.json
*.ilbackup.json
*.wav
*.webm
*.ogg
*.mp3
```

`.gitignore` is a safety net, not a guarantee: always check `git status` and
`git diff --staged` before committing.

## Sample data

`src/data/sampleStories.ts` contains invented stories that describe fictional
teams and placeholder organisations (for example "Example Co." and
"Customer A"). They do not describe any real person, employer or event. Keep
it that way when editing them.

## If something private was committed

Deleting the file in a new commit is not enough — it stays in Git history.
Rewrite history (for example with `git filter-repo`), force-push, and treat
anything that was pushed to a remote as exposed.
