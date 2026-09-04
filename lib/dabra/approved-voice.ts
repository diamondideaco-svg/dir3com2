export const DABRA_APPROVED_VOICE = Object.freeze({
  design: 'DABRA Voice Design V1',
  sourceFile: 'DABRA_VOICE_MASTER_V1.mp3',
  sha256: '4AA9AFA4EDDF369FE79E8F597946766C6FBDD8C789DE199DE9A5253EBFE044FB',
  dynamicEngine: 'missing' as const,
  browserSpeechAllowed: false,
});

export function getApprovedDabraVoiceCopy(language: 'ar' | 'en') {
  return language === 'ar'
    ? {
        title: 'صوت الدبرة المعتمد غير متاح حاليًا',
        detail: 'يمكنك الكتابة أو استخدام الميكروفون للإدخال. لن نستبدل صوت الدبرة بصوت الجهاز.',
      }
    : {
        title: 'The approved DABRA voice is currently unavailable',
        detail: 'You can type or use the microphone for input. DABRA will not use a device voice as a substitute.',
      };
}
