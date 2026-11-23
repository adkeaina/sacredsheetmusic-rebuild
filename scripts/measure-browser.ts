import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : {}),
});
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1600000 / 8,
    uploadThroughput: 750000 / 8,
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const w = window as any;
    w.metrics = { lcp: 0, cls: 0, events: [], lastInput: 0 };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.metrics.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as any) if (!e.hadRecentInput) w.metrics.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as any)
        if (e.interactionId) w.metrics.events.push(e.duration);
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    document.addEventListener(
      'input',
      () => {
        w.metrics.lastInput = performance.now();
      },
      true,
    );
  });
  const loaded = await page.goto(base);
  console.log(
    JSON.stringify({
      status: loaded?.status(),
      heading: await page.locator('h1').first().textContent(),
      viewport: await page.evaluate(() => innerWidth),
    }),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  const initial = await page.evaluate(() => (window as any).metrics);
  await page.getByRole('button', { name: 'Browse categories', exact: true }).click();
  await page.getByRole('button', { name: 'Browse categories', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search sheet music' }).fill('prayer');
  await page.waitForFunction(
    () =>
      location.pathname === '/search' &&
      document.querySelector('h1')?.textContent?.includes('prayer') &&
      document.querySelector('.music-card'),
  );
  const searchMs = await page.evaluate(() =>
    Math.round(performance.now() - (window as any).metrics.lastInput),
  );
  const after = await page.evaluate(() => (window as any).metrics);
  const report = {
    url: base,
    environment:
      'Chrome lab: 390x844, 4x CPU slowdown, 1.6Mbps down / 750kbps up, 150ms simulated latency plus actual network',
    lcp_ms: Math.round(initial.lcp),
    cls: Number(initial.cls.toFixed(4)),
    visible_search_ms: searchMs,
    max_observed_interaction_ms: Math.max(0, ...after.events),
    targets: { lcp_ms: 2500, cls: 0.1, visible_search_ms: 1000, interaction_ms: 200 },
  };
  await writeFile('.cloudflare/browser-metrics.json', JSON.stringify(report, null, 2));
  await page.screenshot({ path: '.cloudflare/preview-mobile.png', fullPage: true });
  console.log(JSON.stringify(report));
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.goto(base);
  await page.screenshot({ path: '.cloudflare/preview-desktop.png', fullPage: true });
} finally {
  await browser.close();
}
