'use client';

/**
 * The "View photos (N) →" label on an ended live card (Angelo, Oct 25):
 * takes the user to the event page scrolled to the Photos section.
 * Rendered inside the card's <Link>, so the click must not fall
 * through to the plain card navigation.
 */
export default function CardPhotosLink({
  slug,
  count,
}: {
  slug: string;
  count: number;
}) {
  return (
    <span
      className="card-ended-view"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.assign(`/events/${slug}#photos`);
      }}
    >
      View photos ({count}) →
    </span>
  );
}
