import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const metricsUrl = new URL('../src/lib/performanceMetrics.js', import.meta.url);
const mainUrl = new URL('../src/main.jsx', import.meta.url);
const packageUrl = new URL('../package.json', import.meta.url);
const budgetUrl = new URL('../scripts/verify-bundle-budget.mjs', import.meta.url);

test('ENT-10 collects Core Web Vitals without transmitting user data', async () => {
  const source = await readFile(metricsUrl, 'utf8');
  assert.match(source, /largest-contentful-paint/);
  assert.match(source, /layout-shift/);
  assert.match(source, /interactionId/);
  assert.match(source, /longtask/);
  assert.match(source, /nasun-performance-metric/);
  assert.doesNotMatch(source, /fetch\(|supabase|XMLHttpRequest/);
});

test('ENT-10 starts monitoring and enforces lazy bundle budgets in production builds', async () => {
  const [main, packageSource, budget] = await Promise.all([
    readFile(mainUrl, 'utf8'),
    readFile(packageUrl, 'utf8'),
    readFile(budgetUrl, 'utf8')
  ]);
  assert.match(main, /startPerformanceMonitoring\(\)/);
  assert.match(packageSource, /verify-bundle-budget\.mjs/);
  assert.match(budget, /AssetManagement-/);
  assert.match(budget, /supabase-/);
  assert.match(budget, /exceljs\.min-/);
  assert.match(budget, /totalJavaScript/);
});
