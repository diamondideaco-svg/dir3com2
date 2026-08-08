import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createServerClient as createSupabaseServerClientBase } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

function isValidSupabaseUrl(value: string) {
  return Boolean(value) && /^https?:\/\//i.test(value) && !value.includes('...');
}

function isValidSupabaseKey(value: string) {
  return Boolean(value) && value.length > 10 && !value.includes('...');
}

function getServerSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? '';
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';

  if (!isValidSupabaseUrl(supabaseUrl) || !isValidSupabaseKey(supabaseServiceRoleKey)) {
    throw new Error('Missing or invalid SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return { supabaseUrl, supabaseServiceRoleKey };
}

function getPublicSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

  if (!isValidSupabaseUrl(supabaseUrl) || !isValidSupabaseKey(supabaseAnonKey)) {
    throw new Error('Missing or invalid NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return { supabaseUrl, supabaseAnonKey };
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization')?.trim() ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

function createSupabaseBearerClient(accessToken: string): SupabaseClient {
  const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function createSupabaseAdminClient() {
  try {
    const { supabaseUrl, supabaseServiceRoleKey } = getServerSupabaseConfig();

    return createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch {
    return null;
  }
}

export const supabaseAdmin = createSupabaseAdminClient();

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { supabaseUrl: publicUrl, supabaseAnonKey } = getPublicSupabaseConfig();

  return createSupabaseServerClientBase(publicUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        // In Next.js Server Component rendering, mutating cookies can throw.
        // Route handlers/server actions still support writes normally.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Swallow write failures in read-only render contexts.
        }
      },
    },
  }) as unknown as SupabaseClient;
}

export async function createSupabaseRequestClient(request: NextRequest): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const bearerToken = getBearerToken(request);

  if (bearerToken) {
    const supabase = createSupabaseBearerClient(bearerToken);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(bearerToken);

    if (error || !user) {
      return null;
    }

    return { supabase, user };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { supabase, user };
}
