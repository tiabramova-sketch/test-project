import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Story, StoryDraft } from '../types';
import {
  BACKUP_FORMAT,
  BACKUP_LIMITS,
  backupFileName,
  base64ToBytes,
  bytesToBase64,
  checkFileBeforeReading,
  confirmationMatches,
  isAllowedAudioMime,
  parseBackupFile,
  parseStoriesFile,
  SCHEMA_VERSION,
  serializeBackup,
  serializeStories,
  STORIES_FORMAT,
} from './backupFormat';
import {
  clearAllData,
  closeDb,
  createStory,
  getLastBackupAt,
  getRecording,
  getStory,
  importStories,
  listAttempts,
  listStories,
  readAllData,
  replaceAllData,
  savePracticeAttempt,
  setLastBackupAt,
  type Confirmed,
  type NewAttempt,
} from './db';

// All data below is synthetic.
const draft: StoryDraft = {
  title: 'Synthetic story',
  competency: 'Ownership',
  headline: 'A fictional headline.',
  situation: 'A fictional situation.',
  task: 'A fictional task.',
  personalActions: ['First fictional action', 'Second fictional action'],
  decisionOrTradeoff: 'A fictional trade-off.',
  result: 'A fictional result.',
  followUpQuestions: ['What would you change?'],
  usefulPhrases: ['In short,'],
};

const attemptFor = (story: Story, notes = 'Fictional notes.'): NewAttempt => ({
  storyId: story.id,
  storyTitle: story.title,
  level: 3,
  prompt: 'Tell me about a time you took ownership.',
  startedAt: '2026-05-01T10:00:00.000Z',
  durationMs: 4_321,
  confidence: 4,
  notes,
});

/** A few bytes of fake "audio": not a real recording. */
const fakeAudio = (seed: number) =>
  new Blob([Uint8Array.from({ length: 300 + seed }, (_, i) => (i * 7 + seed) % 256)], { type: 'audio/webm;codecs=opus' });

async function seedData() {
  const story = await createStory(draft, new Date('2026-04-01T00:00:00Z'));
  const other = await createStory({ ...draft, title: 'Second synthetic story' }, new Date('2026-04-02T00:00:00Z'));
  const withAudio = await savePracticeAttempt(attemptFor(story), {
    blob: fakeAudio(1),
    mimeType: 'audio/webm;codecs=opus',
  });
  const withoutAudio = await savePracticeAttempt({ ...attemptFor(other, ''), confidence: 2 });
  return { story, other, withAudio, withoutAudio };
}

const bytesOf = async (blob: Blob) => Array.from(new Uint8Array(await blob.arrayBuffer()));

async function backupJson() {
  return JSON.parse(await serializeBackup(await readAllData(), new Date('2026-06-01T00:00:00Z')));
}

function parseOk(text: string) {
  const result = parseBackupFile(text);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.value;
}

const CONFIRMED: Confirmed = { confirmed: true };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  await closeDb();
});

