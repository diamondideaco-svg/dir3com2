// src/app/auth/signin/page.tsx
'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getPostLoginDestination } from '@/lib/auth/redirect';

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInRedirect />
    </Suspense>
  );
}

function SignInRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? searchParams.get('next');

  useEffect(() => {
    const destination = getPostLoginDestination(redirectTo, window.location.origin);
    const encoded = encodeURIComponent(destination);
    const target = `/login?redirect=${encoded}&next=${encoded}`;
    router.replace(target);
  }, [redirectTo, router]);

  return null;
}
