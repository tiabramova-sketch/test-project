import { SAMPLE_STORIES } from '../data/sampleStories';
import type { PracticeAttempt, Recording, Story, StoryDraft } from '../types';
import { createId } from './ids';
import { normalizeDraft, StoryValidationError, validateStory } from './validation';

/**
 * All persistence lives in this browser's IndexedDB. Nothing here performs a
 * network request; data never leaves the device unless the user copies it out.
 */
export const DB_NAME = 'interview-lab';
export const DB_VERSION = 1;

const STORES = {
  stories: 'stories',
  attempts: 'attempts',
  recordings: 'recordings',
  meta: 'meta',
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.stories)) {
        const stories = db.createObjectStore(STORES.stories, { keyPath: 'id' });
        stories.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORES.attempts)) {
        const attempts = db.createObjectStore(STORES.attempts, { keyPath: 'id' });
        attempts.createIndex('storyId', 'storyId');
        attempts.createIndex('startedAt', 'startedAt');
      }
      if (!db.objectStoreNames.contains(STORES.recordings)) {
        db.createObjectStore(STORES.recordings, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let a newer tab upgrade the schema instead of blocking it.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database upgrade blocked by another open tab.'));
  });
}

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabase().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** Closes the cached connection. Used by tests and before deleting the database. */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const pending = dbPromise;
  dbPromise = null;
  try {
    (await pending).close();
  } catch {
    // Opening had failed; nothing to close.
  }
}

/** Runs `work` inside one transaction and resolves once it has committed. */
async function withTransaction<T>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await getDb();
  const tx = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted.'));
  });
  let result: T;
  try {
    result = await work(tx);
  } catch (error) {
    done.catch(() => undefined);
    try {
      tx.abort();
    } catch {
      // Already finished; nothing to roll back.
    }
    throw error;
  }
  await done;
  return result;
}

const byNewest = <T>(key: (item: T) => string) => (a: T, b: T) => key(b).localeCompare(key(a));

// ---------- Stories ----------

export async function listStories(): Promise<Story[]> {
  const stories = await withTransaction([STORES.stories], 'readonly', (tx) =>
    promisify(tx.objectStore(STORES.stories).getAll() as IDBRequest<Story[]>),
  );
  return stories.sort(byNewest((s) => s.updatedAt));
}

export async function getStory(id: string): Promise<Story | undefined> {
  return withTransaction([STORES.stories], 'readonly', (tx) =>
    promisify(tx.objectStore(STORES.stories).get(id) as IDBRequest<Story | undefined>),
  );
}

export async function createStory(draft: StoryDraft, now = new Date()): Promise<Story> {
  const clean = normalizeDraft(draft);
  const { valid, errors } = validateStory(clean);
  if (!valid) throw new StoryValidationError(errors);
  const timestamp = now.toISOString();
  const story: Story = { ...clean, id: createId(), createdAt: timestamp, updatedAt: timestamp };
  await withTransaction([STORES.stories], 'readwrite', (tx) =>
    promisify(tx.objectStore(STORES.stories).add(story)),
  );
  return story;
}

export async function updateStory(id: string, draft: StoryDraft, now = new Date()): Promise<Story> {
  const clean = normalizeDraft(draft);
  const { valid, errors } = validateStory(clean);
  if (!valid) throw new StoryValidationError(errors);
  return withTransaction([STORES.stories], 'readwrite', async (tx) => {
    const store = tx.objectStore(STORES.stories);
    const existing = (await promisify(store.get(id))) as Story | undefined;
    if (!existing) throw new Error(`Story ${id} does not exist.`);
    const story: Story = {
      ...clean,
      id,
      createdAt: existing.createdAt,
      updatedAt: now.toISOString(),
    };
    await promisify(store.put(story));
    return story;
  });
}

/** Deletes a story. Its practice history is kept (it stores a title snapshot). */
export async function deleteStory(id: string): Promise<void> {
  await withTransaction([STORES.stories], 'readwrite', (tx) =>
    promisify(tx.objectStore(STORES.stories).delete(id)),
  );
}

