/** Task #147 legacy offers + Task #167 approved Operations rates. Not live availability. */
import september from './september-catalog.json';
export const DRIVE_CATALOG_VERSION = september.version;
export const LEGACY_DRIVE_CATALOG_VERSION = 'safeerat-eg-20260916-v1';
export const DRIVE_COUNTRY = 'EG';
export const DRIVE_TIME_ZONE = 'Africa/Cairo';
export const DRIVE_CURRENCIES = ['EGP', 'USD', 'SAR', 'EUR', 'AED'] as const;
export const LEGACY_DRIVE_MODEL_YEARS = [2025, 2026, 2027] as const;
export const DRIVE_MIN_MODEL_YEAR = null; // CEO accepts all source years, including unspecified.
export function validDriveModelYear(year: number | null) {
  return year === null || (Number.isInteger(year) && year >= 1000 && year <= 9999);
}
/** An old client's identical retry must retain its original request contract. */
export function driveRequestModelYears(catalogVersion: unknown): readonly number[] | null {
  if (catalogVersion === DRIVE_CATALOG_VERSION) return null;
  if (catalogVersion === 'managed-eg-20260928-v2') return [2022,2023,2024,2025,2026,2027];
  return LEGACY_DRIVE_MODEL_YEARS;
}
export type DriveCurrency = typeof DRIVE_CURRENCIES[number];
export type DriveMode = 'airport' | 'chauffeur';
export type VehicleClass = 'Economy' | 'Sedan' | 'SUV' | 'Luxury' | 'Premium SUV' | 'Other';
export type VehicleMaster = {
  id: string; make: string; model: string; ar: string; en: string;
  vehicleClass: VehicleClass; body: 'sedan' | 'suv' | 'mpv' | 'unknown'; modelYears?: readonly number[] | null; year: number | null; trim: string | null;
  passengers: number | null; luggage: number | null; doors: number | null; airConditioning: boolean | null;
  image: string; exactModelGuaranteed: boolean;
};
const master = (id: string, make: string, model: string, ar: string, vehicleClass: VehicleClass, body: VehicleMaster['body'], year: number | null = null, trim: string | null = null): VehicleMaster => ({
  id, make, model, ar, en: `${make} ${model}${year ? ` ${year}` : ''}${trim ? ` ${trim}` : ''}`,
  vehicleClass, body, year, trim, passengers: null, luggage: null, doors: null, airConditioning: null,
  image: `/vehicles/${id}.webp`, exactModelGuaranteed: false, modelYears: LEGACY_DRIVE_MODEL_YEARS,
});
const legacyVehicles: readonly VehicleMaster[] = [
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
  id: string; vehicleId: string; supplierId: 'safeerat-al-arab' | 'egypt-operations'; country: 'EG'; version: string; dailyPeriodHours: 24 | null;
  currency: DriveCurrency; airport: number | null; chauffeur: number;
  availability: 'request_to_confirm'; chauffeurIncluded: true; includedKm: 120; fuelIncluded: true;
};
const rates = [[100, 200, 'USD'], [50, 100, 'USD'], [50, 100, 'USD'], [900, 1800, 'EGP'],
  [1500, 3500, 'EGP'], [80, 150, 'USD'], [200, 350, 'USD'], [250, 450, 'USD'], [null, 550, 'USD']] as const;
const legacyOffers: readonly DriveOffer[] = legacyVehicles.map((vehicle, index) => ({
  id: `safeerat-eg-${vehicle.id}`, vehicleId: vehicle.id, supplierId: 'safeerat-al-arab', country: 'EG',
  version: DRIVE_CATALOG_VERSION, dailyPeriodHours: null,
  airport: rates[index][0], chauffeur: rates[index][1], currency: rates[index][2],
  availability: 'request_to_confirm', chauffeurIncluded: true, includedKm: 120, fuelIncluded: true,
}));

const updatedVehicles: readonly VehicleMaster[] = september.rows.map(row => ({
  ...master(row.vehicleId, row.make, row.model, row.ar, row.vehicleClass as VehicleClass, row.body as VehicleMaster['body']),
  modelYears: row.modelYears, image: row.image,
}));
export const VEHICLE_MASTER: readonly VehicleMaster[] = [
  ...legacyVehicles.map(v => updatedVehicles.find(u => u.id === v.id) ?? v),
  ...updatedVehicles.filter(v => !legacyVehicles.some(old => old.id === v.id)),
];
const updatedOffers: readonly DriveOffer[] = september.rows.map(row => ({
  id: row.offerId, vehicleId: row.vehicleId, supplierId: 'egypt-operations', country: 'EG',
  version: DRIVE_CATALOG_VERSION, dailyPeriodHours: 24, currency: 'USD',
  airport: row.airportCents / 100, chauffeur: row.dailyCents / 100,
  availability: 'request_to_confirm', chauffeurIncluded: true, includedKm: 120, fuelIncluded: true,
}));
export const DRIVE_OFFERS: readonly DriveOffer[] = [
  ...legacyOffers.map(v => updatedOffers.find(u => u.id === v.id) ?? v),
  ...updatedOffers.filter(v => !legacyOffers.some(old => old.id === v.id)),
];

export function driveOffer(id: unknown) { return DRIVE_OFFERS.find(offer => offer.id === id); }
export function vehicleFor(offer: DriveOffer) { return VEHICLE_MASTER.find(vehicle => vehicle.id === offer.vehicleId)!; }
export function vehicleTitle(vehicle: VehicleMaster, language: 'ar' | 'en') {
  return vehicle[language] + (vehicle.exactModelGuaranteed ? '' : language === 'ar' ? ' أو ما يماثلها' : ' or similar');
}
export function vehicleClassLabel(value: VehicleClass, language: 'ar' | 'en') {
  const ar: Record<VehicleClass, string> = { Economy: 'اقتصادية', Sedan: 'سيدان', SUV: 'رياضية متعددة الاستخدامات', Luxury: 'فاخرة', 'Premium SUV': 'رياضية فاخرة متعددة الاستخدامات', Other: 'التفاصيل تؤكدها العمليات' };
  return language === 'ar' ? ar[value] : value;
}
export function vehicleYearAvailabilityLabel(language: 'ar' | 'en', vehicle?: Pick<VehicleMaster, 'modelYears'>) {
  const years = (vehicle?.modelYears ?? []).join(' / ');
  if (!years) return language === 'ar' ? 'سنة الموديل حسب التوفر — تؤكدها العمليات' : 'Model year subject to availability — confirmed by Operations';
  return language === 'ar' ? `موديل ${years} — حسب التوفر أو ما يماثلها` : `Model year ${years} — subject to availability or similar`;
}
export function supplierRate(offer: DriveOffer, mode: DriveMode) { return offer[mode]; }
/** The rate sheet does not define extra-distance, daily rounding or return-transfer pricing. */
export function journeyPrice(offer: DriveOffer, mode: DriveMode) {
  return { baseAmount: supplierRate(offer, mode), currency: offer.currency, unit: mode === 'chauffeur' ? 'day' as const : 'transfer' as const, dailyPeriodHours: mode === 'chauffeur' ? offer.dailyPeriodHours : null, total: null, finalTotalRequired: true as const };
}
