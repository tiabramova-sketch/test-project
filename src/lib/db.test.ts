import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_STORIES } from '../data/sampleStories';
import type { StoryDraft } from '../types';
import {
  addSampleStories,
  clearAllData,
  closeDb,
  createStory,
  deleteAttempt,
  deleteStory,
  getRecording,
  getStory,
  listAttempts,
  listStories,
  savePracticeAttempt,
  seedSampleDataIfNeeded,
  updateStory,
  type NewAttempt,
} from './db';
import { StoryValidationError } from './validation';

const draft: StoryDraft = {
  title: 'Test story',
  competency: 'Collaboration',
  headline: 'A fictional headline.',
  situation: 'A fictional situation.',
  task: 'A fictional task.',
  personalActions: ['First action'],
  decisionOrTradeoff: '',
  result: 'A fictional result.',
  followUpQuestions: [],
  usefulPhrases: [],
};

function attempt(storyId: string, startedAt: string): NewAttempt {
  return {
    storyId,
    storyTitle: 'Test story',
    level: 2,
    prompt: 'Tell me about a time…',
    startedAt,
    durationMs: 60_000,
    confidence: 3,
    notes: '',
  };
}

beforeEach(() => {
  // A brand-new, empty in-memory IndexedDB for every test.
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  await closeDb();
});

describe('stories', () => {
  it('creates and reads a story with generated id and timestamps', async () => {
    const now = new Date('2026-01-02T03:04:05.000Z');
    const story = await createStory(draft, now);
    expect(story.id).toBeTruthy();
    expect(story.createdAt).toBe(now.toISOString());
    expect(story.updatedAt).toBe(now.toISOString());
    expect(await getStory(story.id)).toEqual(story);
  });

  it('normalises input before saving', async () => {
    const story = await createStory({ ...draft, title: '  Padded  ', usefulPhrases: ['a', ' '] });
    expect(story.title).toBe('Padded');
    expect(story.usefulPhrases).toEqual(['a']);
  });

  it('refuses to save an invalid story', async () => {
    await expect(createStory({ ...draft, title: '' })).rejects.toBeInstanceOf(StoryValidationError);
    expect(await listStories()).toEqual([]);
  });

  it('updates a story and keeps createdAt', async () => {
    const created = await createStory(draft, new Date('2026-01-01T00:00:00Z'));
    const updated = await updateStory(
      created.id,
      { ...draft, title: 'Renamed' },
      new Date('2026-02-01T00:00:00Z'),
    );
    expect(updated.title).toBe('Renamed');
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBe('2026-02-01T00:00:00.000Z');
    expect((await getStory(created.id))?.title).toBe('Renamed');
  });

  it('fails to update a missing story', async () => {
    await expect(updateStory('missing', draft)).rejects.toThrow(/does not exist/);
  });

  it('lists stories newest first', async () => {
    await createStory({ ...draft, title: 'Older' }, new Date('2026-01-01T00:00:00Z'));
    await createStory({ ...draft, title: 'Newer' }, new Date('2026-03-01T00:00:00Z'));
    expect((await listStories()).map((s) => s.title)).toEqual(['Newer', 'Older']);
  });

  it('deletes a story', async () => {
    const story = await createStory(draft);
    await deleteStory(story.id);
    expect(await getStory(story.id)).toBeUndefined();
  });

  it('persists across connections', async () => {
    const story = await createStory(draft);
    await closeDb();
    expect(await getStory(story.id)).toEqual(story);
  });
});

