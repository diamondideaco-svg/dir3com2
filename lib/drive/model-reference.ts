/** Manufacturer references are informational; they are not verified supplier-unit specifications. */
export type DriveModelReference = Readonly<{
  kind: 'manufacturer-model-reference';
  manufacturerUrl: string;
  market: string;
  luggageLitres?: number;
  airConditioning?: boolean;
  exampleSeatingConfigurations?: readonly number[];
}>;
const references: Readonly<Record<string, DriveModelReference>> = Object.freeze({
  'nissan-sunny': Object.freeze({ kind: 'manufacturer-model-reference', market: 'Egypt',
    manufacturerUrl: 'https://en.nissan.com.eg/vehicles/new/sunny/versions-and-specs.html', luggageLitres: 490, airConditioning: true }),
  'kia-carval': Object.freeze({ kind: 'manufacturer-model-reference', market: 'Malaysia',
    manufacturerUrl: 'https://www.kia.com/my/showroom/carnival-pe/features.html', exampleSeatingConfigurations: Object.freeze([7, 8]) }),
});
export function driveModelReference(vehicleId: string): DriveModelReference | null { return references[vehicleId] ?? null; }
export function driveModelReferenceCopy(vehicleId: string, locale: 'ar' | 'en'): string | null {
  if (vehicleId === 'nissan-sunny') return locale === 'ar'
    ? 'مرجع نيسان مصر لموديل صني يذكر صندوقاً بسعة 490 لتراً وتكييفاً؛ نسخة السيارة وعدد الحقائب يؤكدهما المورد.'
    : 'Nissan Egypt lists a 490-litre boot and air conditioning for the Sunny model; the supplier must confirm the vehicle version and number of bags.';
  if (vehicleId === 'kia-carval') return locale === 'ar'
    ? 'من أمثلة فئات كرنفال في مرجع كيا ما يحتوي على سبعة أو ثمانية مقاعد إجمالاً؛ نسخة سيارة المورد وعدد أماكن الضيوف غير مؤكدين.'
    : 'Kia lists examples of Carnival configurations with seven or eight total seats; the supplier vehicle version and guest capacity are unconfirmed.';
  return null;
}
