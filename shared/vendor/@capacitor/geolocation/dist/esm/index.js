import { registerPlugin } from '../../../core/dist/index.js';
import { exposeSynapse } from '../../../synapse/dist/synapse.js';
const Geolocation = registerPlugin('Geolocation', {
    web: () => import("./web.js").then((m) => new m.GeolocationWeb()),
});
exposeSynapse();
export * from './definitions.js';
export { Geolocation };
