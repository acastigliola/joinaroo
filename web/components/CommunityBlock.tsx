import type { CommunityBlockData, CommunityQuote } from '../lib/api';
import PersonMenu from './PersonMenu';

// Community Pick rendering for event detail pages, rebuilt to Spark's
// spec (Nov 2 review, 4/10 on the old stack): one thread = one proof
// block. The page renders TWO pieces:
//   CommunityPickCard — a compact card AFTER the facts: the feature
//     quote ONCE, one inline thread link, no intro paragraph, no big
//     button. (The old stack cited the same thread in three modules,
//     repeated the feature quote as a "highlight", and offered three
//     exits before the visitor ever saw the price.)
//   CommunityBelow — discovery, BELOW the tickets button: related
//     bands from the thread, then any remaining thread quotes that are
//     NOT near-duplicates of the feature quote.
// Driven entirely by events.community JSON; pages without the data
// render nothing.

function QuoteCard({
  q,
  meta,
  stacked,
}: {
  q: CommunityQuote;
  meta?: string;
  stacked?: boolean;
}) {
  return (
    <figure
      className={`cb-quote${q.author.length >= 18 ? ' cb-quote--long' : ''}${
        stacked ? ' cb-quote--stack' : ''
      }`}
    >
      <img className="cb-quote-mark-img" src="/icons/cb-quote.png" alt="" />
      <blockquote>{q.text}</blockquote>
      <figcaption>
        <PersonMenu
          platformLabel="Reddit"
          platform="reddit"
          profileUrl={`https://www.reddit.com/user/${q.author}`}
          postUrl={q.permalink ?? null}
          postLabel="View Reddit comment"
          postIcon="/icons/cb-comment.png"
          messageUrl={`https://www.reddit.com/message/compose/?to=${q.author}`}
          align="left"
          triggerClassName="person-menu-trigger cb-person-trigger"
          ariaLabel={`Actions for ${q.author} on Reddit`}
        >
          {q.avatar_url ? (
            <img className="cb-avatar" src={q.avatar_url} alt="" />
          ) : (
            <span className="cb-avatar cb-avatar-fallback" aria-hidden="true">
              {q.author.charAt(0).toUpperCase()}
            </span>
          )}
          {stacked ? (
            <span className="cb-attribution">
              <span className="cb-author">{q.author}</span>
              {meta ? <span className="cb-meta">{meta}</span> : null}
            </span>
          ) : (
            <span className="cb-author">{q.author}</span>
          )}
        </PersonMenu>
        {!stacked && meta ? <span className="cb-meta">{meta}</span> : null}
      </figcaption>
    </figure>
  );
}

function MusicNoteIcon() {
  return (
    <svg
      className="cb-head-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// A highlight that merely restates the feature quote (the old stack's
// Rustic quote appeared twice, once trimmed) is the same dollar spent
// twice — drop it. Containment in either direction counts as a dupe.
function extraQuotes(data: CommunityBlockData): CommunityQuote[] {
  const nf = normText(data.feature_quote.text);
  return data.highlights.filter((q) => {
    const nh = normText(q.text);
    if (!nh) return false;
    return !(nf.includes(nh) || nh.includes(nf));
  });
}

export function CommunityPickCard({ data }: { data: CommunityBlockData }) {
  const sub = data.subreddit;
  return (
    <div className="cb-wrap">
      <section className="cb-panel cb-panel-blue">
        <div className="cb-head">
          <img className="cb-head-icon" src="/icons/cb-reddit.png" alt="" />
          <h2>Picked from {sub}</h2>
        </div>
        <QuoteCard
          q={data.feature_quote}
          meta={data.feature_quote.ago ? `${sub} · ${data.feature_quote.ago}` : sub}
          stacked
        />
        <a
          className="cb-link"
          href={data.thread_url}
          target="_blank"
          rel="noreferrer"
        >
          <img className="cb-link-icon" src="/icons/cb-external.png" alt="" />
          View the full {sub} thread
          <img className="cb-link-arrow" src="/icons/cb-arrow.png" alt="" />
        </a>
      </section>
    </div>
  );
}

export function CommunityBelow({ data }: { data: CommunityBlockData }) {
  const sub = data.subreddit;
  const quotes = extraQuotes(data);
  if (data.related_bands.length === 0 && quotes.length === 0) return null;
  return (
    <div className="cb-wrap">
      {data.related_bands.length > 0 && (
        <section className="cb-panel cb-panel-plain">
          <div className="cb-head">
            <MusicNoteIcon />
            <h2>Related local bands from the same thread</h2>
          </div>
          <p className="cb-intro">
            Fans also mentioned these Portland bands. Check them out on
            Joinaroo!
          </p>
          <div className="cb-bands">
            {data.related_bands.map((b) => (
              <a
                key={b.name}
                className="cb-band"
                href={`/?q=${encodeURIComponent(b.query)}`}
              >
                {b.photo ? <img src={b.photo} alt="" /> : null}
                <span>{b.name}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {quotes.length > 0 && (
        <section className="cb-panel cb-panel-mint">
          <div className="cb-head">
            <img className="cb-head-img" src="/icons/cb-chat-green.png" alt="" />
            <h2>What people are saying on {sub}</h2>
          </div>
          <div className="cb-highlights">
            {quotes.map((q, i) => (
              <QuoteCard key={i} q={q} meta={q.ago ?? undefined} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
