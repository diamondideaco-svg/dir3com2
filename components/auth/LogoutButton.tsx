'use client';

import { useState } from 'react';
import { FiLogOut } from 'react-icons/fi';
import { supabase } from '@/lib/supabase/client';

type LogoutButtonProps = {
  className?: string;
  label: string;
};

export default function LogoutButton({ className, label }: LogoutButtonProps) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);

    await fetch('/api/auth/logout', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
    }).catch(() => null);
    await supabase.auth.signOut({ scope: 'local' });

    const identityResponse = await fetch('/api/auth/session-identity', {
      cache: 'no-store',
      credentials: 'same-origin',
    }).catch(() => null);
    const identity = identityResponse?.ok
      ? await identityResponse.json() as { authenticated?: boolean }
      : null;

    if (identity?.authenticated) {
      window.location.reload();
      return;
    }

    window.location.replace('/login');
  }

  return (
    <button type="button" onClick={handleLogout} disabled={loggingOut} className={className}>
      <FiLogOut />
      {label}
    </button>
  );
}
