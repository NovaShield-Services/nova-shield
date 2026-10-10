export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('/home/user/nova-shield/')) {
    return nextResolve(specifier.replace('/home/user/nova-shield/', '/workspace/nova-shield/'), context);
  }
  if (specifier === '/opt/node-tools/node_modules/playwright/index.js') {
    return { url: new URL('./playwright-shim.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
