import test from 'node:test';
import assert from 'node:assert/strict';
import { countOperationalDevices, summarizeDashboard } from '../src/modules/dashboard/lib/dashboardSummary.js';

test('dashboard excludes discontinued distributors and their installed sets', () => {
  const npps = [
    { id: 'ACTIVE', status: 'Đang hợp tác' },
    { id: 'STOPPED', status: 'Đã ngưng hợp tác' },
  ];
  const sets = [
    { setCode: 'ACTIVE-SET', nppId: 'ACTIVE', status: 'DA_LAP_DAT', region: 'Miền Bắc' },
    { setCode: 'STOPPED-SET', nppId: 'STOPPED', status: 'DA_LAP_DAT', region: 'Miền Nam' },
    { setCode: 'STOCK', status: 'TRONG_KHO', region: 'Kho Tổng' },
  ];

  const result = summarizeDashboard(sets, npps, '2026-11-03');
  assert.equal(result.activeNppCount, 1);
  assert.equal(result.dashboardSetCount, 2);
  assert.equal(result.installed, 1);
  assert.equal(result.regionalCounts.find(region => region.name === 'Miền Nam').count, 0);
  assert.equal(result.warehouse, 1);
});

test('dashboard counts only operational equipment and excludes devices assigned to stopped distributors', () => {
  const npps = [
    { id: 'ACTIVE', status: 'Đang hợp tác' },
    { id: 'STOPPED', status: 'Đã ngưng hợp tác' },
  ];
  const sets = [
    { setCode: 'ACTIVE-SET', nppId: 'ACTIVE' },
    { setCode: 'STOPPED-SET', nppId: 'STOPPED' },
  ];
  const devices = [
    { id: 'RUNNING', status: 'Đang chạy tốt', setCode: 'ACTIVE-SET' },
    { id: 'STOPPED-NPP', status: 'Đang chạy tốt', setCode: 'STOPPED-SET' },
    { id: 'ORPHAN', status: 'Đang chạy tốt', setCode: 'MISSING-SET' },
    { id: 'WAREHOUSE', status: 'Đang chạy tốt', setCode: null },
    { id: 'NEW', status: 'Mới 100%', setCode: null },
  ];

  assert.equal(countOperationalDevices(devices, sets, npps), 2);
});
