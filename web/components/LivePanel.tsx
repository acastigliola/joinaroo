'use client';

import { useEffect, useState } from 'react';
import PersonMenu from './PersonMenu';

// The green "Live now!" panel (Angelo, Oct 25). Tapping "N here now" or
// "Chat with people at this event" opens a sheet listing everyone in the
// same row layout the panel uses after the event ends (avatar + check,
// name, status, Message button, ⋮ menu) — with live wording.
export type LivePanelPerson = {
  name: string;
  short: string;
  initials: string;
  avatarUrl: string | null;
  href: string | null;
  platform: string | null;
  platformLabel: string;
  profileUrl: string | null;
  postUrl: string | null;
  messageUrl: string | null;
};

export default function LivePanel({
  people,
  platformLabel,
}: {
  people: LivePanelPerson[];
  platformLabel: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [sheetOpen ]);

  return (
    <section className="live-panel" aria-label="People at this event">
      <div className="live-panel-head">
        <span className="live-panel-title">
          <span className="live-panel-dot" />
          Live now!
        </span>
        <button
          type="button"
          className="live-panel-count"
          onClick={() => setSheetOpen(true)}
        >
          {people.length} here now
          <span className="live-panel-chevron">›</span>
        </button>
      </div>
      <p className="live-panel-sub">
        People from {platformLabel} are at this event
      </p>
      <div
        className={
          people.length > 2
            ? 'live-panel-people live-panel-people-centered'
            : 'live-panel-people'
        }
      >
        {people.map((p, i) => {
          const avatarBlock = (
            <span className="live-person-avatarwrap">
              {p.avatarUrl ? (
                <img
                  className="live-person-avatar"
                  src={p.avatarUrl}
                  alt={p.name}
                />
              ) : (
                <span className="live-person-avatar live-person-initials">
                  {p.initials}
                </span>
              )}
              <span className="live-person-presence" />
            </span>
          );
          return (
            <span key={i} className="live-person">
              <PersonMenu
                platform={p.platform}
                platformLabel={p.platformLabel}
                profileUrl={p.profileUrl}
                postUrl={p.postUrl}
                messageUrl={p.messageUrl}
                align={(['left', 'center', 'right'] as const)[i % 3]}
                ariaLabel={`Actions for ${p.name}`}
              >
                {avatarBlock}
              </PersonMenu>
              {p.href ? (
                <a
                  className="live-person-name"
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {p.short}
                </a>
              ) : (
                <span className="live-person-name">{p.short}</span>
              )}
            </span>
          );
        })}
      </div>
      <button
        type="button"
        className="live-chat-btn"
        onClick={() => setSheetOpen(true)}
      >
        <img src="/icons/icon-chat.png" alt="" className="live-chat-icon" />
        Chat with people at this event
        <img
          src="/icons/icon-arrow-right.png"
          alt=""
          className="live-chat-arrow"
        />
      </button>

      {sheetOpen && (
        <div
          className="people-sheet-backdrop"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="people-sheet"
            role="dialog"
            aria-label="People at this event"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="people-sheet-head">
              <span className="people-sheet-title">
                People at this event ({people.length})
              </span>
              <button
                type="button"
                className="people-sheet-close"
                aria-label="Close"
                onClick={() => setSheetOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="people-sheet-rows">
              {people.map((p, i) => {
                const main = (
                  <>
                    <span className="ended-avatarwrap">
                      {p.avatarUrl ? (
                        <img
                          className="ended-avatar"
                          src={p.avatarUrl}
                          alt={p.name}
                        />
                      ) : (
                        <span className="ended-avatar ended-initials">
                          {p.initials}
                        </span>
                      )}
                      <span className="people-sheet-presence" />
                    </span>
                    <span className="ended-person-text">
                      <span className="ended-name">{p.short}</span>
                      <span className="ended-status">
                        Checked in • Here now
                      </span>
                    </span>
                  </>
                );
                return (
                  <div className="ended-person people-sheet-row" key={i}>
                    {p.href ? (
                      <a
                        className="ended-person-main"
                        href={p.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {main}
                      </a>
                    ) : (
                      <span className="ended-person-main">{main}</span>
                    )}
                    {p.href && (
                      <a
                        className="ended-msg"
                        href={p.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img src="/icons/icon-chat.png" alt="" />
                        Message
                      </a>
                    )}
                    <PersonMenu
                      platform={p.platform}
                      platformLabel={p.platformLabel}
                      profileUrl={p.profileUrl}
                      postUrl={p.postUrl}
                      messageUrl={p.messageUrl}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
