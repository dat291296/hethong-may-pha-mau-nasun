import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMachine, maintenanceSteps, maintenanceNotes, matchesDocumentModel } from '../src/lib/machineWorkspace.js';

test('scanner resolves exact codes and refuses ambiguous serials or partial matches', () => {
  const sets = [{ setCode: 'SET-1', dispenserSerial: 'HERO-20' }, { setCode: 'SET-2', mixerSerial: 'HERO-20' }];
  assert.equal(resolveMachine(sets, ' set-1 '), sets[0]);
  assert.equal(resolveMachine(sets, 'HERO-20'), null);
  assert.equal(resolveMachine(sets, 'SET'), null);
  assert.equal(resolveMachine(sets, 'https://example.com/SET-1'), null);
});

test('model checklist validates every result and fits the server audit limit', () => {
  for (const model of ['Satint A2', 'Hero Eurotint', 'Corob D200', 'Fast & Fluid HA480', 'Other']) {
    const steps = maintenanceSteps(model);
    assert.equal(steps.length, 8);
    assert.throws(() => maintenanceNotes(model, Array(8).fill(''), '', ''), /checklist/);
    const notes = maintenanceNotes(model, Array(8).fill('PASS'), 'Seal', 'Cleaned');
    assert.ok(notes.includes('Seal'));
    assert.ok(notes.includes('Cleaned'));
    assert.ok(notes.length < 4000);
    assert.throws(() => maintenanceNotes(model, Array(8).fill('PASS'), '', 'x'.repeat(4000)), /4000/);
  }
  assert.notDeepEqual(maintenanceSteps('Corob'), maintenanceSteps('Hero'));
});

test('profile documents include exact model and common resources only', () => {
  assert.equal(matchesDocumentModel(' Hero Eurotint ', 'hero eurotint'), true);
  assert.equal(matchesDocumentModel('', 'Corob'), true);
  assert.equal(matchesDocumentModel('Corob', 'Hero'), false);
  assert.equal(matchesDocumentModel('Hero', 'Hero Eurotint'), false);
});
