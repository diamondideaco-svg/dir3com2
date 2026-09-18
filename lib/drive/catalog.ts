/** Task #147, CEO-approved Safeerat Al Arab rate sheet. Not live availability. */
export const DRIVE_CATALOG_VERSION = 'safeerat-eg-20260916-v1';
export const DRIVE_COUNTRY = 'EG';
export const DRIVE_TIME_ZONE = 'Africa/Cairo';
export const DRIVE_CURRENCIES = ['EGP', 'USD', 'SAR', 'EUR', 'AED'] as const;
export const DRIVE_MODEL_YEARS = [2025, 2026, 2027] as const;
export const DRIVE_MIN_MODEL_YEAR = DRIVE_MODEL_YEARS[0];
export type DriveCurrency = typeof DRIVE_CURRENCIES[number];
export type DriveMode = 'airport' | 'chauffeur';
export type VehicleClass = 'Economy' | 'Sedan' | 'SUV' | 'Luxury' | 'Premium SUV';
export type VehicleMaster = {
  id: string; make: string; model: string; ar: string; en: string;
  vehicleClass: VehicleClass; body: 'sedan' | 'suv'; year: number | null; trim: string | null;
  passengers: number | null; luggage: number | null; doors: number | null; airConditioning: boolean | null;
  image: string; exactModelGuaranteed: boolean;
};
const master = (id: string, make: string, model: string, ar: string, vehicleClass: VehicleClass, body: 'sedan' | 'suv', year: number | null = null, trim: string | null = null): VehicleMaster => ({
  id, make, model, ar, en: `${make} ${model}${year ? ` ${year}` : ''}${trim ? ` ${trim}` : ''}`,
  vehicleClass, body, year, trim, passengers: null, luggage: null, doors: null, airConditioning: null,
  image: `/vehicles/${id === 'range-rover-2025' ? 'range-rover' : id}.webp`, exactModelGuaranteed: false,
});
export const VEHICLE_MASTER: readonly VehicleMaster[] = [
  master('mercedes-e200-amg', 'Mercedes-Benz', 'E 200', 'مرسيدس E 200 AMG Line', 'Luxury', 'sedan', null, 'AMG Line'),
  master('jetour-t2', 'Jetour', 'T2', 'جيتور T2', 'SUV', 'suv'),
  master('jetour-t1', 'Jetour', 'T1', 'جيتور T1', 'SUV', 'suv'),
  master('nissan-sunny', 'Nissan', 'Sunny', 'نيسان صني', 'Economy', 'sedan'),
  master('jetour-x90', 'Jetour', 'X90', 'جيتور X90', 'SUV', 'suv'),
  master('mercedes-e200', 'Mercedes-Benz', 'E 200', 'مرسيدس E 200', 'Luxury', 'sedan'),
  master('range-rover', 'Land Rover', 'Range Rover', 'رينج روفر', 'Premium SUV', 'suv'),
  master('range-rover-2025', 'Land Rover', 'Range Rover', 'رينج روفر 2025', 'Premium SUV', 'suv', 2025),
  master('mercedes-gclass', 'Mercedes-Benz', 'G-Class', 'مرسيدس G-Class', 'Premium SUV', 'suv'),
];
export type DriveOffer = {
  id: string; vehicleId: string; supplierId: 'safeerat-al-arab'; country: 'EG';
  currency: DriveCurrency; airport: number | null; chauffeur: number;
  availability: 'request_to_confirm'; chauffeurIncluded: true; includedKm: 120; fuelIncluded: true;
};
const rates = [[100, 200, 'USD'], [50, 100, 'USD'], [50, 100, 'USD'], [900, 1800, 'EGP'],
  [1500, 3500, 'EGP'], [80, 150, 'USD'], [200, 350, 'USD'], [250, 450, 'USD'], [null, 550, 'USD']] as const;
export const DRIVE_OFFERS: readonly DriveOffer[] = VEHICLE_MASTER.map((vehicle, index) => ({
  id: `safeerat-eg-${vehicle.id}`, vehicleId: vehicle.id, supplierId: 'safeerat-al-arab', country: 'EG',
  airport: rates[index][0], chauffeur: rates[index][1], currency: rates[index][2],
  availability: 'request_to_confirm', chauffeurIncluded: true, includedKm: 120, fuelIncluded: true,
}));
export function driveOffer(id: unknown) { return DRIVE_OFFERS.find(offer => offer.id === id); }
export function vehicleFor(offer: DriveOffer) { return VEHICLE_MASTER.find(vehicle => vehicle.id === offer.vehicleId)!; }
export function vehicleTitle(vehicle: VehicleMaster, language: 'ar' | 'en') {
  return vehicle[language] + (vehicle.exactModelGuaranteed ? '' : language === 'ar' ? ' أو ما يماثلها' : ' or similar');
}
export function vehicleClassLabel(value: VehicleClass, language: 'ar' | 'en') {
  const ar: Record<VehicleClass, string> = { Economy: 'اقتصادية', Sedan: 'سيدان', SUV: 'رياضية متعددة الاستخدامات', Luxury: 'فاخرة', 'Premium SUV': 'رياضية فاخرة متعددة الاستخدامات' };
  return language === 'ar' ? ar[value] : value;
}
export function vehicleYearAvailabilityLabel(language: 'ar' | 'en') {
  return language === 'ar' ? 'موديل 2025 / 2026 / 2027 — حسب التوفر أو ما يماثلها' : 'Model year 2025 / 2026 / 2027 — subject to availability or similar';
}
export function supplierRate(offer: DriveOffer, mode: DriveMode) { return offer[mode]; }
/** The rate sheet does not define extra-distance, daily rounding or return-transfer pricing. */
export function journeyPrice(offer: DriveOffer, mode: DriveMode) {
  return { baseAmount: supplierRate(offer, mode), currency: offer.currency, total: null, finalTotalRequired: true as const };
}
