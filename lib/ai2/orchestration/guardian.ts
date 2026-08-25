import { assertOwnerScope, sanitizeUntrustedText } from './security';
import type { GuardianEvent, GuardianGuidance } from './types';

export function processGuardianEvent(scope: { ownerId: string; tenantId: string }, event: GuardianEvent, language: 'ar' | 'en' = 'en'): GuardianGuidance {
  assertOwnerScope(scope, event);
  const summary = sanitizeUntrustedText(event.summary, 240);
  const severity = event.type === 'service_issue' ? 'urgent' : event.type === 'flight_change' || event.type === 'booking_change' ? 'attention' : 'info';
  const prefix = language === 'ar' ? 'تحديث الرحلة' : 'Trip update';
  const verification = event.verified ? '' : language === 'ar' ? ' (بانتظار التحقق)' : ' (verification pending)';
  return { eventId: event.id, severity, message: `${prefix}: ${summary}${verification}`, liveMonitoringActive: false, suggestedActions: severity === 'urgent' ? [language === 'ar' ? 'طلب دعم بشري' : 'Request human support'] : [language === 'ar' ? 'مراجعة تفاصيل الرحلة' : 'Review trip details'] };
}
