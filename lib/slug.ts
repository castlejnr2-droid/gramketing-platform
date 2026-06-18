/** Converts a name to a URL-safe slug: lowercase, hyphens, no specials. */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'pool';
}

/** Returns the canonical URL path for a pool, using slug when available. */
export function poolUrl(
  pool: { id: string; slug?: string | null },
  base = '/pools',
): string {
  return `${base}/${pool.slug ?? pool.id}`;
}
