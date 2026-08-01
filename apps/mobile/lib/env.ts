type PublicMobileEnv = {
  apiBaseUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function getMobileEnv(): PublicMobileEnv {
  const apiBaseUrl = read('EXPO_PUBLIC_API_BASE_URL') ?? 'http://localhost:3001';

  return {
    apiBaseUrl,
    supabaseUrl: read('EXPO_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: read('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  };
}

export function getRequiredMobileSupabaseEnv() {
  const env = getMobileEnv();

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error('Missing required mobile Supabase public configuration.');
  }

  return {
    supabaseUrl: env.supabaseUrl,
    supabaseAnonKey: env.supabaseAnonKey,
  };
}
