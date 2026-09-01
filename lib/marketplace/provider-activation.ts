import 'server-only';

export type ProviderAccessState = 'ACTIVE' | 'TEST_ONLY' | 'CONFIGURED' | 'BLOCKED' | 'NOT_APPROVED';

export type MarketplaceProviderActivation = {
  providerName: string;
  serviceFamily: 'FLY' | 'STAY' | 'DRIVE' | 'CONCIERGE' | 'VIP';
  accountStatus: ProviderAccessState;
  testAccess: boolean;
  productionAccess: boolean;
  apiAccess: boolean;
  affiliateDeepLinkAccess: boolean;
  commercialApproval: string;
  commissionRevenueModel: string;
  checkoutMode: 'DIRECT_BOOKING' | 'PROVIDER_CHECKOUT' | 'REQUEST_TO_CONFIRM' | 'NONE';
  countriesCovered: string;
  saudiCoverage: string;
  egyptCoverage: string;
  activationBlocker: string;
  owner: string;
  nextAction: string;
};

function configured(...values: Array<string | undefined>) {
  return values.every((value) => Boolean(value?.trim()));
}

/** Runtime-safe activation facts. Credential values are never returned. */
export function getMarketplaceProviderActivationMatrix(env: NodeJS.ProcessEnv = process.env): MarketplaceProviderActivation[] {
  const duffelTest = configured(env.DUFFEL_TEST_TOKEN) || (
    ['test', 'sandbox'].includes(env.DUFFEL_ENV?.trim().toLowerCase() ?? '') && configured(env.DUFFEL_API_KEY)
  );
  const duffelProduction = ['production', 'live'].includes(env.DUFFEL_ENV?.trim().toLowerCase() ?? '')
    && configured(env.DUFFEL_API_KEY);
  const liteApiTest = env.LITEAPI_TEST_API_KEY?.startsWith('sand_') === true;
  const liteApiProduction = ['production', 'live'].includes(env.LITEAPI_ENV?.trim().toLowerCase() ?? '')
    && env.LITEAPI_AUTH_MODE?.trim().toLowerCase() === 'hmac'
    && configured(env.LITEAPI_PUBLIC_API_KEY, env.LITEAPI_PRIVATE_API_KEY, env.LITEAPI_SHARED_SECRET);
  const carTrawler = configured(env.CARTRAWLER_PARTNER_TOKEN, env.CARTRAWLER_PARTNER_ID, env.CARTRAWLER_API_BASE_URL);
  const ticketmaster = configured(env.TICKETMASTER_API_KEY) || configured(env.TICKETMASTER_CONSUMER_KEY);
  const viator = configured(env.VIATOR_API_KEY);

  return [
    {
      providerName: 'Duffel', serviceFamily: 'FLY', accountStatus: duffelProduction ? 'CONFIGURED' : duffelTest ? 'TEST_ONLY' : 'BLOCKED',
      testAccess: duffelTest, productionAccess: duffelProduction, apiAccess: duffelTest || duffelProduction,
      affiliateDeepLinkAccess: false, commercialApproval: duffelProduction ? 'Environment configured; runtime validation required' : 'Production authorization not proven',
      commissionRevenueModel: 'Provider commercial terms not encoded', checkoutMode: 'NONE',
      countriesCovered: 'Provider route coverage', saudiCoverage: 'Search-capable when authorized', egyptCoverage: 'Search-capable when authorized',
      activationBlocker: duffelProduction ? 'Runtime offer validation' : 'Production token and commercial authorization', owner: 'Commercial / Travel Supply',
      nextAction: 'Validate production search and booking capability without creating an order.',
    },
    {
      providerName: 'LiteAPI', serviceFamily: 'STAY', accountStatus: liteApiProduction ? 'CONFIGURED' : liteApiTest ? 'TEST_ONLY' : 'BLOCKED',
      testAccess: liteApiTest, productionAccess: liteApiProduction, apiAccess: liteApiTest || liteApiProduction,
      affiliateDeepLinkAccess: false, commercialApproval: liteApiProduction ? 'Production HMAC configured; runtime validation required' : 'Sandbox only',
      commissionRevenueModel: 'Provider commercial terms not encoded', checkoutMode: 'NONE', countriesCovered: 'Provider hotel coverage',
      saudiCoverage: 'Riyadh/Jeddah search adapter', egyptCoverage: 'Cairo and configured cities search adapter',
      activationBlocker: liteApiProduction ? 'Production rate/booking authorization validation' : 'Production HMAC credentials and commercial approval',
      owner: 'Commercial / Travel Supply', nextAction: 'Validate production search; keep sandbox preview-only.',
    },
    {
      providerName: 'Verified local partners', serviceFamily: 'DRIVE', accountStatus: 'ACTIVE', testAccess: true, productionAccess: true,
      apiAccess: false, affiliateDeepLinkAccess: false, commercialApproval: 'Existing verified partner inventory', commissionRevenueModel: 'Request fulfilment / partner settlement',
      checkoutMode: 'REQUEST_TO_CONFIRM', countriesCovered: 'Partner-specific', saudiCoverage: 'Active published inventory', egyptCoverage: 'Partner-dependent',
      activationBlocker: 'None for current verified inventory', owner: 'Marketplace Operations', nextAction: 'Continue operational request handling.',
    },
    {
      providerName: 'CarTrawler', serviceFamily: 'DRIVE', accountStatus: carTrawler ? 'CONFIGURED' : 'BLOCKED', testAccess: carTrawler,
      productionAccess: false, apiAccess: carTrawler, affiliateDeepLinkAccess: false, commercialApproval: 'Not proven for Production',
      commissionRevenueModel: 'Vendor agreement required', checkoutMode: 'NONE', countriesCovered: 'Unknown until vendor activation',
      saudiCoverage: 'Not verified', egyptCoverage: 'Not verified',
      activationBlocker: carTrawler
        ? 'Configured credentials are staging-only; Production B2B partner authorization and approved endpoint are not proven'
        : 'CarTrawler B2B partner agreement plus CARTRAWLER_PARTNER_TOKEN, CARTRAWLER_PARTNER_ID, and CARTRAWLER_API_BASE_URL are required',
      owner: 'Commercial / Travel Supply',
      nextAction: 'Obtain written B2B partner approval, the vendor-issued endpoint and partner credentials, then validate search without booking; do not send outreach automatically.',
    },
    {
      providerName: 'Travelpayouts car-rental affiliate', serviceFamily: 'DRIVE', accountStatus: 'BLOCKED', testAccess: false,
      productionAccess: false, apiAccess: false, affiliateDeepLinkAccess: false, commercialApproval: 'No connected/approved car-rental program is evidenced',
      commissionRevenueModel: 'Program-specific affiliate terms required', checkoutMode: 'NONE', countriesCovered: 'Unknown until a program is approved',
      saudiCoverage: 'Not verified', egyptCoverage: 'Not verified',
      activationBlocker: 'Travelpayouts account/project, connected car-rental program approval, and an issued link/widget/API tool are required',
      owner: 'Commercial / Travel Supply',
      nextAction: 'Connect and obtain approval for a car-rental program in Travelpayouts, record its authorized tool and domains, then implement only that issued tool.',
    },
    {
      providerName: 'Ticketmaster Discovery', serviceFamily: 'CONCIERGE', accountStatus: ticketmaster ? 'CONFIGURED' : 'BLOCKED', testAccess: false,
      productionAccess: ticketmaster, apiAccess: ticketmaster, affiliateDeepLinkAccess: ticketmaster, commercialApproval: 'Official Discovery API/deep link only',
      commissionRevenueModel: 'External provider checkout; revenue terms not encoded', checkoutMode: ticketmaster ? 'PROVIDER_CHECKOUT' : 'NONE',
      countriesCovered: 'Discovery API country search', saudiCoverage: 'SA official event search', egyptCoverage: 'Not enabled in launch query',
      activationBlocker: ticketmaster
        ? 'None for source-authoritative Discovery API handoff; affiliate commission still requires separate program approval'
        : 'Ticketmaster developer application Consumer Key is required as TICKETMASTER_API_KEY or TICKETMASTER_CONSUMER_KEY',
      owner: 'Marketplace Engineering',
      nextAction: ticketmaster
        ? 'Validate Saudi results and official handoff; add affiliate tracking only after separate affiliate approval.'
        : 'Register/sign in to the Ticketmaster Developer Portal, create the default application, and add its Consumer Key to Preview and Production server environments.',
    },
    {
      providerName: 'Viator Basic', serviceFamily: 'CONCIERGE', accountStatus: viator ? 'CONFIGURED' : 'NOT_APPROVED', testAccess: viator,
      productionAccess: false, apiAccess: viator, affiliateDeepLinkAccess: false, commercialApproval: 'Booking/merchant capability not approved',
      commissionRevenueModel: 'Vendor activation required', checkoutMode: 'NONE', countriesCovered: 'Taxonomy adapter only until entitlement',
      saudiCoverage: 'Not authorized for launch', egyptCoverage: 'Not authorized for launch',
      activationBlocker: 'Approved Viator affiliate/content API partnership and VIATOR_API_KEY are required; merchant booking entitlement is separate',
      owner: 'Commercial / Travel Supply', nextAction: 'Obtain affiliate/content API approval and an API key; keep booking/cancellation disabled unless merchant entitlement is separately approved.',
    },
    {
      providerName: 'Verified local/manual partners', serviceFamily: 'VIP', accountStatus: 'ACTIVE', testAccess: true, productionAccess: true,
      apiAccess: false, affiliateDeepLinkAccess: false, commercialApproval: 'Per verified partner record', commissionRevenueModel: 'Manual request fulfilment',
      checkoutMode: 'REQUEST_TO_CONFIRM', countriesCovered: 'Partner-specific', saudiCoverage: 'Inventory-dependent', egyptCoverage: 'Inventory-dependent',
      activationBlocker: 'Unverified synthetic fixture remains isolated', owner: 'VIP Operations', nextAction: 'Publish only verified partner inventory.',
    },
  ];
}
