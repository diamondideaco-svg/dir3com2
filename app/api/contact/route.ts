import { NextRequest, NextResponse } from 'next/server';
import { sanitizeMessage, sanitizeText } from '@/lib/security/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, subject, message } = body;

    const sanitizedName = sanitizeText(name, '');
    const sanitizedEmail = sanitizeText(email, '');
    const sanitizedPhone = sanitizeText(phone, '');
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

    console.log('Received:', { name: sanitizedName, email: sanitizedEmail, phone: sanitizedPhone, subject: sanitizedSubject, message: sanitizedMessage });

    return NextResponse.json(
      { message: 'تم إرسال الرسالة بنجاح' },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: 'حدث خطأ في الخادم' },
      { status: 500 }
    );
  }
}