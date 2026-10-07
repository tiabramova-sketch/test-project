import { useState, type FormEvent } from 'react';
import { normalizeDraft, validateStory, type StoryErrors } from '../lib/validation';
import { COMPETENCIES, type Competency, type StoryDraft } from '../types';

interface Props {
  initial?: StoryDraft;
  onSave: (draft: StoryDraft) => Promise<void>;
  onCancel: () => void;
}

const EMPTY: StoryDraft = {
  title: '',
  competency: COMPETENCIES[0],
  headline: '',
  situation: '',
  task: '',
  personalActions: [],
  decisionOrTradeoff: '',
  result: '',
  followUpQuestions: [],
  usefulPhrases: [],
};

type ListField = 'personalActions' | 'followUpQuestions' | 'usefulPhrases';
type TextField = Exclude<keyof StoryDraft, ListField | 'competency'>;

const toLines = (items: string[]) => items.join('\n');
const fromLines = (text: string) => text.split('\n');

export function StoryForm({ initial = EMPTY, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<StoryDraft>(initial);
  // List fields are edited as one entry per line; keep the raw text so typing feels natural.
  const [lists, setLists] = useState<Record<ListField, string>>({
    personalActions: toLines(initial.personalActions),
    followUpQuestions: toLines(initial.followUpQuestions),
    usefulPhrases: toLines(initial.usefulPhrases),
  });
  const [errors, setErrors] = useState<StoryErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setText = (field: TextField, value: string) => setDraft((d) => ({ ...d, [field]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const candidate = normalizeDraft({
      ...draft,
      personalActions: fromLines(lists.personalActions),
      followUpQuestions: fromLines(lists.followUpQuestions),
      usefulPhrases: fromLines(lists.usefulPhrases),
    });
    const result = validateStory(candidate);
    setErrors(result.errors);
    if (!result.valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(candidate);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the story.');
      setSaving(false);
    }
  };

  const textField = (field: TextField, label: string, hint: string, multiline = true) => (
    <label className="field">
      <span className="label">{label}</span>
      <span className="hint">{hint}</span>
      {multiline ? (
        <textarea rows={3} value={draft[field]} onChange={(e) => setText(field, e.target.value)} />
      ) : (
        <input value={draft[field]} onChange={(e) => setText(field, e.target.value)} />
      )}
      {errors[field] && <span className="error">{errors[field]}</span>}
    </label>
  );

  const listField = (field: ListField, label: string, hint: string) => (
    <label className="field">
      <span className="label">{label}</span>
      <span className="hint">{hint} One per line.</span>
      <textarea
        rows={4}
        value={lists[field]}
        onChange={(e) => setLists((l) => ({ ...l, [field]: e.target.value }))}
      />
      {errors[field] && <span className="error">{errors[field]}</span>}
    </label>
  );

  return (
    <form className="story-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        {textField('title', 'Title', 'A short name only you need to recognise.', false)}
        <label className="field">
          <span className="label">Competency</span>
          <span className="hint">The skill this story demonstrates.</span>
          <select
            value={draft.competency}
            onChange={(e) => setDraft((d) => ({ ...d, competency: e.target.value as Competency }))}
          >
            {COMPETENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {errors.competency && <span className="error">{errors.competency}</span>}
        </label>
      </div>
      {textField('headline', 'Headline', 'One sentence that sums up the whole story.')}
      {textField('situation', 'Situation', 'The context, briefly.')}
      {textField('task', 'Task', 'What you needed to achieve.')}
      {listField('personalActions', 'Personal actions', 'What you did yourself — use "I", not "we".')}
      {textField('decisionOrTradeoff', 'Decision or trade-off (optional)', 'A choice you made and what it cost.')}
      {textField('result', 'Result', 'The outcome, with numbers if you have them.')}
      {listField('followUpQuestions', 'Follow-up questions (optional)', 'Questions an interviewer might ask next.')}
      {listField('usefulPhrases', 'Useful phrases (optional)', 'English phrases you want to practise.')}
      <p className="privacy-hint">
        Saved only in this browser. Avoid names of real people, and consider using placeholders
        for employers if you share this device.
      </p>
      {saveError && <p className="error">{saveError}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save story'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
