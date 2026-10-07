import { describe, expect, it } from 'vitest';
import { checkRecordingSupport, describeMicrophoneError, pickMimeType } from './recording';

describe('pickMimeType', () => {
  it('prefers WebM with Opus', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus');
  });
  it('falls back to plain WebM', () => {
    expect(pickMimeType((t) => t === 'audio/webm')).toBe('audio/webm');
  });
  it('uses the browser default when WebM is unsupported or detection is missing', () => {
    expect(pickMimeType(() => false)).toBeUndefined();
    expect(pickMimeType(undefined)).toBeUndefined();
  });
});

describe('checkRecordingSupport', () => {
  const ok = { isSecureContext: true, hasMediaRecorder: true, hasGetUserMedia: true };
  it('supports a secure context with both APIs', () => {
    expect(checkRecordingSupport(ok)).toEqual({ supported: true });
  });
  it('explains an insecure origin such as a LAN IP', () => {
    const result = checkRecordingSupport({ ...ok, isSecureContext: false });
    expect(result).toMatchObject({ supported: false, reason: 'insecure-context' });
  });
  it('detects missing APIs', () => {
    expect(checkRecordingSupport({ ...ok, hasGetUserMedia: false })).toMatchObject({ reason: 'no-get-user-media' });
    expect(checkRecordingSupport({ ...ok, hasMediaRecorder: false })).toMatchObject({ reason: 'no-media-recorder' });
  });
});

describe('describeMicrophoneError', () => {
  it('explains a denied permission and how to fix it', () => {
    const result = describeMicrophoneError(new DOMException('Permission denied', 'NotAllowedError'));
    expect(result.kind).toBe('permission-denied');
    expect(result.help).toMatch(/Allow/);
    expect(result.help).toMatch(/without recording/);
  });
  it('recognises a missing microphone', () => {
    expect(describeMicrophoneError(new DOMException('', 'NotFoundError')).kind).toBe('no-device');
  });
  it('recognises a busy microphone', () => {
    expect(describeMicrophoneError(new DOMException('', 'NotReadableError')).kind).toBe('device-busy');
  });
  it('handles unknown errors and non-error values', () => {
    expect(describeMicrophoneError(new Error('boom')).kind).toBe('unknown');
    expect(describeMicrophoneError('nope').kind).toBe('unknown');
  });
});
