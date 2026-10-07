import type { PracticeAttempt, Recording, Story, StoryDraft } from '../types';
import { normalizeDraft, validatePracticeAttempt, validateStory } from './validation';

/**
 * File formats for story exports and full backups. Everything here is pure:
 * it builds and checks file contents in memory and never touches storage or
 * the network. Imported text is only ever treated as data, never as HTML.
 */

export const STORIES_FORMAT = 'interview-lab-stories';
export const BACKUP_FORMAT = 'interview-lab-backup';
/** Bump when the file layout changes; older readers then refuse the file. */
export const SCHEMA_VERSION = 1;

export const BACKUP_LIMITS = {
  /** Largest file accepted for import or restore. */
  fileBytes: 512 * 1024 * 1024,
  /** Largest single recording accepted in a backup. */
  recordingBytes: 100 * 1024 * 1024,
  idLength: 200,
  storyTitleSnapshot: 500,
  prompt: 2000,
  notes: 20000,
  stories: 5000,
  attempts: 50000,
} as const;

/** Audio formats MediaRecorder produces in current browsers, with optional codec parameters. */
const AUDIO_MIME = /^audio\/(webm|ogg|mp4|mpeg|aac|wav|x-wav)(\s*;\s*codecs="?[a-z0-9.,\s-]+"?)?$/i;

export function isAllowedAudioMime(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 100 && AUDIO_MIME.test(value);
}

// ---------- Small helpers ----------

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isId(value: unknown): value is string {
  // Printable characters only, so ids are safe to show and to use as keys.
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= BACKUP_LIMITS.idLength &&
    /^[\x21-\x7e]+$/.test(value)
  );
}

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));

const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;

/** Date in the local time zone, for file names. */
export function fileDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const storiesFileName = (now: Date) => `interview-lab-stories-${fileDate(now)}.json`;
export const backupFileName = (now: Date) => `interview-lab-backup-${fileDate(now)}.ilbackup.json`;

/** Checks the picked file before reading it. Returns a problem or null. */
export function checkFileBeforeReading(file: { name: string; size: number }): string | null {
  if (!/\.json$/i.test(file.name)) return 'Choose a .json file exported from Interview Lab.';
  if (file.size === 0) return 'The file is empty.';
  if (file.size > BACKUP_LIMITS.fileBytes) {
    return `The file is larger than ${BACKUP_LIMITS.fileBytes / 1024 / 1024} MB and cannot be read.`;
  }
  return null;
}

function parseJson(text: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: 'The file is not valid JSON. It may be damaged or incomplete.' };
  }
}

/** Checks the envelope shared by both formats. */
function checkEnvelope(value: unknown, format: string): string | null {
  if (!isObject(value)) return 'The file does not contain Interview Lab data.';
  if (value.format !== format) {
    if (value.format === BACKUP_FORMAT) return 'This is a full backup. Use "Restore full backup" instead.';
    if (value.format === STORIES_FORMAT) return 'This is a stories export. Use "Import stories" instead.';
    return 'The file is not an Interview Lab file.';
  }
  if (typeof value.schemaVersion !== 'number' || !Number.isInteger(value.schemaVersion)) {
    return 'The file has no schema version.';
  }
  if (value.schemaVersion > SCHEMA_VERSION) {
    return `The file uses schema version ${value.schemaVersion}, which is newer than this app supports (${SCHEMA_VERSION}). Update Interview Lab and try again.`;
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    return `Schema version ${value.schemaVersion} is not supported.`;
  }
  if (!isDate(value.exportedAt)) return 'The file has no valid export date.';
  return null;
}

