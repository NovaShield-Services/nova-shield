import { registerPlugin } from '../../../core/dist/index.js';
const Share = registerPlugin('Share', {
    web: () => import("./web.js").then((m) => new m.ShareWeb()),
});
export * from './definitions.js';
export { Share };
