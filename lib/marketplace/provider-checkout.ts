import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  getTicketmasterEvent,
  type TicketmasterDiscoveryEvent,
} from '@/lib/travel/ticketmaster/discovery';
import { isAllowedTicketmasterCheckoutUrl } from '@/lib/marketplace/provider-url-safety';

const PROVIDER_ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

export type ProviderCheckoutProvider = 'ticketmaster';
export type NormalizedProviderCheckoutInput = {
  provider: ProviderCheckoutProvider;
  providerItemId: string;
};

export type ProviderCheckoutTarget = {
  provider: ProviderCheckoutProvider;
  providerItemId: string;
  source: 'ticketmaster_discovery_api';
  sourceUrl: string;
  checkoutUrl: string;
  handoffReference: string;
  retrievedAt: string;
  transactionMethod: 'provider_checkout';
  fulfilmentState: 'external_provider';
  environment: 'production';
};

export class ProviderCheckoutError extends Error {
  constructor(
    public readonly code: 'INVALID_REQUEST' | 'PROVIDER_BLOCKED' | 'ITEM_UNAVAILABLE' | 'UNSAFE_PROVIDER_URL',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderCheckoutError';
  }
}

export type ProviderCheckoutDependencies = {
  getTicketmasterEvent: (id: string) => Promise<TicketmasterDiscoveryEvent | null>;
  randomUUID: () => string;
  now: () => Date;
};

const defaultDependencies: ProviderCheckoutDependencies = {
  getTicketmasterEvent,
  randomUUID,
  now: () => new Date(),
};

function normalizeProvider(value: unknown): ProviderCheckoutProvider {
  if (value === 'ticketmaster') return value;
  throw new ProviderCheckoutError('PROVIDER_BLOCKED', 'Provider checkout is not enabled for this provider.');
}

function normalizeProviderItemId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!PROVIDER_ITEM_ID_PATTERN.test(id)) {
    throw new ProviderCheckoutError('INVALID_REQUEST', 'Provider item ID is invalid.');
  }
  return id;
}

export function normalizeProviderCheckoutInput(
  input: { provider?: unknown; providerItemId?: unknown },
): NormalizedProviderCheckoutInput {
  return {
    provider: normalizeProvider(input.provider),
    providerItemId: normalizeProviderItemId(input.providerItemId),
  };
}

export async function resolveProviderCheckout(
  input: { provider?: unknown; providerItemId?: unknown },
  dependencies: ProviderCheckoutDependencies = defaultDependencies,
): Promise<ProviderCheckoutTarget> {
  const { provider, providerItemId } = normalizeProviderCheckoutInput(input);
  const event = await dependencies.getTicketmasterEvent(providerItemId);

  if (!event || event.salesStatus.trim().toLowerCase() !== 'onsale') {
    throw new ProviderCheckoutError('ITEM_UNAVAILABLE', 'Provider item is not currently eligible for checkout.');
  }

  if (!isAllowedTicketmasterCheckoutUrl(event.url)) {
    throw new ProviderCheckoutError('UNSAFE_PROVIDER_URL', 'Provider checkout URL is not allowlisted.');
  }

  return {
    provider,
    providerItemId,
    source: 'ticketmaster_discovery_api',
    sourceUrl: event.url,
    checkoutUrl: event.url,
    handoffReference: `HOF-${dependencies.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
    retrievedAt: dependencies.now().toISOString(),
    transactionMethod: 'provider_checkout',
    fulfilmentState: 'external_provider',
    environment: 'production',
  };
}
