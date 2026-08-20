export type RelatedServiceReference = {
  slug?: string | null;
  href?: string | null;
  title?: string | null;
};

export function filterRelatedServices<T extends RelatedServiceReference>(
  items: T[],
  current: { slug?: string | null; href?: string | null }
): T[] {
  const currentSlugs = new Set(
    [current.slug, current.href ? current.href.replace(/^\//, '').replace(/^services\//, '') : undefined]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim().toLowerCase())
  );

  return items.filter((item) => {
    const itemSlug = (item.slug ?? item.href ?? item.title ?? '').trim().toLowerCase();
    const itemHref = (item.href ?? '').trim().toLowerCase();
    const itemSlugFromHref = itemHref.replace(/^\//, '').replace(/^services\//, '');

    if (currentSlugs.has(itemSlug) || currentSlugs.has(itemSlugFromHref)) {
      return false;
    }

    if (current.href && itemHref === current.href.trim().toLowerCase()) {
      return false;
    }

    if (current.slug && itemSlug === current.slug.trim().toLowerCase()) {
      return false;
    }

    return true;
  });
}
