const ticketmasterCheckoutHosts = ['ticketmaster.com', 'tmtickets.sa'] as const;

export function isAllowedTicketmasterCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return ticketmasterCheckoutHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

export function isSafeProviderImageUrl(value: string | null | undefined): value is string {
  if (!value || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && host !== 'localhost'
      && !host.endsWith('.local')
      && host.includes('.');
  } catch {
    return false;
  }
}
