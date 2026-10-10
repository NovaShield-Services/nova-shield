import { registerPlugin } from '../../../core/dist/index.js';
import { exposeSynapse } from '../../../synapse/dist/synapse.js';
const Filesystem = registerPlugin('Filesystem', {
    web: () => import("./web.js").then((m) => new m.FilesystemWeb()),
});
exposeSynapse();
export * from './definitions.js';
export { Filesystem };
