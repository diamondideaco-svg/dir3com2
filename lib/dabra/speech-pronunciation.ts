export type DabraSpeechLanguage = 'ar' | 'en' | `ar-${string}` | `en-${string}`;

const DABRA_BRAND_SPOKEN_VARIANTS = [
  /\bD\s*[-.]?\s*I\s*[-.]?\s*R\s*[-.]?\s*3\s*[-.]?\s*C\s*[-.]?\s*O\s*[-.]?\s*M\b/gi,
  /\bdir\s*(?:3|three)\s*com\b/gi,
  /\bthree\s*com\b/gi,
  /دير\s*ثري\s*كوم/g,
  /دي\s*آر\s*ثري\s*كوم/g,
];

/** Keeps the rendered answer intact while making the DIR3COM brand pronounceable by TTS. */
export function normalizeDabraSpeechText(text: string, language: DabraSpeechLanguage) {
  const spokenBrand = language.toLowerCase().startsWith('ar') ? 'درعكم' : 'Dirakom';
  return DABRA_BRAND_SPOKEN_VARIANTS.reduce(
    (normalized, variant) => normalized.replace(variant, spokenBrand),
    text,
  );
}
