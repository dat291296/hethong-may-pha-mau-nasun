const metrics = new Map();
const observers = [];

const THRESHOLDS = Object.freeze({
  LCP: { good: 2500, poor: 4000 },
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
  LONG_TASK: { good: 0, poor: 200 }
});

function classify(name, value) {
  const threshold = THRESHOLDS[name];
  if (!threshold) return 'unknown';
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

function publish(name, value) {
  const metric = {
    name,
    value: Math.round(value * 1000) / 1000,
    rating: classify(name, value),
    recordedAt: new Date().toISOString()
  };
  metrics.set(name, metric);
  window.dispatchEvent(new CustomEvent('nasun-performance-metric', { detail: metric }));
}

function observe(type, callback, options = { buffered: true }) {
  try {
    const observer = new PerformanceObserver(callback);
    observer.observe({ type, ...options });
    observers.push(observer);
  } catch (error) {
    console.info(`[Performance] ${type} observer unavailable`, error?.message || error);
  }
}

export function startPerformanceMonitoring() {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return () => {};
  if (observers.length > 0) return stopPerformanceMonitoring;

  observe('largest-contentful-paint', list => {
    const entries = list.getEntries();
    const last = entries.at(-1);
    if (last) publish('LCP', last.startTime);
  });

  let cumulativeLayoutShift = 0;
  observe('layout-shift', list => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) cumulativeLayoutShift += entry.value;
    }
    publish('CLS', cumulativeLayoutShift);
  });

  let worstInteraction = 0;
  observe('event', list => {
    for (const entry of list.getEntries()) {
      if (entry.interactionId && entry.duration > worstInteraction) worstInteraction = entry.duration;
    }
    if (worstInteraction > 0) publish('INP', worstInteraction);
  }, { buffered: true, durationThreshold: 40 });

  let longestTask = 0;
  observe('longtask', list => {
    for (const entry of list.getEntries()) longestTask = Math.max(longestTask, entry.duration);
    publish('LONG_TASK', longestTask);
  });

  return stopPerformanceMonitoring;
}

export function stopPerformanceMonitoring() {
  observers.splice(0).forEach(observer => observer.disconnect());
}

export function getPerformanceSnapshot() {
  return Object.fromEntries(metrics);
}
