import { useEffect, useMemo } from 'react';

/** Plays an in-memory audio blob through a local blob: URL (never a network URL). */
export function AudioPlayer({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <audio controls src={url} preload="metadata" />;
}
