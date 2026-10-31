import { assertAllowedNetworkUrl } from '../../../shared/security/networkPolicy.js';
export function parseCoordinates(value) {
  const coords = Array.isArray(value) ? value : String(value || '').split(',').map(part => part.trim() === '' ? NaN : Number(part));
  return coords.length === 2 && coords.every(Number.isFinite) && Math.abs(coords[0]) <= 90 && Math.abs(coords[1]) <= 180 ? coords : null;
}
export async function calculateRoadRoute(origin, stops, request = fetch) {
  const points = [origin, ...stops.map(stop => parseCoordinates(stop.locationCoordinates))];
  if (points.length < 2 || points.length > 26 || points.some(point => !parseCoordinates(point))) throw new Error('Cần vị trí hiện tại, tọa độ NPP hợp lệ; tối đa 25 điểm.');
  const path = points.map(([lat,lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=false&steps=false`;
  assertAllowedNetworkUrl(url, { allowExternal: true });
  const response = await request(url, { signal: AbortSignal.timeout(20000), credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Dịch vụ tính đường không phản hồi. Hãy thử Google Maps.');
  const result = await response.json();
  const route = result.routes?.[0];
  if (result.code !== 'Ok' || !route || route.legs?.length !== stops.length || !Number.isFinite(route.distance) || !Number.isFinite(route.duration) || route.legs.some(leg => !Number.isFinite(leg.distance) || !Number.isFinite(leg.duration))) throw new Error('Không tìm được tuyến ô tô hợp lệ.');
  let distance = 0, duration = 0;
  return { km: route.distance / 1000, minutes: route.duration / 60, legs: route.legs.map((leg,index) => {
    distance += leg.distance; duration += leg.duration;
    return { id: stops[index].id, name: stops[index].name, km: leg.distance / 1000, minutes: leg.duration / 60, cumulativeKm: distance / 1000, cumulativeMinutes: duration / 60 };
  }) };
}