describe('story export and import', () => {
  it('exports a readable, versioned file', async () => {
    const story = await createStory(draft);
    const text = serializeStories([story], new Date('2026-06-01T12:00:00Z'));
    const file = JSON.parse(text);
    expect(file.format).toBe(STORIES_FORMAT);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(file.exportedAt).toBe('2026-06-01T12:00:00.000Z');
    expect(file.stories).toEqual([story]);
    expect(text).toContain('\n  "stories": [');
  });

  it('round-trips stories into an empty browser', async () => {
    const a = await createStory(draft);
    const b = await createStory({ ...draft, title: 'Another' });
    const text = serializeStories(await listStories());
    await clearAllData(CONFIRMED);

    const result = parseStoriesFile(text, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.valid).toHaveLength(2);
    expect(result.value.invalid).toEqual([]);
    expect(result.value.duplicateIds).toEqual([]);

    expect(await importStories(result.value.valid, 'skip')).toEqual({ added: 2, replaced: 0, skipped: 0 });
    expect(await getStory(a.id)).toEqual(a);
    expect(await getStory(b.id)).toEqual(b);
  });

  it('rejects invalid stories and reports why, without writing anything', async () => {
    const good = await createStory(draft);
    const file = JSON.parse(serializeStories([good]));
    file.stories.push(
      { ...good, id: 'bad-1', title: '' },
      { ...good, id: 'bad-2', competency: 'Juggling' },
      { ...good, id: '', title: 'No id' },
      { ...good, id: 'bad-4', createdAt: 'not a date' },
      'not an object',
      { ...good, title: 'Same id twice' },
    );
    const result = parseStoriesFile(JSON.stringify(file), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.valid.map((s) => s.id)).toEqual([good.id]);
    expect(result.value.invalid.map((i) => i.position)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(result.value.invalid[0].errors.join(' ')).toMatch(/Title is required/);
    expect(result.value.invalid[1].errors.join(' ')).toMatch(/competency/);
    expect(result.value.invalid[2].errors.join(' ')).toMatch(/id/);
    expect(result.value.invalid[3].errors.join(' ')).toMatch(/Created date/);
    expect(result.value.invalid[5].errors.join(' ')).toMatch(/same id/);
    // Parsing never touches storage.
    expect(await listStories()).toEqual([good]);
  });

  it('drops unknown fields and keeps markup as plain text', async () => {
    const story = await createStory(draft);
    const file = JSON.parse(serializeStories([story]));
    file.stories[0].title = '<img src=x onerror="alert(1)">';
    file.stories[0].extra = 'ignored';
    const result = parseStoriesFile(JSON.stringify(file), []);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.valid[0].title).toBe('<img src=x onerror="alert(1)">');
    expect(result.value.valid[0]).not.toHaveProperty('extra');
  });

  it('reports duplicate ids and skips existing stories when asked', async () => {
    const existing = await createStory(draft);
    const file = JSON.parse(serializeStories([existing]));
    file.stories[0].title = 'Edited elsewhere';
    file.stories.push({ ...file.stories[0], id: 'new-story', title: 'Brand new' });

    const result = parseStoriesFile(JSON.stringify(file), (await listStories()).map((s) => s.id));
    if (!result.ok) throw new Error(result.error);
    expect(result.value.duplicateIds).toEqual([existing.id]);

    expect(await importStories(result.value.valid, 'skip')).toEqual({ added: 1, replaced: 0, skipped: 1 });
    expect((await getStory(existing.id))?.title).toBe(draft.title);
    expect((await getStory('new-story'))?.title).toBe('Brand new');
  });

  it('replaces existing stories only when asked', async () => {
    const existing = await createStory(draft);
    const file = JSON.parse(serializeStories([existing]));
    file.stories[0].title = 'Edited elsewhere';
    const result = parseStoriesFile(JSON.stringify(file), [existing.id]);
    if (!result.ok) throw new Error(result.error);
    expect(await importStories(result.value.valid, 'replace')).toEqual({ added: 0, replaced: 1, skipped: 0 });
    expect((await getStory(existing.id))?.title).toBe('Edited elsewhere');
  });

  it('refuses to import without an explicit duplicate choice', async () => {
    const existing = await createStory(draft);
    await expect(importStories([{ ...existing, title: 'Overwrite?' }], undefined as never)).rejects.toThrow(
      /skip or replace/,
    );
    expect((await getStory(existing.id))?.title).toBe(draft.title);
  });

  it('rejects files that are not story exports', async () => {
    const expectError = (text: string, pattern: RegExp) => {
      const result = parseStoriesFile(text, []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(pattern);
    };
    expectError('{"format": "interview-lab-stories", "schemaVersion": 1, "export', /not valid JSON/);
    expectError('[]', /does not contain/);
    expectError(JSON.stringify({ format: 'something-else' }), /not an Interview Lab file/);
    expectError(JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 1 }), /Restore full backup/);
    expectError(
      JSON.stringify({ format: STORIES_FORMAT, schemaVersion: 99, exportedAt: '2026-01-01T00:00:00Z', stories: [] }),
      /newer than this app supports/,
    );
    expectError(
      JSON.stringify({ format: STORIES_FORMAT, schemaVersion: 0, exportedAt: '2026-01-01T00:00:00Z', stories: [] }),
      /not supported/,
    );
    expectError(JSON.stringify({ format: STORIES_FORMAT, schemaVersion: 1, exportedAt: '2026-01-01' }), /list of stories/);
  });
});

