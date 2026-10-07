/**
 * Pure helpers for microphone recording. Kept free of React and of real
 * browser globals (they are passed in) so they can be unit-tested in Node.
 *
 * MVP decisions: Chromium-based browsers first, WebM/Opus where supported,
 * no audio conversion. Recording length comes from the session timer because
 * WebM files written by MediaRecorder carry no reliable duration metadata.
 */

/** WebM first; if neither is supported the browser's default format is used. */
export const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm'] as const;

export function pickMimeType(isTypeSupported?: (type: string) => boolean): string | undefined {
  if (typeof isTypeSupported !== 'function') return undefined;
  return PREFERRED_MIME_TYPES.find((type) => isTypeSupported(type));
}

export type RecordingSupport =
  | { supported: true }
  | { supported: false; reason: 'insecure-context' | 'no-media-recorder' | 'no-get-user-media'; message: string };

export interface RecordingEnvironment {
  isSecureContext?: boolean;
  hasMediaRecorder: boolean;
  hasGetUserMedia: boolean;
}

export function checkRecordingSupport(env: RecordingEnvironment): RecordingSupport {
  if (env.isSecureContext === false) {
    return {
      supported: false,
      reason: 'insecure-context',
      message:
        'Recording needs a secure page. Open the app at http://localhost (not a network IP address) to use the microphone.',
    };
  }
  if (!env.hasGetUserMedia) {
    return {
      supported: false,
      reason: 'no-get-user-media',
      message: 'This browser does not give web pages access to a microphone.',
    };
  }
  if (!env.hasMediaRecorder) {
    return {
      supported: false,
      reason: 'no-media-recorder',
      message: 'This browser cannot record audio (MediaRecorder is missing). Try a current Chromium-based browser.',
    };
  }
  return { supported: true };
}

export type MicrophoneErrorKind = 'permission-denied' | 'no-device' | 'device-busy' | 'unknown';

export interface MicrophoneError {
  kind: MicrophoneErrorKind;
  message: string;
  /** What the user can do about it. */
  help: string;
}

const CONTINUE_HINT = 'You can still practise this round without recording.';

/** Turns a getUserMedia / MediaRecorder failure into a message for the user. */
export function describeMicrophoneError(error: unknown): MicrophoneError {
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError': // older Chromium name
    case 'SecurityError':
      return {
        kind: 'permission-denied',
        message: 'Microphone access was denied.',
        help:
          'To allow it in Chrome or Edge, click the site settings icon at the left of the address bar, set Microphone to "Allow", then try again. ' +
          CONTINUE_HINT,
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return {
        kind: 'no-device',
        message: 'No microphone was found.',
        help: `Connect a microphone and try again. ${CONTINUE_HINT}`,
      };
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return {
        kind: 'device-busy',
        message: 'The microphone could not be started.',
        help: `Another application may be using it. Close that application and try again. ${CONTINUE_HINT}`,
      };
    default:
      return {
        kind: 'unknown',
        message: 'Recording could not be started.',
        help: CONTINUE_HINT,
      };
  }
}
