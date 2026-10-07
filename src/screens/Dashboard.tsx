import { useState } from 'react';
import { addSampleStories, clearAllData, listAttempts, listStories } from '../lib/db';
import { formatDate, suggestLevel } from '../lib/progression';
import { useLoader } from '../lib/useLoader';
import type { Navigate } from '../routes';
import { SCAFFOLD_LEVELS } from '../types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function loadDashboard() {
  const [stories, attempts] = await Promise.all([listStories(), listAttempts()]);
  let usage: number | null;
  try {
    usage = (await navigator.storage?.estimate?.())?.usage ?? null;
  } catch {
    usage = null;
  }
  const weekAgo = Date.now() - WEEK_MS;
  const thisWeek = attempts.filter((a) => new Date(a.startedAt).getTime() >= weekAgo).length;
  return { stories, attempts, usage, thisWeek };
}

export function Dashboard({ navigate }: { navigate: Navigate }) {
  const { data, error, loading, reload } = useLoader(loadDashboard);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return <p>Loading…</p>;
  if (error || !data) return <p className="error">Could not load your data: {error}</p>;

  const { stories, attempts, usage, thisWeek } = data;

  // Least recently practised stories first; never-practised stories lead.
  const next = stories
    .map((story) => {
      const own = attempts.filter((a) => a.storyId === story.id);
      return { story, last: own[0], level: suggestLevel(own) };
    })
    .sort((a, b) => (a.last?.startedAt ?? '').localeCompare(b.last?.startedAt ?? ''))
    .slice(0, 3);

  const handleClear = async () => {
    if (!window.confirm('Delete all stories, practice history and recordings from this browser? This cannot be undone.')) {
      return;
    }
    setBusy(true);
    await clearAllData();
    setBusy(false);
    setMessage('All data has been deleted from this browser.');
    reload();
  };

  const handleAddSamples = async () => {
    setBusy(true);
    await addSampleStories();
    setBusy(false);
    setMessage('Sample stories added.');
    reload();
  };

  const handlePersist = async () => {
    const granted = await navigator.storage?.persist?.();
    setMessage(
      granted
        ? 'The browser will keep your data unless you clear it yourself.'
        : 'The browser did not grant persistent storage. Data may be cleared if the device runs low on space.',
    );
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Dashboard</h1>
        <p className="lead">
          Practise behavioural interview stories in English, with less support each round.
        </p>
      </header>

      <section className="stats">
        <div className="stat">
          <span className="stat-value">{stories.length}</span>
          <span className="stat-label">stories</span>
        </div>
        <div className="stat">
          <span className="stat-value">{attempts.length}</span>
          <span className="stat-label">practice rounds</span>
        </div>
        <div className="stat">
          <span className="stat-value">{thisWeek}</span>
          <span className="stat-label">rounds in the last 7 days</span>
        </div>
      </section>

      <section className="card">
        <h2>Practise next</h2>
        {next.length === 0 ? (
          <p>
            You have no stories yet.{' '}
            <button className="link" onClick={() => navigate({ name: 'library' })}>
              Add your first story
            </button>
            .
          </p>
        ) : (
          <ul className="next-list">
            {next.map(({ story, last, level }) => (
              <li key={story.id}>
                <div>
                  <strong>{story.title}</strong>
                  <span className="muted">
                    {' '}
                    · {story.competency} ·{' '}
                    {last ? `last practised ${formatDate(last.startedAt)}` : 'not practised yet'}
                  </span>
                  <div className="muted">
                    Suggested level: {level} — {SCAFFOLD_LEVELS[level - 1].name}
                  </div>
                </div>
                <button className="primary" onClick={() => navigate({ name: 'practice', storyId: story.id })}>
                  Practise
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>How it works</h2>
        <ol className="levels">
          {SCAFFOLD_LEVELS.map((l) => (
            <li key={l.level}>
              <strong>{l.name}.</strong> {l.description}
            </li>
          ))}
        </ol>
        <p className="muted">
          After each round, rate your confidence. Confident rounds move you to the next level; difficult
          ones add support back.
        </p>
      </section>

      <section className="card data-card">
        <h2>Your data on this device</h2>
        <p>
          Stories, practice history and audio recordings are stored in this browser&apos;s IndexedDB.
          There is no server, account, analytics or cloud backup. Clearing your browser data, or using a
          private window, will remove them.
        </p>
        {usage !== null && <p className="muted">Storage used by this app: about {(usage / 1024 / 1024).toFixed(1)} MB.</p>}
        {message && <p className="notice">{message}</p>}
        <div className="actions">
          <button onClick={handlePersist} disabled={busy}>
            Ask browser to keep data
          </button>
          <button onClick={handleAddSamples} disabled={busy}>
            Add sample stories
          </button>
          <button className="danger" onClick={handleClear} disabled={busy}>
            Delete all data
          </button>
        </div>
      </section>
    </div>
  );
}
