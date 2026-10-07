import { cue } from '../lib/progression';
import type { ScaffoldLevel, Story } from '../types';

interface Props {
  story: Story;
  level: ScaffoldLevel;
}

/** Shows a story with less and less support as the level increases. */
export function ScaffoldView({ story, level }: Props) {
  if (level === 4) {
    return (
      <div className="scaffold scaffold-empty">
        <p>No support at this level. Answer from memory, then check yourself afterwards.</p>
      </div>
    );
  }

  const structure = (
    <ol className="structure">
      <li>Situation</li>
      <li>Task</li>
      <li>Actions (what <em>I</em> did)</li>
      {story.decisionOrTradeoff && <li>Decision or trade-off</li>}
      <li>Result</li>
    </ol>
  );

  if (level === 3) {
    return (
      <div className="scaffold">
        <p className="headline">{story.headline}</p>
        <h4>Structure</h4>
        {structure}
        {story.usefulPhrases.length > 0 && (
          <>
            <h4>Useful phrases</h4>
            <ul>
              {story.usefulPhrases.map((phrase, i) => (
                <li key={i}>{phrase}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  const text = (value: string) => (level === 1 ? value : cue(value));

  return (
    <div className="scaffold">
      <p className="headline">{story.headline}</p>
      <h4>Situation</h4>
      <p>{text(story.situation)}</p>
      <h4>Task</h4>
      <p>{text(story.task)}</p>
      <h4>Actions</h4>
      <ul>
        {story.personalActions.map((action, i) => (
          <li key={i}>{text(action)}</li>
        ))}
      </ul>
      {story.decisionOrTradeoff && (
        <>
          <h4>Decision or trade-off</h4>
          <p>{text(story.decisionOrTradeoff)}</p>
        </>
      )}
      <h4>Result</h4>
      <p>{text(story.result)}</p>
      {level === 1 && story.usefulPhrases.length > 0 && (
        <>
          <h4>Useful phrases</h4>
          <ul>
            {story.usefulPhrases.map((phrase, i) => (
              <li key={i}>{phrase}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
