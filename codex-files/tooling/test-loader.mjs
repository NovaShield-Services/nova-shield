import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const repoRoot = process.env.NOVA_SHIELD_REPO || fileURLToPath(new URL('../../', import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('/home/user/nova-shield/')) {
    const localPath = resolvePath(repoRoot, specifier.slice('/home/user/nova-shield/'.length));
    return nextResolve(pathToFileURL(localPath).href, context);
  }
  if (specifier === '/opt/node-tools/node_modules/playwright/index.js') {
    return { url: new URL('./playwright-shim.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
