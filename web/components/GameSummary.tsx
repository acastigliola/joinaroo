import { Fragment } from 'react';
import type { GameSummary as GameSummaryData, LiveScore } from '../lib/api';

/** Game-summary module (Angelo, Oct 28, from his mockup): the enriched
 * score header on a tracked game's detail page, rendered above the
 * event facts where the plain ScorePanel used to sit. Logo-vs-logo
 * score header with a FINAL/LIVE pill, a records strip, a note panel,
 * and a what's-next panel — all driven by the event's game_summary
 * JSON; the score itself comes from live_score. Server component. */
export default function GameSummary({
  score,
  summary,
  startsAt,
}: {
  score: LiveScore;
  summary: GameSummaryData;
  startsAt: string;
}) {
  const live = score.status === 'live';
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(new Date(startsAt));
  const { home, away } = summary;
  return (
    <div className="gs-module">
      <section className="gs-panel" aria-label="Game score">
        <div className="gs-head">
          {home.logo ? (
            <img src={home.logo} alt="" className="gs-logo" />
          ) : (
            <span className="gs-logo" />
          )}
          <strong className="gs-score">{score.home_score}</strong>
          <div className="gs-mid">
            <span className={live ? 'gs-pill gs-pill-live' : 'gs-pill'}>
              {live ? (
                <>
                  <span className="card-live-dot" />
                  LIVE{score.period ? ` · ${score.period}` : ''}
                </>
              ) : (
                'FINAL'
              )}
            </span>
            <span className="gs-date">{dateLabel}</span>
          </div>
          <strong className="gs-score">{score.away_score}</strong>
          {away.logo ? (
            <img src={away.logo} alt="" className="gs-logo" />
          ) : (
            <span className="gs-logo" />
          )}
        </div>
        <div className="gs-names">
          <div className="gs-team">
            <span className="gs-team-name">{home.name}</span>
            {home.mascot ? (
              <span className="gs-team-mascot">{home.mascot}</span>
            ) : null}
          </div>
          <div className="gs-team gs-team-right">
            <span className="gs-team-name">{away.name}</span>
            {away.mascot ? (
              <span className="gs-team-mascot">{away.mascot}</span>
            ) : null}
          </div>
        </div>
      </section>

      {summary.records && summary.records.length > 0 ? (
        <section
          className={`gs-panel gs-records-panel${summary.records_logo ? ' gs-records-withlogo' : ''}`}
          aria-label="Team records"
        >
          {summary.records.map((r, idx) => {
            const parts = r.value.split('-').map((s) => s.trim());
            const labels = r.sub ? r.sub.split(/\s+/).filter(Boolean) : [];
            const aligned =
              parts.length > 1 && parts.length === labels.length;
            return (
              <div
                className={idx > 0 ? 'gs-rec-row gs-rec-row-divided' : 'gs-rec-row'}
                key={r.label}
              >
                <span className="gs-rec-slot">
                  {idx === 0 && summary.records_logo ? (
                    <img src={summary.records_logo} alt="" className="gs-rec-logo" />
                  ) : null}
                </span>
                <div className="gs-rec">
                  <span className="gs-rec-label">{r.label}</span>
                  {aligned ? (
                    <span
                      className={`gs-rec-grid${parts.length === 2 ? ' gs-rec-grid--2' : ''}`}
                    >
                      {parts.map((p, i) => (
                        <Fragment key={i}>
                          {i > 0 ? <span className="gs-rec-dash">-</span> : null}
                          <span className="gs-rec-part">
                            <span className="gs-rec-value">{p}</span>
                            <span className="gs-rec-sub">{labels[i]}</span>
                          </span>
                        </Fragment>
                      ))}
                    </span>
                  ) : (
                    <>
                      <span className="gs-rec-value">{r.value}</span>
                      {r.sub ? <span className="gs-rec-sub">{r.sub}</span> : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {summary.note ? (
        <section className="gs-note" aria-label={summary.note.title}>
          <img src="/icons/games/trophy-blue.png" alt="" className="gs-note-icon" />
          <div>
            <h3 className="gs-note-title">{summary.note.title}</h3>
            <p className="gs-note-body">{summary.note.body}</p>
          </div>
        </section>
      ) : null}

      {summary.next && summary.next.rows.length > 0 ? (
        <section className="gs-next" aria-label={summary.next.title}>
          <div className="gs-next-head">
            <img src="/icons/games/bracket-blue.png" alt="" className="gs-next-icon" />
            <div>
              <h3 className="gs-next-title">{summary.next.title}</h3>
              {summary.next.subtitle ? (
                <p className="gs-next-sub">{summary.next.subtitle}</p>
              ) : null}
            </div>
          </div>
          {summary.next.rows.map((row) => (
            <div className="gs-next-row" key={row.stage}>
              <img src="/icons/icon-calendar.png" alt="" className="gs-next-row-icon" />
              <div className="gs-next-row-main">
                <span className="gs-next-stage">{row.stage}</span>
                <span className="gs-next-when">
                  {row.date}
                  {row.time ? (
                    <>
                      <br />
                      {row.time}
                    </>
                  ) : null}
                </span>
              </div>
              {row.badge || row.place || row.detail ? (
                <div className="gs-next-row-right">
                  {row.badge ? <span className="gs-next-badge">{row.badge}</span> : null}
                  {row.place || row.detail ? (
                    <div className="gs-next-row-place">
                      <span className="gs-next-place-line">
                        <img src="/icons/icon-pin-outline.png" alt="" className="gs-next-pin" />
                        {row.place?.split(' · ')[0]}
                      </span>
                      {row.place && row.place.includes(' · ') ? (
                        <span className="gs-next-place-sub">
                          {row.place.split(' · ').slice(1).join(' · ')}
                        </span>
                      ) : null}
                      {row.detail ? (
                        <span className="gs-next-detail">{row.detail}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
