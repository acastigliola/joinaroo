'use client';

import { useRef } from 'react';
import CardPhotosLink from './CardPhotosLink';

// "Live Events Near You Right Now" strip (Angelo's mockup, Oct 25): on a
// non-live event page, above the hero, list events that are live right
// now or were live earlier today — pale green panel, horizontal cards
// with the LIVE pill, distance from this event, avatar stack, and the
// "N here now" / "N were here" line.
export type StripEvent = {
  slug: string;
  title: string;
  img: string | null;
  stillLive: boolean;
  pillExp?: number;
  count: number;
  photoCount: number;
  avatars: { url: string | null; initials: string; name: string }[];
  extra: number;
  focusTop: boolean;
  venueLine: string;
  distMi: number | null;
};

export default function LiveNearStrip({
  events,
  subText,
}: {
  events: StripEvent[];
  subText: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  if (events.length === 0) return null;

  return (
    <section className="live-strip" aria-label="Live events near you">
      <div className="live-strip-head">
        <img src="/icons/icon-live-dot.png" alt="" className="live-strip-dot" />
        <h2 className="live-strip-title">Live Events Near You Right Now</h2>
      </div>
      <p className="live-strip-sub">{subText}</p>
      <div className="live-strip-rowwrap">
        <div className="live-strip-row" ref={rowRef}>
          {events.map((e) => (
            <a
              key={e.slug}
              href={`/events/${e.slug}#hero`}
              className="live-strip-card"
            >
              <span className="live-strip-photo">
                {e.img && (
                  <img
                    src={e.img}
                    alt=""
                    style={e.focusTop ? { objectPosition: '50% 0%' } : undefined}
                  />
                )}
                {e.stillLive && (
                  <img
                    src="/icons/icon-live-pill.png"
                    alt="Live"
                    className="live-strip-pill"
                  />
                )}
              </span>
              {e.distMi !== null && (
                <span className="live-strip-dist">
                  {e.distMi.toFixed(1)} mi
                </span>
              )}
              <span className="live-strip-name">{e.title}</span>
              <span className="live-strip-venue">
                <img src="/icons/icon-pin-gray.png" alt="" />
                {e.venueLine}
              </span>
              {e.stillLive ? (
                <>
                  <span className="live-strip-people">
                    {e.avatars.map((a, i) =>
                      a.url ? (
                        <img
                          key={i}
                          src={a.url}
                          alt={a.name}
                          className="live-strip-avatar"
                        />
                      ) : (
                        <span key={i} className="live-strip-avatar live-strip-initials">
                          {a.initials}
                        </span>
                      ),
                    )}
                    {e.extra > 0 && (
                      <span className="live-strip-more">+{e.extra}</span>
                    )}
                  </span>
                  <span className="live-strip-count">
                    <span className="live-strip-countdot" />
                    {e.count} here now
                  </span>
                </>
              ) : (
                <span className="strip-ended-block">
                  <span className="live-strip-people">
                    {e.avatars.map((a, i) => (
                      <span key={i} className="strip-ended-avatarwrap">
                        {a.url ? (
                          <img
                            src={a.url}
                            alt={a.name}
                            className="live-strip-avatar"
                          />
                        ) : (
                          <span className="live-strip-avatar live-strip-initials">
                            {a.initials}
                          </span>
                        )}
                        <img
                          src="/icons/icon-check-green.png"
                          alt=""
                          className="strip-ended-badge"
                        />
                      </span>
                    ))}
                    {e.extra > 0 && (
                      <span className="live-strip-more">+{e.extra}</span>
                    )}
                  </span>
                  <span className="strip-ended-texts">
                    <span className="strip-ended-count">
                      {e.count} {e.count === 1 ? 'person' : 'people'} attended
                    </span>
                    <span className="strip-ended-sub">
                      Checked in · Attendance
                      <br />
                      confirmed
                    </span>
                    <CardPhotosLink slug={e.slug} count={e.photoCount} />
                  </span>
                </span>
              )}
            </a>
          ))}
        </div>
        {events.length > 2 && (
          <button
            type="button"
            className="live-strip-next"
            aria-label="Scroll live events"
            onClick={() =>
              rowRef.current?.scrollBy({ left: 440, behavior: 'smooth' })
            }
          >
            <img src="/icons/icon-chevron-blue.png" alt="" />
          </button>
        )}
      </div>
      <div className="live-strip-foot">
        <a href="/" className="live-strip-seeall">
          See all live events
          <img src="/icons/icon-arrow-right.png" alt="" />
        </a>
      </div>
    </section>
  );
}
