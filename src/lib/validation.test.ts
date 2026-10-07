import { describe, expect, it } from 'vitest';
import { SAMPLE_STORIES } from '../data/sampleStories';
import type { StoryDraft } from '../types';
import { LIMITS, normalizeDraft, validatePracticeAttempt, validateStory } from './validation';

function validDraft(overrides: Partial<StoryDraft> = {}): StoryDraft {
  return {
    title: 'A synthetic story',
    competency: 'Ownership',
    headline: 'I fixed a fictional problem.',
    situation: 'A fictional team had a problem.',
    task: 'I needed to fix it.',
    personalActions: ['I did one thing.', 'I did another thing.'],
    decisionOrTradeoff: 'I chose speed over polish.',
    result: 'The problem was fixed.',
    followUpQuestions: ['What would you change?'],
    usefulPhrases: ['The first thing I did was…'],
    ...overrides,
  };
}

describe('validateStory', () => {
  it('accepts a complete story', () => {
    expect(validateStory(validDraft())).toEqual({ valid: true, errors: {} });
  });

  it('rejects non-object input', () => {
    expect(validateStory(null).valid).toBe(false);
    expect(validateStory('story').valid).toBe(false);
  });

  it.each(['title', 'headline', 'situation', 'task', 'result'] as const)(
    'requires %s',
    (field) => {
      const result = validateStory(validDraft({ [field]: '   ' }));
      expect(result.valid).toBe(false);
      expect(result.errors[field]).toMatch(/required/);
    },
  );

  it('allows an empty decision or trade-off', () => {
    expect(validateStory(validDraft({ decisionOrTradeoff: '' })).valid).toBe(true);
  });

  it('rejects an unknown competency', () => {
    const result = validateStory({ ...validDraft(), competency: 'Juggling' });
    expect(result.errors.competency).toBeDefined();
  });

  it('requires at least one personal action', () => {
    const result = validateStory(validDraft({ personalActions: [] }));
    expect(result.errors.personalActions).toMatch(/at least one/);
  });

  it('allows empty follow-up questions and phrases', () => {
    expect(validateStory(validDraft({ followUpQuestions: [], usefulPhrases: [] })).valid).toBe(true);
  });

  it('rejects blank list entries', () => {
    const result = validateStory(validDraft({ usefulPhrases: ['ok', '  '] }));
    expect(result.errors.usefulPhrases).toMatch(/empty/);
  });

  it('rejects lists that are not arrays', () => {
    const result = validateStory({ ...validDraft(), personalActions: 'one thing' });
    expect(result.errors.personalActions).toMatch(/list/);
  });

  it('enforces length limits', () => {
    const result = validateStory(validDraft({ title: 'x'.repeat(LIMITS.title + 1) }));
    expect(result.errors.title).toMatch(/characters or fewer/);
  });

  it('enforces the maximum number of list entries', () => {
    const items = Array.from({ length: LIMITS.listItems + 1 }, (_, i) => `Action ${i}`);
    expect(validateStory(validDraft({ personalActions: items })).errors.personalActions).toBeDefined();
  });

  it('reports several errors at once', () => {
    const result = validateStory(validDraft({ title: '', result: '' }));
    expect(Object.keys(result.errors).sort()).toEqual(['result', 'title']);
  });
});

describe('normalizeDraft', () => {
  it('trims text and removes blank list entries', () => {
    const clean = normalizeDraft(
      validDraft({ title: '  Spaced  ', personalActions: [' one ', '', '   ', 'two'] }),
    );
    expect(clean.title).toBe('Spaced');
    expect(clean.personalActions).toEqual(['one', 'two']);
    expect(validateStory(clean).valid).toBe(true);
  });
});

describe('sample data', () => {
  it('contains only valid stories', () => {
    for (const story of SAMPLE_STORIES) {
      expect(validateStory(story), story.title).toEqual({ valid: true, errors: {} });
    }
  });

  it('is clearly marked as fictional', () => {
    for (const story of SAMPLE_STORIES) {
      expect(story.situation.toLowerCase()).toContain('fictional');
    }
  });
});

describe('validatePracticeAttempt', () => {
  const base = {
    storyId: 's1',
    storyTitle: 'Story',
    level: 2 as const,
    prompt: 'Tell me about…',
    startedAt: '2026-01-01T00:00:00Z',
    durationMs: 1000,
    confidence: 3,
    notes: '',
  };

  it('accepts a valid attempt', () => {
    expect(validatePracticeAttempt(base)).toBeNull();
  });

  it('rejects bad confidence, duration, level and dates', () => {
    expect(validatePracticeAttempt({ ...base, confidence: 0 })).toMatch(/Confidence/);
    expect(validatePracticeAttempt({ ...base, confidence: 2.5 })).toMatch(/Confidence/);
    expect(validatePracticeAttempt({ ...base, durationMs: -1 })).toMatch(/Duration/);
    expect(validatePracticeAttempt({ ...base, durationMs: Infinity })).toMatch(/Duration/);
    expect(validatePracticeAttempt({ ...base, level: 7 as never })).toMatch(/level/);
    expect(validatePracticeAttempt({ ...base, startedAt: 'yesterday' })).toMatch(/date/);
    expect(validatePracticeAttempt({ ...base, storyId: '' })).toMatch(/story/);
  });
});
