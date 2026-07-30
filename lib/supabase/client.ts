import { createBrowserClient } from '@supabase/ssr';

function isValidSupabaseUrl(value: string) {
  return Boolean(value) && /^https?:\/\//i.test(value) && !value.includes('...');
}

function isValidSupabaseKey(value: string) {
  return Boolean(value) && value.length > 10 && !value.includes('...');
}

function getBrowserSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

  if (!isValidSupabaseUrl(supabaseUrl) || !isValidSupabaseKey(supabaseAnonKey)) {
    throw new Error('Missing or invalid NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return { supabaseUrl, supabaseAnonKey };
}

const { supabaseUrl, supabaseAnonKey } = getBrowserSupabaseConfig();

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
