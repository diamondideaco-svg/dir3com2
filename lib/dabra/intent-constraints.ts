/** Strip only explicit negative execution constraints, not payment/support questions.
 * Input is normalized by normalizePlatformQuery. This changes classification only;
 * no intent can execute a transaction or grant permission.
 */
export function withoutNegativeActions(text: string) {
  const action = '(?:book(?:ing)?|pay(?:ment)?|cancel(?:lation)?|refund)';
  const arabic = '(?:حجز|دفع|الغاء|استرداد|تحجز|تدفع|تلغي|احجز|ادفع)';
  return text
    .replace(new RegExp(`\\b(?:do not|don't|dont|never|without)\\s+${action}(?:\\s*(?:or|and|/)\\s*${action})*\\b`, 'g'), ' ')
    .replace(new RegExp(`(?:^|\\s)(?:لا|بدون|دون)\\s+${arabic}(?:\\s*(?:او|ولا|و|/)\\s*${arabic})*(?=\\s|[.!؟،,؛;]|$)`, 'g'), ' ');
}
