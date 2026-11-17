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

export function distanceKm(from, to) {
  const a = parseCoordinates(from), b = parseCoordinates(to);
  if (!a || !b) return null;
  const radians = value => value * Math.PI / 180;
  const h = Math.sin(radians(b[0] - a[0]) / 2) ** 2
    + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(radians(b[1] - a[1]) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function routeIdentity(origin, stops) {
  return JSON.stringify([parseCoordinates(origin), stops.map(stop => [stop.id, parseCoordinates(stop.locationCoordinates)]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
}

export function validRoadMatrix(matrix, origin, stops) {
  const size = stops.length + 1;
  return Boolean(parseCoordinates(origin)) && stops.length > 0 && stops.length <= 25
    && stops.every(stop => parseCoordinates(stop.locationCoordinates))
    && matrix?.key === routeIdentity(origin, stops) && matrix.ids?.length === stops.length
    && new Set(matrix.ids).size === stops.length && stops.every(stop => matrix.ids.includes(stop.id))
    && ['distances', 'durations'].every(key => Array.isArray(matrix[key]) && matrix[key].length === size
      && matrix[key].every(row => Array.isArray(row) && row.length === size && row.every(value => value === null || Number.isFinite(value) && value >= 0)));
}

export async function calculateRoadMatrix(origin, stops, request = fetch) {
  const points = [parseCoordinates(origin), ...stops.map(stop => parseCoordinates(stop.locationCoordinates))];
  if (!stops.length || stops.length > 25 || points.some(point => !point)) throw new Error('Cần GPS và tọa độ hợp lệ của từng NPP; tối đa 25 NPP mỗi tuyến.');
  const path = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${path}?annotations=distance,duration`;
  assertAllowedNetworkUrl(url, { allowExternal: true });
  const response = await request(url, { signal: AbortSignal.timeout(15000), credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Chưa tải được đường đi. Đang giữ khoảng cách ước tính trên thiết bị.');
  const payload = await response.json();
  const matrix = { key: routeIdentity(origin, stops), ids: stops.map(stop => stop.id), distances: payload.distances, durations: payload.durations, savedAt: Date.now() };
  if (payload.code !== 'Ok' || !validRoadMatrix(matrix, origin, stops)) throw new Error('Dịch vụ trả về khoảng cách không hợp lệ. Hãy thử lại.');
  return matrix;
}

export function buildRoutePlan(origin, stops, matrix = null) {
  const road = validRoadMatrix(matrix, origin, stops);
  let previous = origin, previousIndex = 0, cumulativeKm = 0, cumulativeMinutes = road ? 0 : null;
  const legs = stops.map(stop => {
    const point = parseCoordinates(stop.locationCoordinates);
    const index = road ? matrix.ids.indexOf(stop.id) + 1 : 0;
    const km = road ? matrix.distances[previousIndex][index] === null ? null : matrix.distances[previousIndex][index] / 1000 : distanceKm(previous, point);
    const directKm = road ? matrix.distances[0][index] === null ? null : matrix.distances[0][index] / 1000 : distanceKm(origin, point);
    const minutes = road && matrix.durations[previousIndex][index] !== null ? matrix.durations[previousIndex][index] / 60 : null;
    cumulativeKm = km === null || cumulativeKm === null ? null : cumulativeKm + km;
    cumulativeMinutes = minutes === null || cumulativeMinutes === null ? null : cumulativeMinutes + minutes;
    previous = point; previousIndex = index;
    return { id: stop.id, name: stop.name, km, directKm, minutes, cumulativeKm, cumulativeMinutes };
  });
  return { road, legs, km: legs.length ? cumulativeKm : null, minutes: cumulativeMinutes };
}

export function suggestRouteOrder(origin, stops, matrix = null) {
  if (!parseCoordinates(origin) || stops.some(stop => !parseCoordinates(stop.locationCoordinates))) throw new Error('Cần lấy vị trí hiện tại và bổ sung tọa độ cho tất cả NPP trước khi sắp xếp.');
  if (stops.length > 25) throw new Error('Mỗi tuyến tối đa 25 NPP.');
  const road = validRoadMatrix(matrix, origin, stops);
  const cost = (from, to) => {
    if (!road) return distanceKm(from ? from.locationCoordinates : origin, to.locationCoordinates);
    const value = matrix.distances[from ? matrix.ids.indexOf(from.id) + 1 : 0][matrix.ids.indexOf(to.id) + 1];
    return value === null ? Infinity : value / 1000;
  };
  const total = rows => rows.reduce((sum, row, index) => sum + cost(index ? rows[index - 1] : null, row), 0);
  const remaining = [...stops], nearest = [];
  while (remaining.length) {
    const from = nearest.at(-1) || null;
    let best = 0;
    for (let i = 1; i < remaining.length; i++) if (cost(from, remaining[i]) < cost(from, remaining[best])) best = i;
    nearest.push(remaining.splice(best, 1)[0]);
  }
  let result = total(nearest) < total(stops) ? nearest : [...stops];
  // Bounded local search also handles asymmetric road distances. No fixed endpoint.
  for (let pass = 0; pass < 10; pass++) {
    let improved = false;
    for (let a = 0; a < result.length - 1; a++) for (let b = a + 1; b < result.length; b++) {
      const candidate = [...result.slice(0, a), ...result.slice(a, b + 1).reverse(), ...result.slice(b + 1)];
      if (total(candidate) + 0.001 < total(result)) { result = candidate; improved = true; }
    }
    if (!improved) break;
  }
  if (!Number.isFinite(total(result))) throw new Error('Có chặng chưa tìm được đường đi. Hãy điều chỉnh các NPP trong tuyến.');
  return result;
}
