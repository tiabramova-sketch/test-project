import { useCallback, useState } from 'react';
import { AudioPlayer } from '../components/AudioPlayer';
import { deleteAttempt, getRecording, listAttempts } from '../lib/db';
import { formatDate, formatDuration } from '../lib/progression';
import { useLoader } from '../lib/useLoader';
import { SCAFFOLD_LEVELS, type PracticeAttempt } from '../types';

function StoredRecording({ recordingId }: { recordingId: string }) {
  const load = useCallback(() => getRecording(recordingId), [recordingId]);
  const { data, loading, error } = useLoader(load);
  if (loading) return <span className="muted">Loading audio…</span>;
  if (error || !data) return <span className="muted">Recording not found.</span>;
  return <AudioPlayer blob={data.blob} />;
}

const loadAllAttempts = () => listAttempts();

export function PracticeHistory() {
  const { data: attempts, error, loading, reload } = useLoader(loadAllAttempts);
  const [playing, setPlaying] = useState<string | null>(null);

  if (loading) return <p>Loading…</p>;
  if (error || !attempts) return <p className="error">Could not load history: {error}</p>;

  const handleDelete = async (attempt: PracticeAttempt) => {
    const what = attempt.recordingId ? 'this round and its recording' : 'this round';
    if (!window.confirm(`Delete ${what}?`)) return;
    await deleteAttempt(attempt.id);
    reload();
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Practice History</h1>
        <p className="lead">Every round you have saved on this device, newest first.</p>
      </header>

      {attempts.length === 0 ? (
        <div className="card empty">
          <p>No practice rounds yet.</p>
        </div>
      ) : (
        <div className="card table-card">
          <table className="history">
            <thead>
              <tr>
                <th>When</th>
                <th>Story</th>
                <th>Level</th>
                <th>Length</th>
                <th>Confidence</th>
                <th>Notes</th>
                <th>Recording</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td data-label="When">{formatDate(a.startedAt)}</td>
                  <td data-label="Story">{a.storyTitle}</td>
                  <td data-label="Level">
                    {a.level}. {SCAFFOLD_LEVELS[a.level - 1]?.name}
                  </td>
                  <td data-label="Length">{formatDuration(a.durationMs)}</td>
                  <td data-label="Confidence">{a.confidence} / 5</td>
                  <td data-label="Notes" className="notes">
                    {a.notes || <span className="muted">—</span>}
                  </td>
                  <td data-label="Recording">
                    {!a.recordingId ? (
                      <span className="muted">None</span>
                    ) : playing === a.id ? (
                      <StoredRecording recordingId={a.recordingId} />
                    ) : (
                      <button onClick={() => setPlaying(a.id)}>Load audio</button>
                    )}
                  </td>
                  <td>
                    <button className="danger" onClick={() => handleDelete(a)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
