import { apiUrl } from './clientApi';
export interface RouteInfo { travelMinutes: number; distanceKm: number }
type CachedRoute = { destination: string; route: RouteInfo; updatedAt: Date };
let cachedRoute: CachedRoute | null = null;
export function getCachedTravelInfo(): RouteInfo | null { return cachedRoute?.route ?? null; }
export function getLastTravelUpdate(): Date | null { return cachedRoute?.updatedAt ?? null; }
async function refreshTravelInfo(destination: string): Promise<RouteInfo> {
  const response = await fetch(apiUrl('/api/travel/route'), { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destination }) });
  if (!response.ok) throw new Error('Travel information unavailable.');
  const route = await response.json() as RouteInfo;
  cachedRoute = { destination, route, updatedAt: new Date() };
  return route;
}
export async function refreshTravelInfoIfNeeded(destination: string, leaveTime: Date): Promise<RouteInfo> {
  const now = Date.now();
  const minutesUntilLeave = (leaveTime.getTime() - now) / 60000;
  const refreshInterval = minutesUntilLeave <= 10 ? 1 : minutesUntilLeave <= 30 ? 5 : minutesUntilLeave <= 60 ? 10 : minutesUntilLeave <= 180 ? 30 : 60;
  if (cachedRoute?.destination === destination && (now - cachedRoute.updatedAt.getTime()) / 60000 < refreshInterval) return cachedRoute.route;
  return refreshTravelInfo(destination);
}
