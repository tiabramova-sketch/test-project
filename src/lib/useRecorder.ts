import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkRecordingSupport,
  describeMicrophoneError,
  pickMimeType,
  type MicrophoneError,
  type RecordingSupport,
} from './recording';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error';

export function getRecordingSupport(): RecordingSupport {
  return checkRecordingSupport({
    isSecureContext: typeof window === 'undefined' ? undefined : window.isSecureContext,
    hasMediaRecorder: typeof MediaRecorder !== 'undefined',
    hasGetUserMedia: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
  });
}

/**
 * Records microphone audio with the browser's MediaRecorder. Audio stays in
 * memory as a Blob until the caller saves it to IndexedDB; nothing is uploaded.
 *
 * `durationMs` is measured by the session timer (from the moment recording
 * starts to the moment the user stops it), not read from the WebM file.
 */
export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<MicrophoneError | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  const releaseMicrophone = useCallback(() => {
    window.clearInterval(timerRef.current);
    timerRef.current = undefined;
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    // Freeze the duration at the moment the user stops, from our own timer.
    durationRef.current = Date.now() - startedAtRef.current;
    window.clearInterval(timerRef.current);
    timerRef.current = undefined;
    setElapsedMs(durationRef.current);
    recorder.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setWarning(null);
    setBlob(null);
    setElapsedMs(0);
    setDurationMs(0);
    const support = getRecordingSupport();
    if (!support.supported) {
      setStatus('error');
      setError({ kind: 'unknown', message: support.message, help: 'You can still practise without recording.' });
      return;
    }
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType(MediaRecorder.isTypeSupported?.bind(MediaRecorder));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' }));
        setDurationMs(durationRef.current);
        setStatus('stopped');
        releaseMicrophone();
      };
      recorder.onerror = () => {
        setWarning('The recording stopped unexpectedly. Audio captured so far has been kept.');
        stop();
      };
      // The microphone can disappear mid-answer (unplugged, or permission revoked).
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          setWarning('The microphone was disconnected, so recording stopped. Audio captured so far has been kept.');
          stop();
        };
      });
      recorderRef.current = recorder;
      recorder.start(1000);
      startedAtRef.current = Date.now();
      timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
      setStatus('recording');
    } catch (err) {
      releaseMicrophone();
      setStatus('error');
      setError(describeMicrophoneError(err));
    }
  }, [releaseMicrophone, stop]);

  const reset = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    releaseMicrophone();
    setBlob(null);
    setElapsedMs(0);
    setDurationMs(0);
    setError(null);
    setWarning(null);
    setStatus('idle');
  }, [releaseMicrophone]);

  // Always release the microphone when the component goes away.
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      releaseMicrophone();
    },
    [releaseMicrophone],
  );

  return { status, error, warning, blob, elapsedMs, durationMs, start, stop, reset };
}

/**
 * Reports the microphone permission state where the Permissions API supports
 * it (Chromium does), so a blocked microphone can be explained before the
 * user presses record. Returns 'unknown' elsewhere.
 */
export function useMicrophonePermission(): PermissionState | 'unknown' {
  const [state, setState] = useState<PermissionState | 'unknown'>('unknown');
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const update = () => {
      if (status && !cancelled) setState(status.state);
    };
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((result) => {
        status = result;
        update();
        result.addEventListener('change', update);
      })
      .catch(() => undefined); // Not supported in this browser: stay 'unknown'.
    return () => {
      cancelled = true;
      status?.removeEventListener('change', update);
    };
  }, []);
  return state;
}
