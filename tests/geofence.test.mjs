import assert from 'node:assert/strict';
import { distanceMeters, hasArrived, ARRIVAL_RADIUS_METERS } from '/home/user/nova-shield/admin/js/lib/geofence.js';

// Same point -> zero distance.
assert.equal(distanceMeters({ latitude: 49.2827, longitude: -123.1207 }, { latitude: 49.2827, longitude: -123.1207 }), 0);

// Known reference: Vancouver City Hall to Vancouver Art Gallery is
// roughly 2.1km as the crow flies -- a sanity bound, not an exact fixture.
const cityHall = { latitude: 49.26069, longitude: -123.11268 };
const artGallery = { latitude: 49.28245, longitude: -123.12057 };
const d = distanceMeters(cityHall, artGallery);
assert.ok(d > 2000 && d < 2600, `expected ~2.1-2.3km, got ${d}m`);

// A point exactly ~70m north (within the 100m arrival radius).
const base = { latitude: 49.0, longitude: -123.0 };
const metersPerDegreeLat = 111320;
const near = { latitude: base.latitude + 70 / metersPerDegreeLat, longitude: base.longitude };
const dNear = distanceMeters(base, near);
assert.ok(Math.abs(dNear - 70) < 1, `expected ~70m, got ${dNear}m`);
assert.equal(hasArrived(near, base), true);

// A point ~500m away (outside the radius).
const far = { latitude: base.latitude + 500 / metersPerDegreeLat, longitude: base.longitude };
assert.equal(hasArrived(far, base), false);

// Exactly at the boundary (100m) counts as arrived (<=).
const boundary = { latitude: base.latitude + ARRIVAL_RADIUS_METERS / metersPerDegreeLat, longitude: base.longitude };
assert.ok(Math.abs(distanceMeters(boundary, base) - ARRIVAL_RADIUS_METERS) < 0.5);
assert.equal(hasArrived(boundary, base), true);

// Missing device fix -> never "arrived", never throws.
assert.equal(hasArrived(null, base), false);
assert.equal(hasArrived(undefined, base), false);

// Property with no stored coordinates yet (the common case today) ->
// never "arrived", regardless of how close the device actually is.
assert.equal(hasArrived(base, { latitude: null, longitude: null }), false);
assert.equal(hasArrived(base, {}), false);

console.log('geofence.js: all assertions passed');
