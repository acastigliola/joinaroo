'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// The ⋮ menu on an attended-person row (Angelo, Oct 25): View <Platform>
// Profile, View <Platform> Post, Send Message. Only actions whose URL
// actually exists are listed; the menu renders nothing when none do.
export default function PersonMenu({
  platformLabel,
  platform,
  profileUrl,
  postUrl,
  messageUrl,
  align = 'right',
  triggerClassName,
  ariaLabel,
  postLabel,
  postIcon,
  children,
}: {
  platformLabel: string;
  platform: string | null;
  profileUrl: string | null;
  postUrl: string | null;
  messageUrl: string | null;
  // Override for the post item (e.g. "View Reddit comment").
  postLabel?: string;
  // Override icon for the post item (e.g. the Reddit comment glyph).
  postIcon?: string;
  // Where the dropdown opens relative to the trigger (default right, the
  // ended panel's ⋮; the live panel passes left/center/right per avatar).
  align?: 'left' | 'center' | 'right';
  triggerClassName?: string;
  ariaLabel?: string;
  // Custom trigger content (e.g. the live panel's avatar). Without it the
  // trigger is the ended panel's ⋮ glyph.
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const profileIcon =
    platform === 'facebook'
      ? '/icons/icon-facebook.png'
      : platform === 'x'
        ? '/icons/icon-people-gray.png'
        : platform === 'reddit'
          ? '/icons/cb-reddit.png'
          : '/icons/icon-ig-outline.png';
  const items = [
    profileUrl
      ? {
          label: `View ${platformLabel} profile`,
          href: profileUrl,
          icon: profileIcon,
        }
      : null,
    postUrl
      ? {
          label: postLabel ?? `View ${platformLabel} post`,
          href: postUrl,
          icon: postIcon ?? '/icons/icon-image-navy.png',
        }
      : null,
    messageUrl
      ? {
          label: 'Send message',
          href: messageUrl,
          icon: '/icons/icon-chat-menu.png',
        }
      : null,
  ].filter(
    (x): x is { label: string; href: string; icon: string } => x !== null,
  );

  // No actions derivable: with a custom trigger, still render the trigger
  // itself (the live panel's avatar must not disappear); the ended
  // panel's bare ⋮ renders nothing.
  if (items.length === 0) {
    return children ? <span className="person-menu">{children}</span> : null;
  }

  return (
    <span className="person-menu" ref={ref}>
      <button
        type="button"
        className={children ? (triggerClassName ?? 'person-menu-trigger') : 'ended-dots-btn'}
        aria-label={ariaLabel ?? 'More actions for this person'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {children ?? '⋮'}
      </button>
      {open && (
        <span className={`person-menu-list align-${align}`} role="menu">
          {items.map((it) => (
            <a
              key={it.label}
              className="person-menu-item"
              href={it.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              <img className="person-menu-icon" src={it.icon} alt="" />
              <span>{it.label}</span>
            </a>
          ))}
        </span>
      )}
    </span>
  );
}
