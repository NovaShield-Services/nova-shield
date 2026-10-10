import playwright from './test-tools/node_modules/playwright/index.mjs';
const chromium = Object.create(playwright.chromium);
chromium.launch = options => playwright.chromium.launch({ ...options, executablePath: '/usr/bin/chromium' });
export default { ...playwright, chromium };
