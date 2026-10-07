import { useRef, useState } from 'react';
import {
  backupFileName,
  checkFileBeforeReading,
  parseBackupFile,
  parseStoriesFile,
  serializeBackup,
  serializeStories,
  storiesFileName,
  type StoryImportPreview,
  type ValidatedBackup,
} from '../lib/backupFormat';
import {
  getLastBackupAt,
  importStories,
  listStories,
  readAllData,
  replaceAllData,
  setLastBackupAt,
  type DuplicateMode,
} from '../lib/db';
import { downloadTextFile } from '../lib/download';
import { formatDate } from '../lib/progression';
import { useLoader } from '../lib/useLoader';
import { ConfirmPanel } from './ConfirmPanel';

interface Props {
  /** Current totals, shown in the restore preview so the user sees what will be replaced. */
  current: { stories: number; attempts: number; recordings: number };
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onDataChanged: () => void;
}

type Pending =
  | { kind: 'stories'; fileName: string; preview: StoryImportPreview; mode: DuplicateMode | null }
  | { kind: 'backup'; fileName: string; backup: ValidatedBackup };

type Status = { tone: 'notice' | 'error'; text: string; details?: string[] } | null;

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const fileSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function BackupRestore({ current, busy, setBusy, onDataChanged }: Props) {
  const lastBackup = useLoader(getLastBackupAt);
  const [pending, setPending] = useState<Pending | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const storiesInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  /** Runs an action with the controls disabled and reports unexpected failures. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
    } catch (error) {
      setStatus({ tone: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  /** Reads the picked file as text after basic checks, or reports why it cannot. */
  const readPickedFile = async (input: HTMLInputElement): Promise<{ name: string; text: string } | null> => {
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (!file) return null;
    const problem = checkFileBeforeReading(file);
    if (problem) {
      setStatus({ tone: 'error', text: problem });
      return null;
    }
    return { name: file.name, text: await file.text() };
  };

  const handleExportStories = () =>
    run(async () => {
      const stories = await listStories();
      const now = new Date();
      downloadTextFile(serializeStories(stories, now), storiesFileName(now));
      setStatus({ tone: 'notice', text: `Exported ${plural(stories.length, 'story', 'stories')}.` });
    });

  const handleCreateBackup = () =>
    run(async () => {
      const now = new Date();
      const snapshot = await readAllData();
      downloadTextFile(await serializeBackup(snapshot, now), backupFileName(now));
      await setLastBackupAt(now);
      lastBackup.reload();
      setStatus({
        tone: 'notice',
        text: `Backup created with ${plural(snapshot.stories.length, 'story', 'stories')}, ${plural(snapshot.attempts.length, 'practice round')} and ${plural(snapshot.recordings.length, 'recording')}. Keep the file somewhere safe: it contains your personal stories and voice.`,
      });
    });

  const handleStoriesPicked = () =>
    run(async () => {
      setPending(null);
      const file = await readPickedFile(storiesInput.current!);
      if (!file) return;
      const existing = await listStories();
      const result = parseStoriesFile(file.text, existing.map((s) => s.id));
      if (!result.ok) {
        setStatus({ tone: 'error', text: `Nothing was imported. ${result.error}` });
        return;
      }
      setPending({
        kind: 'stories',
        fileName: file.name,
        preview: result.value,
        mode: result.value.duplicateIds.length === 0 ? 'skip' : null,
      });
    });

  const handleBackupPicked = () =>
    run(async () => {
      setPending(null);
      const file = await readPickedFile(backupInput.current!);
      if (!file) return;
      const result = parseBackupFile(file.text);
      if (!result.ok) {
        setStatus({
          tone: 'error',
          text: 'This backup cannot be restored. Your current data has not been changed.',
          details: result.errors,
        });
        return;
      }
      setPending({ kind: 'backup', fileName: file.name, backup: result.value });
    });

  const confirmStoryImport = (preview: StoryImportPreview, mode: DuplicateMode) =>
    run(async () => {
      const result = await importStories(preview.valid, mode);
      setPending(null);
      const parts = [`${plural(result.added, 'story', 'stories')} added`];
      if (result.replaced) parts.push(`${result.replaced} replaced`);
      if (result.skipped) parts.push(`${result.skipped} skipped`);
      setStatus({ tone: 'notice', text: `Import complete: ${parts.join(', ')}.` });
      onDataChanged();
    });

  const confirmRestore = (backup: ValidatedBackup) =>
    run(async () => {
      try {
        await replaceAllData(backup, { confirmed: true });
      } catch (error) {
        throw new Error(`Restore failed and was rolled back. Your previous data is unchanged. (${errorText(error)})`, {
          cause: error,
        });
      }
      setPending(null);
      setStatus({ tone: 'notice', text: 'Backup restored.' });
      onDataChanged();
    });

  return (
    <section className="card data-card" aria-labelledby="backup-heading">
      <h2 id="backup-heading">Backup and restore</h2>
      <p>
        Backups and exports are created inside this browser and saved as files on your device. Nothing
        is uploaded. A full backup contains your stories, notes and voice recordings, so store it
        somewhere private.
      </p>
      <p className="warning">
        The browser can remove this app&apos;s storage, for example when you clear site data, use a
        private window, or the device runs low on space. Create a full backup regularly.
      </p>
      <p className="muted">
        Last full backup:{' '}
        {lastBackup.data ? formatDate(lastBackup.data) : lastBackup.loading ? '…' : 'never in this browser'}
      </p>

      {status && (
        <div className={status.tone === 'error' ? 'notice error-notice' : 'notice'} role={status.tone === 'error' ? 'alert' : 'status'}>
          <p>{status.text}</p>
          {status.details && (
            <ul>
              {status.details.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="actions">
        <button onClick={handleExportStories} disabled={busy}>
          Export stories
        </button>
        <button onClick={() => storiesInput.current?.click()} disabled={busy}>
          Import stories
        </button>
        <button className="primary" onClick={handleCreateBackup} disabled={busy}>
          Create full backup
        </button>
        <button onClick={() => backupInput.current?.click()} disabled={busy}>
          Restore full backup
        </button>
      </div>
      <input
        ref={storiesInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Stories file to import"
        onChange={handleStoriesPicked}
      />
      <input
        ref={backupInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Backup file to restore"
        onChange={handleBackupPicked}
      />

      {pending?.kind === 'stories' && (
        <StoryImportPanel
          pending={pending}
          busy={busy}
          onModeChange={(mode) => setPending({ ...pending, mode })}
          onConfirm={(mode) => confirmStoryImport(pending.preview, mode)}
          onCancel={() => {
            setPending(null);
            setStatus({ tone: 'notice', text: 'Import cancelled. Nothing was changed.' });
          }}
        />
      )}

      {pending?.kind === 'backup' && (
        <ConfirmPanel
          word="RESTORE"
          actionLabel="Replace my data with this backup"
          busy={busy}
          onConfirm={() => confirmRestore(pending.backup)}
          onCancel={() => {
            setPending(null);
            setStatus({ tone: 'notice', text: 'Restore cancelled. Nothing was changed.' });
          }}
        >
          <h3>Restore preview</h3>
          <p className="muted small">
            {pending.fileName} · created {formatDate(pending.backup.exportedAt)}
          </p>
          <table className="preview-table">
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">In backup</th>
                <th scope="col">Currently in this browser</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Stories</th>
                <td>{pending.backup.stories.length}</td>
                <td>{current.stories}</td>
              </tr>
              <tr>
                <th scope="row">Practice rounds</th>
                <td>{pending.backup.attempts.length}</td>
                <td>{current.attempts}</td>
              </tr>
              <tr>
                <th scope="row">Recordings</th>
                <td>
                  {pending.backup.recordings.length} ({fileSize(pending.backup.audioBytes)})
                </td>
                <td>{current.recordings}</td>
              </tr>
            </tbody>
          </table>
          {pending.backup.warnings.length > 0 && (
            <ul className="warning">
              {pending.backup.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}
          <p className="warning">
            Restoring deletes every story, practice round and recording currently in this browser and
            replaces them with the backup. Consider creating a full backup of your current data first.
          </p>
        </ConfirmPanel>
      )}
    </section>
  );
}

function StoryImportPanel({
  pending,
  busy,
  onModeChange,
  onConfirm,
  onCancel,
}: {
  pending: Extract<Pending, { kind: 'stories' }>;
  busy: boolean;
  onModeChange: (mode: DuplicateMode) => void;
  onConfirm: (mode: DuplicateMode) => void;
  onCancel: () => void;
}) {
  const { preview, mode, fileName } = pending;
  const duplicates = new Set(preview.duplicateIds);
  const duplicateTitles = preview.valid.filter((s) => duplicates.has(s.id)).map((s) => s.title);
  const canImport = preview.valid.length > 0 && mode !== null;
  return (
    <div className="confirm-panel" role="group" aria-label="Import stories preview">
      <h3>Import preview</h3>
      <p className="muted small">
        {fileName} · exported {formatDate(preview.exportedAt)}
      </p>
      <ul>
        <li>{plural(preview.valid.length, 'valid story', 'valid stories')}</li>
        <li>{plural(preview.invalid.length, 'invalid story', 'invalid stories')} (will not be imported)</li>
        <li>{plural(preview.duplicateIds.length, 'story', 'stories')} with an id that already exists here</li>
      </ul>

      {preview.invalid.length > 0 && (
        <details open>
          <summary>Validation errors</summary>
          <ul className="small">
            {preview.invalid.map((item) => (
              <li key={item.position}>
                Story {item.position}
                {item.title ? ` (“${item.title}”)` : ''}: {item.errors.join(' ')}
              </li>
            ))}
          </ul>
        </details>
      )}

      {duplicateTitles.length > 0 && (
        <fieldset className="choice">
          <legend>Duplicate ids: {duplicateTitles.join(', ')}</legend>
          <label>
            <input type="radio" name="duplicates" checked={mode === 'skip'} onChange={() => onModeChange('skip')} />
            Skip existing — keep the stories already in this browser
          </label>
          <label>
            <input
              type="radio"
              name="duplicates"
              checked={mode === 'replace'}
              onChange={() => onModeChange('replace')}
            />
            Replace existing — overwrite them with the versions from the file
          </label>
        </fieldset>
      )}

      <div className="actions">
        <button className="primary" disabled={!canImport || busy} onClick={() => mode && onConfirm(mode)}>
          Import {plural(preview.valid.length, 'story', 'stories')}
        </button>
        <button onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
      {preview.valid.length > 0 && mode === null && (
        <p className="hint">Choose how to handle duplicate ids before importing.</p>
      )}
    </div>
  );
}