// ---------- Practice attempts and recordings ----------

export type NewAttempt = Omit<PracticeAttempt, 'id' | 'recordingId'>;

/** Saves a practice attempt and, optionally, its audio in a single transaction. */
export async function savePracticeAttempt(
  attempt: NewAttempt,
  audio?: { blob: Blob; mimeType: string },
): Promise<PracticeAttempt> {
  const attemptId = createId();
  const recording: Recording | null = audio
    ? {
        id: createId(),
        attemptId,
        mimeType: audio.mimeType,
        blob: audio.blob,
        createdAt: new Date().toISOString(),
      }
    : null;
  const saved: PracticeAttempt = { ...attempt, id: attemptId, recordingId: recording?.id ?? null };
  await withTransaction([STORES.attempts, STORES.recordings], 'readwrite', async (tx) => {
    await promisify(tx.objectStore(STORES.attempts).add(saved));
    if (recording) await promisify(tx.objectStore(STORES.recordings).add(recording));
  });
  return saved;
}

export async function listAttempts(storyId?: string): Promise<PracticeAttempt[]> {
  const attempts = await withTransaction([STORES.attempts], 'readonly', (tx) => {
    const store = tx.objectStore(STORES.attempts);
    const request = storyId ? store.index('storyId').getAll(storyId) : store.getAll();
    return promisify(request as IDBRequest<PracticeAttempt[]>);
  });
  return attempts.sort(byNewest((a) => a.startedAt));
}

export async function getRecording(id: string): Promise<Recording | undefined> {
  return withTransaction([STORES.recordings], 'readonly', (tx) =>
    promisify(tx.objectStore(STORES.recordings).get(id) as IDBRequest<Recording | undefined>),
  );
}

/** Deletes an attempt together with its recording. */
export async function deleteAttempt(id: string): Promise<void> {
  await withTransaction([STORES.attempts, STORES.recordings], 'readwrite', async (tx) => {
    const attempts = tx.objectStore(STORES.attempts);
    const attempt = (await promisify(attempts.get(id))) as PracticeAttempt | undefined;
    if (!attempt) return;
    if (attempt.recordingId) {
      await promisify(tx.objectStore(STORES.recordings).delete(attempt.recordingId));
    }
    await promisify(attempts.delete(id));
  });
}

// ---------- Sample data and wiping ----------

const SEEDED_KEY = 'sampleDataSeeded';

/**
 * Adds the synthetic sample stories the first time the app runs. Runs once:
 * if the user later deletes the samples they do not come back.
 */
export async function seedSampleDataIfNeeded(now = new Date()): Promise<boolean> {
  return withTransaction([STORES.stories, STORES.meta], 'readwrite', async (tx) => {
    const meta = tx.objectStore(STORES.meta);
    if (await promisify(meta.get(SEEDED_KEY))) return false;
    const stories = tx.objectStore(STORES.stories);
    const timestamp = now.toISOString();
    for (const draft of SAMPLE_STORIES) {
      const story: Story = {
        ...normalizeDraft(draft),
        id: createId(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await promisify(stories.add(story));
    }
    await promisify(meta.put(true, SEEDED_KEY));
    return true;
  });
}

/** Re-adds the sample stories on request, e.g. after clearing all data. */
export async function addSampleStories(): Promise<void> {
  for (const draft of SAMPLE_STORIES) await createStory(draft);
}

/** Removes every story, attempt and recording from this browser. */
export async function clearAllData(): Promise<void> {
  await withTransaction(
    [STORES.stories, STORES.attempts, STORES.recordings, STORES.meta],
    'readwrite',
    async (tx) => {
      await Promise.all([
        promisify(tx.objectStore(STORES.stories).clear()),
        promisify(tx.objectStore(STORES.attempts).clear()),
        promisify(tx.objectStore(STORES.recordings).clear()),
      ]);
      // Keep the "seeded" flag so the samples are not silently re-added.
      await promisify(tx.objectStore(STORES.meta).put(true, SEEDED_KEY));
    },
  );
}
