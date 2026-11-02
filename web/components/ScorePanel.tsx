import type { LiveScore } from '../lib/api';

/** Score panel for a tracked game (Angelo, Oct 27): shows the running
 * score while the game is live and the final once it ends. Rendered on
 * the event detail page when the API carries a live_score with scores.
 * Server component. */
export default function ScorePanel({ score }: { score: LiveScore }) {
  const live = score.status === 'live';
  return (
    <section className="score-panel" aria-label="Game score">
      <span className={live ? 'score-status score-status-live' : 'score-status'}>
        {live ? (
          <>
            <span className="card-live-dot" />
            LIVE{score.period ? ` · ${score.period}` : ''}
          </>
        ) : (
          'FINAL SCORE'
        )}
      </span>
      <div className="score-lines">
        <p className="score-line">
          <span className="score-team">{score.home_team}</span>
          <strong className="score-num">{score.home_score}</strong>
        </p>
        <p className="score-line">
          <span className="score-team">{score.away_team}</span>
          <strong className="score-num">{score.away_score}</strong>
        </p>
      </div>
    </section>
  );
}
