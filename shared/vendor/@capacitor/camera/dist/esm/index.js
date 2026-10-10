import { registerPlugin } from '../../../core/dist/index.js';
import { CameraWeb } from './web.js';
const Camera = registerPlugin('Camera', {
    web: () => new CameraWeb(),
});
export * from './definitions.js';
export { Camera };
