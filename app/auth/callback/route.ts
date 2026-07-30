// src/app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPostLoginDestination } from '@/lib/auth/redirect';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = getPostLoginDestination(searchParams.get('next'), origin);
    const flowId = searchParams.get('sb_flow_id');

    if (!code) {
        return NextResponse.redirect(`${origin}/login?error=no_code`);
    }

    try {
        const supabase = await createSupabaseServerClient();

        const { data, error } = await supabase.auth.exchangeCodeForSession(
            code,
            flowId ? { flowId } : undefined,
        );
        if (error) {
            console.error('❌ Exchange error:', error);
            return NextResponse.redirect(`${origin}/login?error=${error.message}`);
        }

        // ✅ ✅ ✅ إضافة المستخدم إلى جدول users (إن لم يكن موجوداً)
        if (data?.user) {
            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('id', data.user.id)
                .single();

            if (!existingUser) {
                // إنشاء سجل جديد في جدول users
                await supabase.from('users').insert({
                    id: data.user.id,
                    email: data.user.email,
                    full_name_ar: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || '',
                    role: 'client',
                    phone: '', // فارغ – سيُطلب من المستخدم إدخاله لاحقاً
                });
                console.log('✅ New user created in users table:', data.user.email);
            } else {
                // تحديث البريد الإلكتروني والاسم (في حالة تغيره)
                await supabase
                    .from('users')
                    .update({
                        email: data.user.email,
                        full_name_ar: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || '',
                    })
                    .eq('id', data.user.id);
                console.log('✅ User updated in users table:', data.user.email);
            }
        }

        return NextResponse.redirect(`${origin}${next}`);
    } catch (err) {
        console.error('❌ Unexpected error:', err);
        return NextResponse.redirect(`${origin}/login?error=server_error`);
    }
}
