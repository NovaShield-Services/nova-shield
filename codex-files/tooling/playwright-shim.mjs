const loaded = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const playwright = loaded.default || loaded;
const chromium = Object.create(playwright.chromium);

chromium.launch = options => playwright.chromium.launch({
  ...options,
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {})
});

export default { ...playwright, chromium };
