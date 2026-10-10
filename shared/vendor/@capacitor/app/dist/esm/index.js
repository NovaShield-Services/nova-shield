import { registerPlugin } from '../../../core/dist/index.js';
const App = registerPlugin('App', {
    web: () => import("./web.js").then((m) => new m.AppWeb()),
});
export * from './definitions.js';
export { App };
