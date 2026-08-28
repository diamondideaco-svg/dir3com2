export function normalizeStayRooms(value: unknown): number {
  const rooms = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(rooms) && rooms >= 1 ? rooms : 1;
}