// ---------- Base64 ----------

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Strict decoder: returns null for anything that is not canonical base64. */
export function base64ToBytes(text: string): Uint8Array | null {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------- Records ----------

const STORY_FIELDS: (keyof StoryDraft)[] = [
  'title',
  'competency',
  'headline',
  'situation',
  'task',
  'personalActions',
  'decisionOrTradeoff',
  'result',
  'followUpQuestions',
  'usefulPhrases',
];

/** Validates one stored story. Unknown fields are dropped. */
export function validateStoryRecord(raw: unknown): { story: Story } | { errors: string[] } {
  if (!isObject(raw)) return { errors: ['Entry is not a story object.'] };
  const errors: string[] = [];
  if (!isId(raw.id)) errors.push('Story id is missing or invalid.');
  if (!isDate(raw.createdAt)) errors.push('Created date is missing or invalid.');
  if (!isDate(raw.updatedAt)) errors.push('Updated date is missing or invalid.');
  const { valid, errors: fieldErrors } = validateStory(raw);
  if (!valid) errors.push(...Object.values(fieldErrors));
  if (errors.length > 0) return { errors };
  const draft = Object.fromEntries(STORY_FIELDS.map((key) => [key, raw[key]])) as unknown as StoryDraft;
  return {
    story: {
      ...normalizeDraft(draft),
      id: raw.id as string,
      createdAt: raw.createdAt as string,
      updatedAt: raw.updatedAt as string,
    },
  };
}

export function validateAttemptRecord(raw: unknown): { attempt: PracticeAttempt } | { error: string } {
  if (!isObject(raw)) return { error: 'Entry is not a practice round object.' };
  if (!isId(raw.id)) return { error: 'Practice round id is missing or invalid.' };
  if (!isId(raw.storyId)) return { error: 'Story reference is missing or invalid.' };
  if (!isText(raw.storyTitle, BACKUP_LIMITS.storyTitleSnapshot)) return { error: 'Story title must be text.' };
  if (!isText(raw.prompt, BACKUP_LIMITS.prompt)) return { error: 'Prompt must be text.' };
  if (!isText(raw.notes, BACKUP_LIMITS.notes)) {
    return { error: `Notes must be text of at most ${BACKUP_LIMITS.notes} characters.` };
  }
  if (raw.recordingId !== null && !isId(raw.recordingId)) return { error: 'Recording reference is invalid.' };
  if (typeof raw.level !== 'number' || typeof raw.durationMs !== 'number' || typeof raw.confidence !== 'number') {
    return { error: 'Level, duration and confidence must be numbers.' };
  }
  if (typeof raw.startedAt !== 'string') return { error: 'Start time is not a valid date.' };
  const attempt: PracticeAttempt = {
    id: raw.id,
    storyId: raw.storyId,
    storyTitle: raw.storyTitle,
    level: raw.level as PracticeAttempt['level'],
    prompt: raw.prompt,
    startedAt: raw.startedAt,
    durationMs: raw.durationMs,
    confidence: raw.confidence,
    notes: raw.notes,
    recordingId: raw.recordingId as string | null,
  };
  const problem = validatePracticeAttempt(attempt);
  return problem ? { error: problem } : { attempt };
}

/** Validates recording metadata and decodes its audio into a Blob. */
export function validateRecordingRecord(raw: unknown): { recording: Recording } | { error: string } {
  if (!isObject(raw)) return { error: 'Entry is not a recording object.' };
  if (!isId(raw.id)) return { error: 'Recording id is missing or invalid.' };
  if (!isId(raw.attemptId)) return { error: 'Practice round reference is missing or invalid.' };
  if (!isAllowedAudioMime(raw.mimeType)) return { error: 'Audio format is not supported.' };
  if (typeof raw.durationMs !== 'number' || !Number.isFinite(raw.durationMs) || raw.durationMs < 0) {
    return { error: 'Duration must be a non-negative number.' };
  }
  if (!isDate(raw.createdAt)) return { error: 'Created date is missing or invalid.' };
  if (typeof raw.size !== 'number' || !Number.isInteger(raw.size) || raw.size < 0) {
    return { error: 'Recording size is missing or invalid.' };
  }
  if (raw.size > BACKUP_LIMITS.recordingBytes) {
    return { error: `Recording is larger than ${BACKUP_LIMITS.recordingBytes / 1024 / 1024} MB.` };
  }
  if (typeof raw.data !== 'string') return { error: 'Audio data is missing.' };
  // Cheap length check before decoding, so an oversized field is never decoded.
  if (raw.data.length !== Math.ceil(raw.size / 3) * 4) return { error: 'Audio data does not match the recorded size.' };
  const bytes = base64ToBytes(raw.data);
  if (!bytes) return { error: 'Audio data is damaged.' };
  if (bytes.length !== raw.size) return { error: 'Audio data does not match the recorded size.' };
  return {
    recording: {
      id: raw.id,
      attemptId: raw.attemptId,
      mimeType: raw.mimeType,
      blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: raw.mimeType }),
      durationMs: raw.durationMs,
      createdAt: raw.createdAt,
    },
  };
}

// ---------- Stories export / import ----------

