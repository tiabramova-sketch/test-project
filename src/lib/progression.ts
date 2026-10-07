import type { Competency, PracticeAttempt, ScaffoldLevel } from '../types';

const MIN_LEVEL: ScaffoldLevel = 1;
const MAX_LEVEL: ScaffoldLevel = 4;

function clampLevel(level: number): ScaffoldLevel {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level)) as ScaffoldLevel;
}

/**
 * Suggests the next scaffolding level from the latest attempt on a story:
 * high confidence removes support, low confidence adds some back.
 * `attempts` must be sorted newest first.
 */
export function suggestLevel(attempts: PracticeAttempt[]): ScaffoldLevel {
  const latest = attempts[0];
  if (!latest) return MIN_LEVEL;
  if (latest.confidence >= 4) return clampLevel(latest.level + 1);
  if (latest.confidence <= 2) return clampLevel(latest.level - 1);
  return latest.level;
}

/** Generic interview prompts per competency (synthetic, not from any real interview). */
export const PROMPTS: Record<Competency, string> = {
  Leadership: 'Tell me about a time you led others without formal authority.',
  Collaboration: 'Describe a time you worked closely with others to reach a shared goal.',
  'Conflict resolution': 'Tell me about a time you disagreed with a colleague. How did you handle it?',
  'Problem solving': 'Describe a difficult problem you solved. How did you approach it?',
  Ownership: 'Tell me about a time you took ownership of something that was going wrong.',
  Communication: 'Describe a time you had to explain something complex to a non-expert.',
  Adaptability: 'Tell me about a time your plans changed suddenly. What did you do?',
  'Customer focus': 'Tell me about a time you handled a difficult customer situation.',
};

/** Shortens text to its first `words` words, for low-scaffold cues. */
export function cue(text: string, words = 8): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= words) return parts.join(' ');
  return `${parts.slice(0, words).join(' ')}…`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
