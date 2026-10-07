import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error';

const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function isRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * Records microphone audio with the browser's MediaRecorder. Audio stays in
 * memory as a Blob until the caller saves it to IndexedDB; nothing is uploaded.
 */
export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  const releaseMicrophone = useCallback(() => {
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!isRecordingSupported()) {
      setStatus('error');
      setError('Audio recording is not supported in this browser.');
      return;
    }
    setError(null);
    setBlob(null);
    setElapsedMs(0);
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' }));
        setElapsedMs(Date.now() - startedAtRef.current);
        setStatus('stopped');
        releaseMicrophone();
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      startedAtRef.current = Date.now();
      timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
      setStatus('recording');
    } catch (err) {
      releaseMicrophone();
      setStatus('error');
      const name = err instanceof DOMException ? err.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow it in your browser settings, or practise without recording.'
          : name === 'NotFoundError'
            ? 'No microphone was found.'
            : 'Could not start recording.',
      );
    }
  }, [releaseMicrophone]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

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
    setError(null);
    setStatus('idle');
  }, [releaseMicrophone]);

  // Always release the microphone when the component goes away.
  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    releaseMicrophone();
  }, [releaseMicrophone]);

  return { status, error, blob, elapsedMs, start, stop, reset };
}
