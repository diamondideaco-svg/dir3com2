export type SessionStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'error';

export type SessionSnapshot = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  user: {
    id: string;
    email?: string;
  };
} | null;
