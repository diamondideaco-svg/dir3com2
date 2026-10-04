import { DRIVE_CATALOG_VERSION, DRIVE_OFFERS, vehicleFor, journeyPrice } from './catalog';

/** Projection of the already-public catalogue; no inventory or trip-date confirmation. */
export function publicDriveCatalog() {
  const offers = DRIVE_OFFERS.map(offer => {
    const vehicle = vehicleFor(offer);
    return {
      id: offer.id, vehicleId: offer.vehicleId, supplierId: offer.supplierId, country: offer.country,
      version: offer.version, currency: offer.currency, availability: offer.availability,
      vehicle: {id: vehicle.id, ar: vehicle.ar, en: vehicle.en, exactModelGuaranteed: vehicle.exactModelGuaranteed},
      price: journeyPrice(offer, 'chauffeur'), airportPrice: journeyPrice(offer, 'airport'),
    };
  });
  return {offers, country: 'EG', timezone: 'Africa/Cairo', total: offers.length,
    source: 'DIR3COM_PUBLISHED_DRIVE_CATALOG', catalogVersion: DRIVE_CATALOG_VERSION,
    verifiedAvailability: false, dateAvailabilityVerified: false, cityAvailabilityVerified: false};
}
