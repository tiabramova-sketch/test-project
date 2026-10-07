export const COMPETENCIES = [
  'Leadership',
  'Collaboration',
  'Conflict resolution',
  'Problem solving',
  'Ownership',
  'Communication',
  'Adaptability',
  'Customer focus',
] as const;

export type Competency = (typeof COMPETENCIES)[number];

export interface Story {
  id: string;
  title: string;
  competency: Competency;
  /** One-sentence summary the user can say at the start of an answer. */
  headline: string;
  situation: string;
  task: string;
  /** What the user personally did, one action per entry. */
  personalActions: string[];
  decisionOrTradeoff: string;
  result: string;
  followUpQuestions: string[];
  usefulPhrases: string[];
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Fields the user edits; id and timestamps are managed by storage. */
export type StoryDraft = Omit<Story, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Scaffolding levels, from most to least support. Each practice round the user
 * can step down a level as the story becomes familiar.
 */
export const SCAFFOLD_LEVELS = [
  { level: 1, name: 'Full script', description: 'Every part of the story is visible.' },
  { level: 2, name: 'Outline', description: 'Headline, short cues for each part, and your actions.' },
  { level: 3, name: 'Cues', description: 'Headline, the story structure and useful phrases.' },
  { level: 4, name: 'Question only', description: 'Answer from memory with no support.' },
] as const;

export type ScaffoldLevel = (typeof SCAFFOLD_LEVELS)[number]['level'];

export interface PracticeAttempt {
  id: string;
  storyId: string;
  /** Snapshot of the story title, so history stays readable if the story is deleted. */
  storyTitle: string;
  level: ScaffoldLevel;
  prompt: string;
  startedAt: string;
  durationMs: number;
  /** Self-assessed confidence, 1 (low) to 5 (high). */
  confidence: number;
  notes: string;
  /** Key of the audio blob in the recordings store, if one was saved. */
  recordingId: string | null;
}

export interface Recording {
  id: string;
  attemptId: string;
  mimeType: string;
  blob: Blob;
  /**
   * Length measured by the session timer. Stored explicitly because WebM files
   * written by MediaRecorder carry no reliable duration metadata.
   */
  durationMs: number;
  createdAt: string;
}
