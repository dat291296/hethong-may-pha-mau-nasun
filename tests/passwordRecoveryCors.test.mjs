import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('password recovery CORS allows headers sent by the Supabase client', async () => {
  const [functionSource, clientSource] = await Promise.all([
    readFile(new URL('../supabase/functions/password-recovery/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/shared/data-access/supabase.js', import.meta.url), 'utf8'),
  ]);

  assert.match(clientSource, /'x-application-name': 'paint-tinting-manager'/);
  assert.match(functionSource, /Access-Control-Allow-Headers.*x-application-name/);
  assert.match(functionSource, /Access-Control-Allow-Headers.*x-retry-count/);
});
