export type DabraViewport = { left: number; top: number; width: number; height: number };
export type DabraObstacle = { left: number; right: number; top: number; bottom: number };
export type DabraDockPreference = { side: 'left' | 'right'; bottomGap: number };

// Keep the optional launcher off real controls. When the visible viewport has no
// safe slot, temporarily hide it; the canonical /dabra navigation stays available.
export function placeDabraLauncher(input: {
  language: 'ar' | 'en';
  viewport: DabraViewport;
  width: number;
  height: number;
  obstacles: DabraObstacle[];
  preference?: DabraDockPreference | null;
}): { x: number; y: number; visible: boolean } {
  const { viewport, width, height, obstacles } = input;
  const margin = 12;
  const gap = 8;
  const side = input.preference?.side ?? (input.language === 'ar' ? 'left' : 'right');
  const x = side === 'left' ? viewport.left + margin : viewport.left + viewport.width - width - margin;
  const minY = viewport.top + 84;
  const maxY = viewport.top + viewport.height - height - margin;
  if (width + margin * 2 > viewport.width || minY > maxY) return { x, y: minY, visible: false };
  const preferredY = Math.max(minY, Math.min(maxY, viewport.top + viewport.height - height - (input.preference?.bottomGap ?? 68)));
  const relevant = obstacles.filter(r => r.right + gap > x && r.left - gap < x + width && r.bottom > viewport.top && r.top < viewport.top + viewport.height);
  const candidates = [preferredY, maxY, minY, ...relevant.flatMap(r => [r.top - height - gap, r.bottom + gap])]
    .filter(y => Number.isFinite(y) && y >= minY && y <= maxY)
    .sort((a, b) => Math.abs(a - preferredY) - Math.abs(b - preferredY));
  const safeY = candidates.find(y => relevant.every(r => y + height <= r.top - gap || y >= r.bottom + gap));
  return { x, y: safeY ?? preferredY, visible: safeY !== undefined };
}