describe('full backup and restore', () => {
  it('writes a versioned file with every store', async () => {
    await seedData();
    const file = await backupJson();
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(file.exportedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(file.stories).toHaveLength(2);
    expect(file.attempts).toHaveLength(2);
    expect(file.recordings).toHaveLength(1);
    expect(file.recordings[0]).toMatchObject({ mimeType: 'audio/webm;codecs=opus', size: 301, durationMs: 4_321 });
    expect(backupFileName(new Date(2026, 5, 1))).toBe('interview-lab-backup-2026-06-01.ilbackup.json');
  });

  it('round-trips stories, attempts, notes, ratings, recordings and audio bytes', async () => {
    const { story, withAudio, withoutAudio } = await seedData();
    const before = await readAllData();
    const originalAudio = await bytesOf(before.recordings[0].blob);
    const text = await serializeBackup(before);

    await clearAllData(CONFIRMED);
    expect(await listStories()).toEqual([]);

    const backup = parseOk(text);
    expect(backup.audioBytes).toBe(301);
    expect(backup.warnings).toEqual([]);
    await replaceAllData(backup, CONFIRMED);

    expect(await getStory(story.id)).toEqual(story);
    const attempts = await listAttempts();
    expect(attempts).toHaveLength(2);
    expect(attempts.find((a) => a.id === withAudio.id)).toEqual(withAudio);
    expect(attempts.find((a) => a.id === withoutAudio.id)).toEqual(withoutAudio);
    expect(attempts.find((a) => a.id === withAudio.id)?.notes).toBe('Fictional notes.');
    expect(attempts.find((a) => a.id === withoutAudio.id)?.confidence).toBe(2);

    const recording = await getRecording(withAudio.recordingId!);
    expect(recording?.attemptId).toBe(withAudio.id);
    expect(recording?.mimeType).toBe('audio/webm;codecs=opus');
    expect(recording?.durationMs).toBe(4_321);
    expect(recording?.blob.type).toBe('audio/webm;codecs=opus');
    expect(await bytesOf(recording!.blob)).toEqual(originalAudio);
  });

  it('preserves every byte value in audio blobs', async () => {
    const all = Uint8Array.from({ length: 256 * 3 + 1 }, (_, i) => i % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(all))!)).toEqual(Array.from(all));
    const story = await createStory(draft);
    const saved = await savePracticeAttempt(attemptFor(story), { blob: new Blob([all]), mimeType: 'audio/ogg' });
    const backup = parseOk(await serializeBackup(await readAllData()));
    await clearAllData(CONFIRMED);
    await replaceAllData(backup, CONFIRMED);
    expect(await bytesOf((await getRecording(saved.recordingId!))!.blob)).toEqual(Array.from(all));
  });

  it('restores into a browser that already has other data, replacing it', async () => {
    await seedData();
    const backup = parseOk(await serializeBackup(await readAllData()));
    await clearAllData(CONFIRMED);
    const unrelated = await createStory({ ...draft, title: 'Created after the backup' });
    await replaceAllData(backup, CONFIRMED);
    expect(await getStory(unrelated.id)).toBeUndefined();
    expect(await listStories()).toHaveLength(2);
  });

  it('keeps history for stories deleted before the backup, with a warning', async () => {
    const story = await createStory(draft);
    await savePracticeAttempt(attemptFor(story));
    const file = await backupJson();
    file.stories = [];
    const backup = parseOk(JSON.stringify(file));
    expect(backup.warnings.join(' ')).toMatch(/1 practice round belongs to stories that were deleted/);
  });

  it('records when the last backup was made', async () => {
    expect(await getLastBackupAt()).toBeNull();
    await setLastBackupAt(new Date('2026-06-01T08:00:00Z'));
    expect(await getLastBackupAt()).toBe('2026-06-01T08:00:00.000Z');
  });
});

