import { describe, expect, it } from 'vitest';
import type { PracticeAttempt, ScaffoldLevel } from '../types';
import { cue, formatDuration, suggestLevel } from './progression';

function attempt(level: ScaffoldLevel, confidence: number): PracticeAttempt {
  return {
    id: 'a',
    storyId: 's',
    storyTitle: 'Story',
    level,
    prompt: '',
    startedAt: '2026-01-01T00:00:00Z',
    durationMs: 0,
    confidence,
    notes: '',
    recordingId: null,
  };
}

describe('suggestLevel', () => {
  it('starts with full support', () => {
    expect(suggestLevel([])).toBe(1);
  });
  it('reduces support after a confident attempt', () => {
    expect(suggestLevel([attempt(2, 4)])).toBe(3);
  });
  it('never goes past the last level', () => {
    expect(suggestLevel([attempt(4, 5)])).toBe(4);
  });
  it('adds support after a difficult attempt', () => {
    expect(suggestLevel([attempt(3, 1)])).toBe(2);
    expect(suggestLevel([attempt(1, 1)])).toBe(1);
  });
  it('stays at the same level for a middling attempt', () => {
    expect(suggestLevel([attempt(3, 3), attempt(1, 5)])).toBe(3);
  });
});

describe('helpers', () => {
  it('cue shortens long text', () => {
    expect(cue('one two three four', 2)).toBe('one two…');
    expect(cue('one two', 2)).toBe('one two');
  });
  it('formatDuration renders m:ss', () => {
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
  });
});
