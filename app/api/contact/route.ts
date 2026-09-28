import { NextRequest, NextResponse } from 'next/server';
import { sanitizeMessage, sanitizeText } from '@/lib/security/validation';
import { logServerError, logServerEvent } from '@/lib/security/safe-logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, subject, message } = body;

    const sanitizedName = sanitizeText(name, '');
    const sanitizedEmail = sanitizeText(email, '');
    sanitizeText(phone, '');
    const sanitizedSubject = sanitizeText(subject, '');
    const sanitizedMessage = sanitizeMessage(message, '');

    if (!sanitizedName || !sanitizedEmail || !sanitizedSubject || !sanitizedMessage) {
      return NextResponse.json(
        { error: 'جميع الحقول المطلوبة يجب تعبئتها' },
        { status: 400 }
      );
    }

    if (!sanitizedEmail.includes('@') || !sanitizedEmail.includes('.')) {
      return NextResponse.json(
        { error: 'صيغة البريد الإلكتروني غير صالحة' },
        { status: 400 }
      );
    }

    // Validation is not delivery. No durable inbox or sender is connected yet.
    logServerEvent('api.contact.delivery_unavailable');

    return NextResponse.json(
      { code: 'CONTACT_DELIVERY_UNAVAILABLE', error: 'لم تُرسل رسالتك ولم تُحفظ. خدمة استقبال الرسائل غير متاحة حالياً؛ احتفظ بنص الرسالة.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logServerError('api.contact.request_failed', error);
    return NextResponse.json(
      { error: 'حدث خطأ في الخادم' },
      { status: 500 }
    );
  }
}