describe('practice attempts and recordings', () => {
  it('saves an attempt without audio', async () => {
    const saved = await savePracticeAttempt(attempt('s1', '2026-01-01T00:00:00Z'));
    expect(saved.recordingId).toBeNull();
    expect(await listAttempts()).toEqual([saved]);
  });

  it('saves an audio blob alongside the attempt', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    const saved = await savePracticeAttempt(attempt('s1', '2026-01-01T00:00:00Z'), {
      blob,
      mimeType: 'audio/webm',
    });
    expect(saved.recordingId).toBeTruthy();
    const recording = await getRecording(saved.recordingId!);
    expect(recording?.attemptId).toBe(saved.id);
    expect(recording?.mimeType).toBe('audio/webm');
    expect(recording?.blob.size).toBe(4);
  });

  it('stores the session-timer duration on the recording', async () => {
    const saved = await savePracticeAttempt(
      { ...attempt('s1', '2026-01-01T00:00:00Z'), durationMs: 93_250 },
      { blob: new Blob(['x'], { type: 'audio/webm' }), mimeType: 'audio/webm' },
    );
    expect((await getRecording(saved.recordingId!))?.durationMs).toBe(93_250);
    expect((await listAttempts())[0].durationMs).toBe(93_250);
  });

  it('refuses an invalid attempt and saves nothing', async () => {
    await expect(
      savePracticeAttempt({ ...attempt('s1', '2026-01-01T00:00:00Z'), confidence: 9 }, {
        blob: new Blob(['x']),
        mimeType: 'audio/webm',
      }),
    ).rejects.toThrow(/Confidence/);
    await expect(
      savePracticeAttempt({ ...attempt('s1', '2026-01-01T00:00:00Z'), durationMs: Number.NaN }),
    ).rejects.toThrow(/Duration/);
    expect(await listAttempts()).toEqual([]);
  });

  it('filters attempts by story and sorts newest first', async () => {
    await savePracticeAttempt(attempt('s1', '2026-01-01T00:00:00Z'));
    await savePracticeAttempt(attempt('s1', '2026-01-03T00:00:00Z'));
    await savePracticeAttempt(attempt('s2', '2026-01-02T00:00:00Z'));
    const forS1 = await listAttempts('s1');
    expect(forS1.map((a) => a.startedAt)).toEqual(['2026-01-03T00:00:00Z', '2026-01-01T00:00:00Z']);
    expect((await listAttempts()).map((a) => a.storyId)).toEqual(['s1', 's2', 's1']);
  });

  it('deletes an attempt together with its recording', async () => {
    const saved = await savePracticeAttempt(attempt('s1', '2026-01-01T00:00:00Z'), {
      blob: new Blob(['x']),
      mimeType: 'audio/webm',
    });
    await deleteAttempt(saved.id);
    expect(await listAttempts()).toEqual([]);
    expect(await getRecording(saved.recordingId!)).toBeUndefined();
  });

  it('keeps history when the story is deleted', async () => {
    const story = await createStory(draft);
    await savePracticeAttempt(attempt(story.id, '2026-01-01T00:00:00Z'));
    await deleteStory(story.id);
    expect(await listAttempts(story.id)).toHaveLength(1);
  });
});

describe('sample data and clearing', () => {
  it('seeds sample stories only once', async () => {
    expect(await seedSampleDataIfNeeded()).toBe(true);
    expect(await listStories()).toHaveLength(SAMPLE_STORIES.length);
    expect(await seedSampleDataIfNeeded()).toBe(false);
    expect(await listStories()).toHaveLength(SAMPLE_STORIES.length);
  });

  it('does not re-seed after the user deletes the samples', async () => {
    await seedSampleDataIfNeeded();
    for (const story of await listStories()) await deleteStory(story.id);
    await seedSampleDataIfNeeded();
    expect(await listStories()).toEqual([]);
  });

  it('clears every store and does not re-seed afterwards', async () => {
    await seedSampleDataIfNeeded();
    const saved = await savePracticeAttempt(attempt('s1', '2026-01-01T00:00:00Z'), {
      blob: new Blob(['x']),
      mimeType: 'audio/webm',
    });
    await clearAllData({ confirmed: true });
    expect(await listStories()).toEqual([]);
    expect(await listAttempts()).toEqual([]);
    expect(await getRecording(saved.recordingId!)).toBeUndefined();
    expect(await seedSampleDataIfNeeded()).toBe(false);
  });

  it('can re-add sample stories on request', async () => {
    await clearAllData({ confirmed: true });
    await addSampleStories();
    expect(await listStories()).toHaveLength(SAMPLE_STORIES.length);
  });
});
