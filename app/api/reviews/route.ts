// src/app/api/reviews/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/security/safe-logger';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            booking_id,
            score_matching,
            score_cleanliness,
            score_punctuality,
            score_behavior,
            score_extra,
            comment_ar,
            comment_en
        } = body;

        // التحقق من وجود booking_id
        if (!booking_id) {
            return NextResponse.json({ error: 'booking_id مطلوب' }, { status: 400 });
        }

        const supabase = await createSupabaseServerClient();

        // التحقق من أن المستخدم مسجل
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });
        }

        // التحقق من أن الحجز يخص هذا المستخدم
        const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', booking_id)
            .single();

        if (bookingError || !booking) {
            return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });
        }

        if (booking.user_id !== user.id) {
            return NextResponse.json({ error: 'لا يمكنك تقييم هذا الحجز' }, { status: 403 });
        }

        // التحقق من أن تاريخ المغادرة قد مضى
        const today = new Date();
        const departureDate = new Date(booking.departure_date);
        if (departureDate > today) {
            return NextResponse.json({ error: 'لا يمكن التقييم قبل انتهاء الرحلة' }, { status: 400 });
        }

        // التحقق من عدم وجود تقييم سابق
        const { data: existingReview } = await supabase
            .from('reviews')
            .select('id')
            .eq('booking_id', booking_id)
            .single();

        if (existingReview) {
            return NextResponse.json({ error: 'تم تقييم هذا الحجز مسبقاً' }, { status: 400 });
        }

        // ✅ حساب متوسط التقييم (مع التأكد من القيم الصحيحة)
        const scores = [score_matching, score_cleanliness, score_punctuality, score_behavior, score_extra];
        const validScores = scores.filter(s => s !== undefined && s !== null && !isNaN(s) && s >= 1 && s <= 10);
        let avgScore = 0;
        if (validScores.length > 0) {
            avgScore = validScores.reduce((a, b) => a + b, 0) / validScores.length;
        }

        // ✅ حساب التقييم بالنجوم (1-5)
        let rating = Math.round(avgScore / 2);
        if (rating < 1) rating = 1;
        if (rating > 5) rating = 5;

        // حساب الخصم (إذا كان المتوسط أقل من 8)
        let discountPercent = 0;
        if (avgScore < 8) {
            discountPercent = Math.round((10 - avgScore) * 10);
            if (discountPercent > 100) discountPercent = 100;
        }
        const discountAmount = booking.total_price ? (booking.total_price * discountPercent / 100) : 0;

        // ✅ إدراج التقييم
        const { data: review, error: insertError } = await supabase
            .from('reviews')
            .insert({
                booking_id,
                rating,
                score_matching: score_matching || null,
                score_cleanliness: score_cleanliness || null,
                score_punctuality: score_punctuality || null,
                score_behavior: score_behavior || null,
                score_extra: score_extra || null,
                comment_ar,
                comment_en,
            })
            .select()
            .single();

        if (insertError) {
            logServerError('api.reviews.insert_failed', insertError);
            return NextResponse.json({ error: 'فشل حفظ التقييم حالياً' }, { status: 500 });
        }

        // تحديث الحجز بقيمة الخصم (إذا كان هناك خصم)
        if (discountAmount > 0) {
            const { error: updateError } = await supabase
                .from('bookings')
                .update({ discount_amount: discountAmount })
                .eq('id', booking_id);

            if (updateError) {
                logServerError('api.reviews.discount_update_failed', updateError);
                // لا نوقف العملية، نكتفي بتسجيل الخطأ
            }
        }

        return NextResponse.json({
            success: true,
            review,
            discount_applied: discountAmount,
            discount_percent: discountPercent,
            avg_score: avgScore,
            rating
        });

    } catch (error) {
        logServerError('api.reviews.unexpected_error', error);
        return NextResponse.json({ error: 'خطأ داخلي في الخادم' }, { status: 500 });
    }
}