/** Lists the stored fields explicitly so nothing unexpected is ever exported. */
const storyToJson = (s: Story) => ({
  id: s.id,
  title: s.title,
  competency: s.competency,
  headline: s.headline,
  situation: s.situation,
  task: s.task,
  personalActions: s.personalActions,
  decisionOrTradeoff: s.decisionOrTradeoff,
  result: s.result,
  followUpQuestions: s.followUpQuestions,
  usefulPhrases: s.usefulPhrases,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

export function serializeStories(stories: Story[], now = new Date()): string {
  const file = {
    format: STORIES_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    stories: stories.map(storyToJson),
  };
  return JSON.stringify(file, null, 2) + '\n';
}

export interface InvalidStory {
  /** 1-based position in the file. */
  position: number;
  title: string | null;
  errors: string[];
}

export interface StoryImportPreview {
  exportedAt: string;
  valid: Story[];
  invalid: InvalidStory[];
  /** Ids of valid stories that already exist in this browser. */
  duplicateIds: string[];
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Parses and validates a stories file without writing anything. */
export function parseStoriesFile(text: string, existingIds: Iterable<string>): ParseResult<StoryImportPreview> {
  const parsed = parseJson(text);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const envelopeError = checkEnvelope(parsed.value, STORIES_FORMAT);
  if (envelopeError) return { ok: false, error: envelopeError };
  const file = parsed.value as Json;
  if (!Array.isArray(file.stories)) return { ok: false, error: 'The file has no list of stories.' };
  if (file.stories.length > BACKUP_LIMITS.stories) {
    return { ok: false, error: `The file has more than ${BACKUP_LIMITS.stories} stories.` };
  }

  const existing = new Set(existingIds);
  const seen = new Set<string>();
  const valid: Story[] = [];
  const invalid: InvalidStory[] = [];
  file.stories.forEach((raw: unknown, index) => {
    const title = isObject(raw) && typeof raw.title === 'string' ? raw.title.slice(0, 120) : null;
    const result = validateStoryRecord(raw);
    if ('errors' in result) {
      invalid.push({ position: index + 1, title, errors: result.errors });
    } else if (seen.has(result.story.id)) {
      invalid.push({ position: index + 1, title, errors: ['Another story in this file has the same id.'] });
    } else {
      seen.add(result.story.id);
      valid.push(result.story);
    }
  });
  return {
    ok: true,
    value: {
      exportedAt: file.exportedAt as string,
      valid,
      invalid,
      duplicateIds: valid.filter((s) => existing.has(s.id)).map((s) => s.id),
    },
  };
}

// ---------- Full backup ----------

export interface BackupSnapshot {
  stories: Story[];
  attempts: PracticeAttempt[];
  recordings: Recording[];
}

/** Builds the backup file text. Audio is embedded as base64. */
export async function serializeBackup(snapshot: BackupSnapshot, now = new Date()): Promise<string> {
  const recordings = [];
  for (const r of snapshot.recordings) {
    const bytes = new Uint8Array(await r.blob.arrayBuffer());
    recordings.push({
      id: r.id,
      attemptId: r.attemptId,
      mimeType: r.mimeType,
      durationMs: r.durationMs,
      createdAt: r.createdAt,
      size: bytes.length,
      data: bytesToBase64(bytes),
    });
  }
  const file = {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    app: 'Interview Lab',
    stories: snapshot.stories.map(storyToJson),
    attempts: snapshot.attempts.map((a) => ({
      id: a.id,
      storyId: a.storyId,
      storyTitle: a.storyTitle,
      level: a.level,
      prompt: a.prompt,
      startedAt: a.startedAt,
      durationMs: a.durationMs,
      confidence: a.confidence,
      notes: a.notes,
      recordingId: a.recordingId,
    })),
    recordings,
  };
  return JSON.stringify(file, null, 2) + '\n';
}

export interface ValidatedBackup extends BackupSnapshot {
  exportedAt: string;
  audioBytes: number;
  warnings: string[];
}

/**
 * Parses and fully validates a backup file, including relationships between
 * practice rounds and recordings. Any problem rejects the whole file, so a
 * restore is all or nothing.
 */
export function parseBackupFile(text: string): { ok: true; value: ValidatedBackup } | { ok: false; errors: string[] } {
  const fail = (...errors: string[]) => ({ ok: false as const, errors });
  const parsed = parseJson(text);
  if ('error' in parsed) return fail(parsed.error);
  const envelopeError = checkEnvelope(parsed.value, BACKUP_FORMAT);
  if (envelopeError) return fail(envelopeError);
  const file = parsed.value as Json;
  if (!Array.isArray(file.stories) || !Array.isArray(file.attempts) || !Array.isArray(file.recordings)) {
    return fail('The backup is missing its stories, practice rounds or recordings.');
  }
  if (file.stories.length > BACKUP_LIMITS.stories || file.attempts.length > BACKUP_LIMITS.attempts) {
    return fail('The backup has more entries than this app supports.');
  }
  if (file.recordings.length > file.attempts.length) return fail('The backup has more recordings than practice rounds.');

  const errors: string[] = [];
  const MAX_REPORTED = 20;
  const report = (message: string) => {
    if (errors.length < MAX_REPORTED) errors.push(message);
  };

  const stories: Story[] = [];
  const storyIds = new Set<string>();
  file.stories.forEach((raw: unknown, i) => {
    const result = validateStoryRecord(raw);
    if ('errors' in result) return report(`Story ${i + 1}: ${result.errors.join(' ')}`);
    if (storyIds.has(result.story.id)) return report(`Story ${i + 1}: duplicate id.`);
    storyIds.add(result.story.id);
    stories.push(result.story);
  });

  const attempts: PracticeAttempt[] = [];
  const attemptsById = new Map<string, PracticeAttempt>();
  file.attempts.forEach((raw: unknown, i) => {
    const result = validateAttemptRecord(raw);
    if ('error' in result) return report(`Practice round ${i + 1}: ${result.error}`);
    if (attemptsById.has(result.attempt.id)) return report(`Practice round ${i + 1}: duplicate id.`);
    attemptsById.set(result.attempt.id, result.attempt);
    attempts.push(result.attempt);
  });

  // Validate recording metadata first; audio is decoded only if everything else is sound.
  const recordingIds = new Set<string>();
  file.recordings.forEach((raw: unknown, i) => {
    if (!isObject(raw)) return report(`Recording ${i + 1}: entry is not a recording object.`);
    if (!isId(raw.id)) return report(`Recording ${i + 1}: id is missing or invalid.`);
    if (recordingIds.has(raw.id)) return report(`Recording ${i + 1}: duplicate id.`);
    recordingIds.add(raw.id);
    const owner = isId(raw.attemptId) ? attemptsById.get(raw.attemptId) : undefined;
    if (!owner) return report(`Recording ${i + 1}: it does not belong to any practice round in the backup.`);
    if (owner.recordingId !== raw.id) return report(`Recording ${i + 1}: its practice round points to a different recording.`);
  });
  for (const attempt of attempts) {
    if (attempt.recordingId && !recordingIds.has(attempt.recordingId)) {
      report(`Practice round ${attempt.id}: its recording is missing from the backup.`);
    }
  }
  if (errors.length > 0) return fail(...errors);

  const recordings: Recording[] = [];
  let audioBytes = 0;
  file.recordings.forEach((raw: unknown, i) => {
    if (errors.length > 0) return;
    const result = validateRecordingRecord(raw);
    if ('error' in result) return report(`Recording ${i + 1}: ${result.error}`);
    audioBytes += result.recording.blob.size;
    recordings.push(result.recording);
  });
  if (errors.length > 0) return fail(...errors);

  const warnings: string[] = [];
  const orphaned = attempts.filter((a) => !storyIds.has(a.storyId)).length;
  if (orphaned > 0) {
    warnings.push(
      `${orphaned} practice round${orphaned === 1 ? ' belongs' : 's belong'} to stories that were deleted before the backup. ${orphaned === 1 ? 'It' : 'They'} will appear in history only.`,
    );
  }
  const mismatched = recordings.filter((r) => r.durationMs !== attemptsById.get(r.attemptId)?.durationMs).length;
  if (mismatched > 0) warnings.push(`${mismatched} recording duration(s) differ from their practice round.`);

  return {
    ok: true,
    value: { exportedAt: file.exportedAt as string, stories, attempts, recordings, audioBytes, warnings },
  };
}

// ---------- Confirmation ----------

/** Word the user must type to confirm a destructive action. */
export function confirmationMatches(input: string, word: string): boolean {
  return input.trim().toUpperCase() === word.toUpperCase();
}