describe('backup validation', () => {
  const expectRejected = (text: string, pattern: RegExp) => {
    const result = parseBackupFile(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toMatch(pattern);
  };

  it('rejects unsupported schema versions', async () => {
    await seedData();
    const file = await backupJson();
    expectRejected(JSON.stringify({ ...file, schemaVersion: SCHEMA_VERSION + 1 }), /newer than this app supports/);
    expectRejected(JSON.stringify({ ...file, schemaVersion: '1' }), /no schema version/);
    expectRejected(JSON.stringify({ ...file, schemaVersion: undefined }), /no schema version/);
  });

  it('rejects corrupted and truncated files', async () => {
    await seedData();
    const text = await serializeBackup(await readAllData());
    expectRejected(text.slice(0, Math.floor(text.length / 2)), /not valid JSON/);
    expectRejected('', /not valid JSON/);
    expectRejected('\u0000\u0001binary', /not valid JSON/);
    expectRejected('null', /does not contain/);

    const file = JSON.parse(text);
    expectRejected(JSON.stringify({ ...file, format: STORIES_FORMAT }), /Import stories/);
    expectRejected(JSON.stringify({ ...file, attempts: 'nope' }), /missing/);
    expectRejected(JSON.stringify({ ...file, exportedAt: 'yesterday' }), /export date/);

    const damaged = structuredClone(file);
    damaged.recordings[0].data = damaged.recordings[0].data.replace(/^..../, '!!!!');
    expectRejected(JSON.stringify(damaged), /damaged/);

    const resized = structuredClone(file);
    resized.recordings[0].size += 10;
    expectRejected(JSON.stringify(resized), /does not match the recorded size/);
  });

  it('rejects invalid ids and duplicate ids', async () => {
    await seedData();
    const file = await backupJson();
    const dupStory = structuredClone(file);
    dupStory.stories[1].id = dupStory.stories[0].id;
    expectRejected(JSON.stringify(dupStory), /Story 2: duplicate id/);

    const dupAttempt = structuredClone(file);
    dupAttempt.attempts[1].id = dupAttempt.attempts[0].id;
    expectRejected(JSON.stringify(dupAttempt), /duplicate id/);

    const badId = structuredClone(file);
    badId.attempts[0].id = 'has spaces and\nnewlines';
    expectRejected(JSON.stringify(badId), /id is missing or invalid/);
  });

  it('rejects broken relationships between attempts and recordings', async () => {
    await seedData();
    const file = await backupJson();
    const withAudio = file.attempts.find((a: { recordingId: string | null }) => a.recordingId);

    const missingRecording = structuredClone(file);
    missingRecording.recordings = [];
    expectRejected(JSON.stringify(missingRecording), /recording is missing/);

    const orphanRecording = structuredClone(file);
    orphanRecording.recordings[0].attemptId = 'no-such-round';
    expectRejected(JSON.stringify(orphanRecording), /does not belong to any practice round/);

    const crossed = structuredClone(file);
    const other = crossed.attempts.find((a: { id: string }) => a.id !== withAudio.id);
    crossed.recordings[0].attemptId = other.id;
    expectRejected(JSON.stringify(crossed), /points to a different recording/);
  });

  it('rejects unsupported audio types and oversized recordings', async () => {
    await seedData();
    const file = await backupJson();
    for (const mimeType of ['text/html', 'video/webm', 'audio/webm;<script>', '', 'application/octet-stream']) {
      const bad = structuredClone(file);
      bad.recordings[0].mimeType = mimeType;
      expectRejected(JSON.stringify(bad), /Audio format is not supported/);
    }
    const huge = structuredClone(file);
    huge.recordings[0].size = BACKUP_LIMITS.recordingBytes + 1;
    expectRejected(JSON.stringify(huge), /larger than/);

    expect(isAllowedAudioMime('audio/webm;codecs=opus')).toBe(true);
    expect(isAllowedAudioMime('audio/ogg; codecs="opus"')).toBe(true);
    expect(isAllowedAudioMime('audio/mp4')).toBe(true);
  });

  it('rejects invalid practice round data', async () => {
    await seedData();
    const file = await backupJson();
    const bad = structuredClone(file);
    bad.attempts[0].confidence = 11;
    expectRejected(JSON.stringify(bad), /Confidence/);
    const badNotes = structuredClone(file);
    badNotes.attempts[0].notes = { html: '<b>x</b>' };
    expectRejected(JSON.stringify(badNotes), /Notes must be text/);
  });

  it('checks the file name and size before reading', () => {
    expect(checkFileBeforeReading({ name: 'backup.ilbackup.json', size: 10 })).toBeNull();
    expect(checkFileBeforeReading({ name: 'backup.zip', size: 10 })).toMatch(/\.json/);
    expect(checkFileBeforeReading({ name: 'backup.json', size: 0 })).toMatch(/empty/);
    expect(checkFileBeforeReading({ name: 'backup.json', size: BACKUP_LIMITS.fileBytes + 1 })).toMatch(/larger/);
  });
});

describe('atomic restore', () => {
  it('leaves existing data untouched when a write fails part-way', async () => {
    const { story, withAudio } = await seedData();
    const before = await readAllData();
    const beforeAudio = await bytesOf(before.recordings[0].blob);

    // Bypass validation to force a failure inside the transaction: the second
    // story has the same id as the first, so its add() fails after the stores
    // have already been cleared and the first story written.
    const replacement = {
      stories: [
        { ...story, id: 'restored-1', title: 'Restored' },
        { ...story, id: 'restored-1', title: 'Clash' },
      ],
      attempts: [],
      recordings: [],
    };
    await expect(replaceAllData(replacement, CONFIRMED)).rejects.toBeTruthy();

    const after = await readAllData();
    expect(after.stories).toEqual(before.stories);
    expect(after.attempts).toEqual(before.attempts);
    expect(after.recordings.map((r) => r.id)).toEqual([withAudio.recordingId]);
    expect(await bytesOf(after.recordings[0].blob)).toEqual(beforeAudio);
  });

  it('does not write anything when the backup fails validation', async () => {
    await seedData();
    const before = await readAllData();
    const file = await backupJson();
    file.recordings[0].mimeType = 'text/html';
    expect(parseBackupFile(JSON.stringify(file)).ok).toBe(false);
    expect((await readAllData()).stories).toEqual(before.stories);
  });
});

describe('confirmation requirements', () => {
  it('refuses to restore without explicit confirmation', async () => {
    const { story } = await seedData();
    const backup = parseOk(await serializeBackup({ stories: [], attempts: [], recordings: [] }));
    await expect(replaceAllData(backup, undefined as never)).rejects.toThrow(/explicit confirmation/);
    await expect(replaceAllData(backup, { confirmed: false } as never)).rejects.toThrow(/explicit confirmation/);
    expect(await getStory(story.id)).toEqual(story);
  });

  it('refuses to delete all data without explicit confirmation', async () => {
    const { story } = await seedData();
    await expect(clearAllData(undefined as never)).rejects.toThrow(/explicit confirmation/);
    await expect(clearAllData({} as never)).rejects.toThrow(/explicit confirmation/);
    expect(await getStory(story.id)).toEqual(story);
  });

  it('requires the exact confirmation word', () => {
    expect(confirmationMatches('RESTORE', 'RESTORE')).toBe(true);
    expect(confirmationMatches('  restore ', 'RESTORE')).toBe(true);
    expect(confirmationMatches('', 'RESTORE')).toBe(false);
    expect(confirmationMatches('RESTOR', 'RESTORE')).toBe(false);
    expect(confirmationMatches('yes', 'DELETE')).toBe(false);
  });
});
