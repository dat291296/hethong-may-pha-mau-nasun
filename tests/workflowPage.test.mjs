import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appUrl = new URL('../src/App.jsx', import.meta.url);

test('workflow page does not embed the operational audit-log component', async () => {
  const source = await readFile(appUrl, 'utf8');
  const workflowSection = source.slice(
    source.indexOf("{activeTab === 'workflows'"),
    source.indexOf("{activeTab === 'maintenance'"),
  );
  assert.doesNotMatch(workflowSection, /<AuditLogs/);
  assert.match(workflowSection, /workflowResult/);
  assert.match(workflowSection, /Chi tiết tác vụ đã được lưu tại mục Nhật Ký Tác Nghiệp/);
});

test('all three workflows retain audit persistence and show an NPP result', async () => {
  const source = await readFile(appUrl, 'utf8');
  assert.match(source, /type: 'LẮP ĐẶT MỚI'/);
  assert.match(source, /type: 'THU HỒI'/);
  assert.match(source, /type: 'ĐIỀU CHUYỂN NPP'/);
  assert.match(source, /mode: 'INSTALL'[\s\S]{0,180}destinationNpp/);
  assert.match(source, /mode: 'WITHDRAW'[\s\S]{0,260}sourceNpp/);
  assert.match(source, /mode: 'TRANSFER'[\s\S]{0,260}sourceNpp/);
});
