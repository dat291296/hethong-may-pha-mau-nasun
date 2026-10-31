const count = value => Number.isFinite(Number(value)) ? Math.max(0,Math.floor(Number(value))) : 0;
export function buildSupportReport({ health={}, diagnostics={}, performance={} }={}) {
  const areas=['auth','device','draft','runtime','sync'];
  const states=['pending','retry_wait','needs_review','dead_letter','syncing'];
  const metrics=['LCP','CLS','INP','LONG_TASK'];
  return {
    schemaVersion:1,generatedAt:new Date().toISOString(),
    online:Boolean(health.online),queueTotal:count(health.queueTotal),oldestQueueAgeSeconds:count(health.oldestQueueAgeSeconds),
    queueCounts:Object.fromEntries(states.map(state=>[state,count(health.counts?.[state])])),
    errorCounts:Object.fromEntries(areas.map(area=>[area,count(diagnostics.counts?.[area])])),
    performance:Object.fromEntries(metrics.filter(name=>Number.isFinite(performance[name]?.value)).map(name=>[name,Math.max(0,performance[name].value)])),
  };
}
