'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { Chrome, type Viewer } from './Chrome';

// Presentation breakpoint only. It never decides identity or authorization.
const query = '(min-width:1051px)';
const serverSnapshot = () => false;
const desktopSnapshot = () => window.matchMedia(query).matches;
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useProfileDesktop() {
  return useSyncExternalStore(subscribe, desktopSnapshot, serverSnapshot);
}

// Reuse the approved shell on phones; the existing tablet branch is unchanged.
const reviewQuery = '(max-width:720px), (min-width:1051px)';
const reviewSnapshot = () => window.matchMedia(reviewQuery).matches;
function subscribeReview(onChange: () => void) {
  const media = window.matchMedia(reviewQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
export function useCustomerReviewLayout() {
  return useSyncExternalStore(subscribeReview, reviewSnapshot, serverSnapshot);
}

export function ProfileDesktopFrame({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  const desktop = useCustomerReviewLayout();
  return desktop ? <Chrome viewer={viewer}>{children}</Chrome> : <>{children}</>;
}
