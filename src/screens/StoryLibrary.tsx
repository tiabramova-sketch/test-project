import { useCallback, useState } from 'react';
import { StoryForm } from '../components/StoryForm';
import { createStory, deleteStory, listStories, updateStory } from '../lib/db';
import { formatDate } from '../lib/progression';
import { useLoader } from '../lib/useLoader';
import type { Navigate } from '../routes';
import { COMPETENCIES, type Story, type StoryDraft } from '../types';

type Editing = { mode: 'new' } | { mode: 'edit'; story: Story } | null;

function toDraft(story: Story): StoryDraft {
  return {
    title: story.title,
    competency: story.competency,
    headline: story.headline,
    situation: story.situation,
    task: story.task,
    personalActions: story.personalActions,
    decisionOrTradeoff: story.decisionOrTradeoff,
    result: story.result,
    followUpQuestions: story.followUpQuestions,
    usefulPhrases: story.usefulPhrases,
  };
}

export function StoryLibrary({ navigate }: { navigate: Navigate }) {
  const { data: stories, error, loading, reload } = useLoader(listStories);
  const [editing, setEditing] = useState<Editing>(null);
  const [filter, setFilter] = useState<string>('All');
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleSave = useCallback(
    async (draft: StoryDraft) => {
      if (editing?.mode === 'edit') await updateStory(editing.story.id, draft);
      else await createStory(draft);
      setEditing(null);
      reload();
    },
    [editing, reload],
  );

  const handleDelete = async (story: Story) => {
    if (!window.confirm(`Delete "${story.title}"? Practice history for it will be kept.`)) return;
    await deleteStory(story.id);
    reload();
  };

  if (editing) {
    return (
      <div className="screen">
        <header className="screen-header">
          <h1>{editing.mode === 'new' ? 'New story' : 'Edit story'}</h1>
        </header>
        <div className="card">
          <StoryForm
            key={editing.mode === 'edit' ? editing.story.id : 'new'}
            initial={editing.mode === 'edit' ? toDraft(editing.story) : undefined}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      </div>
    );
  }

  if (loading) return <p>Loading…</p>;
  if (error || !stories) return <p className="error">Could not load stories: {error}</p>;

  const visible = filter === 'All' ? stories : stories.filter((s) => s.competency === filter);

  return (
    <div className="screen">
      <header className="screen-header with-action">
        <div>
          <h1>Story Library</h1>
          <p className="lead">Your stories, structured as Situation → Task → Actions → Result.</p>
        </div>
        <button className="primary" onClick={() => setEditing({ mode: 'new' })}>
          New story
        </button>
      </header>

      <div className="toolbar">
        <label>
          Competency{' '}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option>All</option>
            {COMPETENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <span className="muted">
          {visible.length} of {stories.length} stories
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="card empty">
          <p>No stories here yet.</p>
        </div>
      ) : (
        <ul className="story-list">
          {visible.map((story) => {
            const open = expanded === story.id;
            return (
              <li key={story.id} className="card story-card">
                <div className="story-card-head">
                  <div>
                    <span className="tag">{story.competency}</span>
                    <h3>{story.title}</h3>
                    <p>{story.headline}</p>
                    <p className="muted small">Updated {formatDate(story.updatedAt)}</p>
                  </div>
                  <div className="actions vertical">
                    <button className="primary" onClick={() => navigate({ name: 'practice', storyId: story.id })}>
                      Practise
                    </button>
                    <button onClick={() => setExpanded(open ? null : story.id)}>{open ? 'Hide' : 'View'}</button>
                    <button onClick={() => setEditing({ mode: 'edit', story })}>Edit</button>
                    <button className="danger" onClick={() => handleDelete(story)}>
                      Delete
                    </button>
                  </div>
                </div>
                {open && (
                  <dl className="story-detail">
                    <dt>Situation</dt>
                    <dd>{story.situation}</dd>
                    <dt>Task</dt>
                    <dd>{story.task}</dd>
                    <dt>Personal actions</dt>
                    <dd>
                      <ul>
                        {story.personalActions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </dd>
                    {story.decisionOrTradeoff && (
                      <>
                        <dt>Decision or trade-off</dt>
                        <dd>{story.decisionOrTradeoff}</dd>
                      </>
                    )}
                    <dt>Result</dt>
                    <dd>{story.result}</dd>
                    {story.followUpQuestions.length > 0 && (
                      <>
                        <dt>Follow-up questions</dt>
                        <dd>
                          <ul>
                            {story.followUpQuestions.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ul>
                        </dd>
                      </>
                    )}
                    {story.usefulPhrases.length > 0 && (
                      <>
                        <dt>Useful phrases</dt>
                        <dd>
                          <ul>
                            {story.usefulPhrases.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </dd>
                      </>
                    )}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
