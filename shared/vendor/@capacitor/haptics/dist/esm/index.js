import { registerPlugin } from '../../../core/dist/index.js';
const Haptics = registerPlugin('Haptics', {
    web: () => import("./web.js").then((m) => new m.HapticsWeb()),
});
export * from './definitions.js';
export { Haptics };
