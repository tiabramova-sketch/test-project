import { useId, useState, type ReactNode } from 'react';
import { confirmationMatches } from '../lib/backupFormat';

interface Props {
  /** Word the user must type, e.g. "DELETE". */
  word: string;
  actionLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}

/** Inline confirmation for destructive actions: the button stays disabled until the word is typed. */
export function ConfirmPanel({ word, actionLabel, busy = false, onConfirm, onCancel, children }: Props) {
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const ready = confirmationMatches(typed, word);
  return (
    <div className="confirm-panel" role="group" aria-label={actionLabel}>
      {children}
      <label htmlFor={inputId} className="label">
        Type {word} to confirm
      </label>
      <input
        id={inputId}
        value={typed}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setTyped(e.target.value)}
      />
      <div className="actions">
        <button className="danger" disabled={!ready || busy} onClick={onConfirm}>
          {actionLabel}
        </button>
        <button onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
