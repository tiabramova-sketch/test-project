import { COMPETENCIES, SCAFFOLD_LEVELS, type PracticeAttempt, type StoryDraft } from '../types';

export const LIMITS = {
  title: 120,
  headline: 300,
  longText: 2000,
  listItem: 300,
  listItems: 12,
} as const;

export type StoryErrors = Partial<Record<keyof StoryDraft, string>>;

export interface ValidationResult {
  valid: boolean;
  errors: StoryErrors;
}

function checkText(
  value: unknown,
  label: string,
  max: number,
  required: boolean,
): string | undefined {
  if (typeof value !== 'string') return `${label} must be text.`;
  const trimmed = value.trim();
  if (required && trimmed.length === 0) return `${label} is required.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  return undefined;
}

function checkList(value: unknown, label: string, minItems: number): string | undefined {
  if (!Array.isArray(value)) return `${label} must be a list.`;
  const items = value.filter((item) => typeof item === 'string' && item.trim().length > 0);
  if (items.length !== value.length) return `${label} cannot contain empty entries.`;
  if (items.length < minItems) {
    return minItems === 1 ? `Add at least one entry to ${label.toLowerCase()}.` : `Add at least ${minItems} entries to ${label.toLowerCase()}.`;
  }
  if (items.length > LIMITS.listItems) return `${label} can have at most ${LIMITS.listItems} entries.`;
  if (items.some((item: string) => item.trim().length > LIMITS.listItem)) {
    return `Each entry in ${label.toLowerCase()} must be ${LIMITS.listItem} characters or fewer.`;
  }
  return undefined;
}

/** Validates the user-editable part of a story. Pure: never touches storage. */
export function validateStory(draft: unknown): ValidationResult {
  const errors: StoryErrors = {};
  if (typeof draft !== 'object' || draft === null) {
    return { valid: false, errors: { title: 'Story data is missing.' } };
  }
  const d = draft as Record<string, unknown>;

  const set = (key: keyof StoryDraft, message: string | undefined) => {
    if (message) errors[key] = message;
  };

  set('title', checkText(d.title, 'Title', LIMITS.title, true));
  if (!COMPETENCIES.includes(d.competency as never)) {
    errors.competency = 'Choose a competency from the list.';
  }
  set('headline', checkText(d.headline, 'Headline', LIMITS.headline, true));
  set('situation', checkText(d.situation, 'Situation', LIMITS.longText, true));
  set('task', checkText(d.task, 'Task', LIMITS.longText, true));
  set('personalActions', checkList(d.personalActions, 'Personal actions', 1));
  set('decisionOrTradeoff', checkText(d.decisionOrTradeoff, 'Decision or trade-off', LIMITS.longText, false));
  set('result', checkText(d.result, 'Result', LIMITS.longText, true));
  set('followUpQuestions', checkList(d.followUpQuestions, 'Follow-up questions', 0));
  set('usefulPhrases', checkList(d.usefulPhrases, 'Useful phrases', 0));

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Trims every text field and drops blank list entries. */
export function normalizeDraft(draft: StoryDraft): StoryDraft {
  const list = (items: string[]) => items.map((s) => s.trim()).filter((s) => s.length > 0);
  return {
    title: draft.title.trim(),
    competency: draft.competency,
    headline: draft.headline.trim(),
    situation: draft.situation.trim(),
    task: draft.task.trim(),
    personalActions: list(draft.personalActions),
    decisionOrTradeoff: draft.decisionOrTradeoff.trim(),
    result: draft.result.trim(),
    followUpQuestions: list(draft.followUpQuestions),
    usefulPhrases: list(draft.usefulPhrases),
  };
}

export class StoryValidationError extends Error {
  readonly errors: StoryErrors;
  constructor(errors: StoryErrors) {
    super(`Invalid story: ${Object.values(errors).join(' ')}`);
    this.name = 'StoryValidationError';
    this.errors = errors;
  }
}

/** Returns a problem description, or null if the attempt can be saved. */
export function validatePracticeAttempt(
  attempt: Omit<PracticeAttempt, 'id' | 'recordingId'>,
): string | null {
  if (!attempt.storyId) return 'A practice round must belong to a story.';
  if (!SCAFFOLD_LEVELS.some((l) => l.level === attempt.level)) return 'Unknown support level.';
  if (!Number.isFinite(attempt.durationMs) || attempt.durationMs < 0) {
    return 'Duration must be a non-negative number of milliseconds.';
  }
  if (!Number.isInteger(attempt.confidence) || attempt.confidence < 1 || attempt.confidence > 5) {
    return 'Confidence must be a whole number from 1 to 5.';
  }
  if (Number.isNaN(Date.parse(attempt.startedAt))) return 'Start time is not a valid date.';
  return null;
}
