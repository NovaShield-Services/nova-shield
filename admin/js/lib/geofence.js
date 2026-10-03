/** Pure geometry, deliberately kept apart from native.js's device-facing
 *  getDevicePosition() -- this file never touches the GPS itself, so its
 *  distance math is trivial to unit-test with plain numbers, and callers
 *  that already have a position (e.g. one fix reused across every visit on
 *  today's schedule, rather than one fix per job) don't need a second
 *  plugin call just to ask "how far is that?". */

export const ARRIVAL_RADIUS_METERS = 100;

const EARTH_RADIUS_METERS = 6371000;

/** Great-circle (haversine) distance between two {latitude,longitude}
 *  points, in metres. Accurate enough for "is this phone standing at this
 *  property" at this radius -- the ~0.5% error haversine carries from
 *  treating Earth as a sphere is irrelevant at 100m. */
export function distanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True only when both positions are real and within ARRIVAL_RADIUS_METERS
 *  of each other -- a missing device fix or a property with no stored
 *  coordinates yet (most of them, today) is "can't tell", never treated as
 *  "arrived". */
export function hasArrived(here, target) {
  if (!here || target?.latitude == null || target?.longitude == null) return false;
  return distanceMeters(here, { latitude: target.latitude, longitude: target.longitude }) <= ARRIVAL_RADIUS_METERS;
}
