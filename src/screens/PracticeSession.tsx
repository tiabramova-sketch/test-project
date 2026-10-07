import { useEffect, useState } from 'react';
import { AudioPlayer } from '../components/AudioPlayer';
import { ScaffoldView } from '../components/ScaffoldView';
import { listAttempts, listStories, savePracticeAttempt } from '../lib/db';
import { formatDuration, PROMPTS, suggestLevel } from '../lib/progression';
import { useLoader } from '../lib/useLoader';
import { getRecordingSupport, useMicrophonePermission, useRecorder } from '../lib/useRecorder';
import type { Navigate } from '../routes';
import { SCAFFOLD_LEVELS, type ScaffoldLevel, type Story } from '../types';

type Phase = 'setup' | 'practising' | 'review' | 'saved';

async function loadPracticeData() {
  const [stories, attempts] = await Promise.all([listStories(), listAttempts()]);
  return { stories, attempts };
}

export function PracticeSession({ navigate, initialStoryId }: { navigate: Navigate; initialStoryId?: string }) {
  const { data, error, loading, reload } = useLoader(loadPracticeData);

  const [storyId, setStoryId] = useState<string | undefined>(initialStoryId);
  const [levelOverride, setLevelOverride] = useState<ScaffoldLevel | null>(null);
  const [phaseState, setPhase] = useState<Phase>('setup');
  const [withAudio, setWithAudio] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [silentElapsed, setSilentElapsed] = useState(0);
  const [silentDurationMs, setSilentDurationMs] = useState(0);
  const [confidence, setConfidence] = useState(3);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showFullStory, setShowFullStory] = useState(false);

  const recorder = useRecorder();
  const recordingSupport = getRecordingSupport();
  const micPermission = useMicrophonePermission();

  // A recorded round moves to review as soon as the recorder has produced its audio.
  const phase: Phase =
    phaseState === 'practising' && withAudio && recorder.status === 'stopped' ? 'review' : phaseState;
  // Both durations come from the session timer, never from the audio file's metadata.
  const durationMs = withAudio ? recorder.durationMs : silentDurationMs;

  // Timer for rounds practised without recording.
  useEffect(() => {
    if (phase !== 'practising' || withAudio || !startedAt) return;
    const timer = window.setInterval(() => setSilentElapsed(Date.now() - startedAt.getTime()), 250);
    return () => window.clearInterval(timer);
  }, [phase, withAudio, startedAt]);

  if (loading) return <p>Loading…</p>;
  if (error || !data) return <p className="error">Could not load your stories: {error}</p>;

  const { stories, attempts } = data;
  if (stories.length === 0) {
    return (
      <div className="screen">
        <header className="screen-header">
          <h1>Practice Session</h1>
        </header>
        <div className="card empty">
          <p>Add a story before you practise.</p>
          <button className="primary" onClick={() => navigate({ name: 'library' })}>
            Go to Story Library
          </button>
        </div>
      </div>
    );
  }

  const story: Story = stories.find((s) => s.id === storyId) ?? stories[0];
  const storyAttempts = attempts.filter((a) => a.storyId === story.id);
  const suggested = suggestLevel(storyAttempts);
  const level = levelOverride ?? suggested;
  const prompt = PROMPTS[story.competency];

  const begin = async (audio: boolean) => {
    setWithAudio(audio);
    setSaveError(null);
    setShowFullStory(false);
    setConfidence(3);
    setNotes('');
    setStartedAt(new Date());
    setSilentElapsed(0);
    if (audio) {
      await recorder.start();
    }
    setPhase('practising');
  };

  const finish = () => {
    if (withAudio) {
      recorder.stop(); // `phase` switches to review once the audio is ready
    } else {
      setSilentDurationMs(startedAt ? Date.now() - startedAt.getTime() : 0);
      setPhase('review');
    }
  };

  /** After a microphone problem, keep going with the same prompt but no audio. */
  const continueWithoutRecording = () => {
    recorder.reset();
    setWithAudio(false);
    setStartedAt(new Date());
    setSilentElapsed(0);
  };

  const discard = () => {
    // Throwing away an answer (and its audio) cannot be undone, so ask first.
    const hasAnswer = phase === 'review' || (phase === 'practising' && recorder.status !== 'error');
    if (hasAnswer) {
      const what = withAudio ? 'this answer and its recording' : 'this answer';
      if (!window.confirm(`Discard ${what}? It will not be saved.`)) return;
    }
    recorder.reset();
    setPhase('setup');
  };

  const save = async () => {
    if (!startedAt) return;
    setSaving(true);
    setSaveError(null);
    try {
      await savePracticeAttempt(
        {
          storyId: story.id,
          storyTitle: story.title,
          level,
          prompt,
          startedAt: startedAt.toISOString(),
          durationMs,
          confidence,
          notes: notes.trim(),
        },
        withAudio && recorder.blob ? { blob: recorder.blob, mimeType: recorder.blob.type } : undefined,
      );
      recorder.reset();
      setLevelOverride(null);
      setPhase('saved');
      reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this round.');
    } finally {
      setSaving(false);
    }
  };

  const elapsed = withAudio ? recorder.elapsedMs : silentElapsed;

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Practice Session</h1>
        <p className="lead">Answer out loud, in English, as if you were in the interview.</p>
      </header>

      {phase === 'setup' && (
        <div className="card">
          <div className="form-grid">
            <label className="field">
              <span className="label">Story</span>
              <select
                value={story.id}
                onChange={(e) => {
                  setStoryId(e.target.value);
                  setLevelOverride(null);
                }}
              >
                {stories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.competency})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Support level</span>
              <select
                value={level}
                onChange={(e) => setLevelOverride(Number(e.target.value) as ScaffoldLevel)}
              >
                {SCAFFOLD_LEVELS.map((l) => (
                  <option key={l.level} value={l.level}>
                    {l.level}. {l.name}
                    {l.level === suggested ? ' (suggested)' : ''}
                  </option>
                ))}
              </select>
              <span className="hint">{SCAFFOLD_LEVELS[level - 1].description}</span>
            </label>
          </div>
          <p className="muted">
            {storyAttempts.length === 0
              ? 'You have not practised this story yet.'
              : `You have practised this story ${storyAttempts.length} time${storyAttempts.length === 1 ? '' : 's'}.`}
          </p>
          <div className="actions">
            <button className="primary" onClick={() => begin(true)} disabled={!recordingSupport.supported}>
              Start and record
            </button>
            <button onClick={() => begin(false)}>Start without recording</button>
          </div>
          {!recordingSupport.supported && (
            <p className="notice">
              {recordingSupport.message} You can still practise without recording.
            </p>
          )}
          {recordingSupport.supported && micPermission === 'denied' && (
            <p className="notice" role="status">
              Microphone access is blocked for this page. To record, click the site settings icon at the
              left of the address bar and set Microphone to &quot;Allow&quot;. You can still practise without
              recording.
            </p>
          )}
          <p className="muted small">Recordings are saved only in this browser and are never uploaded.</p>
        </div>
      )}

      {phase === 'practising' && (
        <div className="practice-layout">
          <div className="card prompt-card">
            <span className="tag">{story.competency}</span>
            <h2 className="prompt">{prompt}</h2>
            <div className="timer" aria-live="off">
              {withAudio && recorder.status === 'recording' && <span className="rec-dot" aria-hidden />}
              {formatDuration(elapsed)}
            </div>
            {withAudio && recorder.status === 'requesting' && <p className="muted">Waiting for microphone permission…</p>}
            {recorder.error && (
              <div className="mic-error" role="alert">
                <p className="error">
                  <strong>{recorder.error.message}</strong>
                </p>
                <p>{recorder.error.help}</p>
              </div>
            )}
            {recorder.warning && (
              <p className="notice" role="status">
                {recorder.warning}
              </p>
            )}
            <div className="actions">
              {recorder.status === 'error' ? (
                <>
                  <button className="primary" onClick={continueWithoutRecording}>
                    Continue without recording
                  </button>
                  <button onClick={() => recorder.start()}>Try again</button>
                  <button onClick={discard}>Back</button>
                </>
              ) : (
                <>
                  <button className="primary" onClick={finish} disabled={withAudio && recorder.status !== 'recording'}>
                    Finish answer
                  </button>
                  <button onClick={discard}>Cancel</button>
                </>
              )}
            </div>
          </div>
          <div className="card">
            <h3>
              Level {level}: {SCAFFOLD_LEVELS[level - 1].name}
            </h3>
            <ScaffoldView story={story} level={level} />
          </div>
        </div>
      )}

      {phase === 'review' && (
        <div className="practice-layout">
          <div className="card">
            <h2>Review your answer</h2>
            <p className="muted">
              {story.title} · level {level} · {formatDuration(durationMs)}
            </p>
            {recorder.blob ? <AudioPlayer blob={recorder.blob} /> : <p className="muted">No recording for this round.</p>}

            <fieldset className="confidence">
              <legend>How confident did you feel?</legend>
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="confidence"
                    value={value}
                    checked={confidence === value}
                    onChange={() => setConfidence(value)}
                  />
                  {value}
                </label>
              ))}
              <span className="hint">1 = I struggled · 5 = I could say it naturally</span>
            </fieldset>

            <label className="field">
              <span className="label">Notes for next time (optional)</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {saveError && <p className="error">{saveError}</p>}
            <div className="actions">
              <button className="primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save round'}
              </button>
              <button className="danger" onClick={discard} disabled={saving}>
                Discard
              </button>
            </div>
          </div>
          <div className="card">
            {story.followUpQuestions.length > 0 && (
              <>
                <h3>Try a follow-up question</h3>
                <ul>
                  {story.followUpQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </>
            )}
            <button className="link" onClick={() => setShowFullStory((v) => !v)}>
              {showFullStory ? 'Hide full story' : 'Check against the full story'}
            </button>
            {showFullStory && <ScaffoldView story={story} level={1} />}
          </div>
        </div>
      )}

      {phase === 'saved' && (
        <div className="card">
          <h2>Round saved</h2>
          <p>
            Next suggested level for this story: <strong>{suggested}. {SCAFFOLD_LEVELS[suggested - 1].name}</strong>
          </p>
          <div className="actions">
            <button className="primary" onClick={() => setPhase('setup')}>
              Practise again
            </button>
            <button onClick={() => navigate({ name: 'history' })}>View history</button>
          </div>
        </div>
      )}
    </div>
  );
}
