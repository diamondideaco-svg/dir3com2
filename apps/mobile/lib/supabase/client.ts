import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { getRequiredMobileSupabaseEnv } from '@/lib/env';

type MobileSupabaseStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const secureStoreAdapter: MobileSupabaseStorage = {
  async getItem(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    await SecureStore.deleteItemAsync(key);
  },
};

let singleton: SupabaseClient | null = null;

export function getMobileSupabaseClient(): SupabaseClient {
  if (singleton) {
    return singleton;
  }

  const { supabaseUrl, supabaseAnonKey } = getRequiredMobileSupabaseEnv();

  singleton = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: secureStoreAdapter,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });

  return singleton;
}

export function mapSessionSnapshot(session: Session | null) {
  if (!session) {
    return null;
  }

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    user: {
      id: session.user.id,
      email: session.user.email,
    },
  };
}
