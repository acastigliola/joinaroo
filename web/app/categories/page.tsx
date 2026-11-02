import { categoryEmoji, getCategories } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  try {
    categories = await getCategories();
  } catch {
    return (
      <div className="container">
        <div className="alert" role="alert">
          Could not reach the events service. Is the API running?
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1 className="page-title">Browse by category</h1>
      <p className="page-sub">
        Pick a lane — every category filters the event list.
      </p>
      <div className="cat-grid">
        {categories.map((c) => (
          <a key={c.slug} className="cat-card" href={`/?category=${c.slug}`}>
            <span className="cat-icon" aria-hidden="true">
              {categoryEmoji(c.icon)}
            </span>
            <h2>{c.name}</h2>
            <p>{c.tagline}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
