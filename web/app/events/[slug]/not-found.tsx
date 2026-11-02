import Link from 'next/link';

export default function EventNotFound() {
  return (
    <div className="container">
      <div className="not-found">
        <h1>Event not found</h1>
        <p>
          That event doesn&rsquo;t exist or may have been removed. Try
          browsing what&rsquo;s on instead.
        </p>
        <Link className="btn" href="/">
          Back to all events
        </Link>
      </div>
    </div>
  );
}
