import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, matchesDateRange, canEditRegion, requireRegionEdit } from '../src/lib/workspaceFilters.js';

test('search supports unaccented Vietnamese and missing legacy fields', () => {
  assert.equal(matchesSearch('da nang', ['Đà Nẵng', null, undefined]), true);
  assert.equal(matchesSearch('hero', ['HERO-EU-5541', 'Hoàn Mỹ']), true);
  assert.equal(matchesSearch('corob', ['Hero']), false);
});
test('date range is inclusive, excludes missing dates and supports open bounds', () => {
  assert.equal(matchesDateRange('2026-10-06T08:00:00Z', '2026-10-06', '2026-10-06'), true);
  assert.equal(matchesDateRange('', '2026-10-01', ''), false);
  assert.equal(matchesDateRange('2026-09-30', '2026-10-01', ''), false);
  assert.equal(matchesDateRange('2026-10-06', '', '2026-10-05'), false);
  assert.equal(matchesDateRange('', '', ''), true);
});
test('each technician can only edit their assigned concrete region', () => {
  const regions = ['Miền Bắc','Miền Trung','Miền Nam'];
  for (const assigned of regions) for (const target of regions) {
    assert.equal(canEditRegion({role:'technician',managedRegion:assigned},target), assigned === target);
  }
  for (const assigned of ['',undefined,'Toàn Quốc']) assert.equal(canEditRegion({role:'technician',managedRegion:assigned},'Miền Bắc'), false);
  assert.throws(() => requireRegionEdit({role:'technician',managedRegion:'Miền Bắc'},''));
  assert.equal(canEditRegion({role:'viewer',managedRegion:'Miền Bắc'},'Miền Bắc'),false);
  assert.equal(canEditRegion({role:'admin'},''),true);
  assert.equal(canEditRegion({role:'manager',managedRegion:'Toàn Quốc'},'Miền Nam'),true);
});
