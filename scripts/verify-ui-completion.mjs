import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = resolve('.');
const session = `nasun-ui-${randomUUID().slice(0, 8)}`;
const output = resolve('output/completion-ui');
const npmCandidates = [process.env.npm_execpath?.replace(/npm-cli\.js$/, 'npx-cli.js'),
  resolve(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npx-cli.js')];
const npx = npmCandidates.find(path => path && existsSync(path));
if (!npx) throw new Error('UI_CHECK_NPX_REQUIRED');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/SUPABASE|TOKEN|PASSWORD|PASSPHRASE|DSN|SECRET|CLOUDFLARE/.test(key)));
async function cli(...args) {
  const child = spawn(process.execPath, [npx, '--yes', '--package', '@playwright/cli@0.1.22',
    'playwright-cli', `-s=${session}`, ...args], { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  const timer = setTimeout(() => child.kill(), 120000);
  try {
    await new Promise((accept, reject) => {
      child.stdout.on('data', chunk => { if (text.length < 2e6) text += chunk; });
      child.stderr.on('data', () => {});
      child.on('error', () => reject(new Error('UI_CHECK_BROWSER_UNAVAILABLE')));
      child.on('exit', code => {
        if (code === 0 && !text.includes('### Error')) accept();
        else { console.error(text.slice(-6000)); reject(new Error('UI_CHECK_FAILED')); }
      });
    });
    return text;
  } finally { clearTimeout(timer); }
}

// Exclude all application environment files and force the development-only
// fixture path. This server cannot initialize a configured Supabase client.
const server = await createServer({ configFile: false, envDir: false, envPrefix: 'NASUN_UI_UNUSED_',
  plugins: [react()], root, server: { host: '127.0.0.1', port: 5195, strictPort: true },
  define: { 'import.meta.env.VITE_SUPABASE_URL': 'undefined', 'import.meta.env.VITE_SUPABASE_ANON_KEY': 'undefined',
    'import.meta.env.VITE_REMOTE_REPORTING_ENABLED': '"false"', 'import.meta.env.VITE_BUILD_REVISION': '"synthetic-ui"' } });
await mkdir(output, { recursive: true });
try {
  await server.listen();
  await cli('open', 'http://127.0.0.1:5195/');
  const browserCode = `async (page) => {
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.name));
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5195' ? route.continue() : route.abort());
    const desktop = () => page.setViewportSize({width:1280,height:844});
    await desktop();
    await page.getByRole('button',{name:'Bộ Máy & Kho Thiết Bị',exact:true}).click();
    await page.locator('.assetmanagement-screen').waitFor();
    const viewports = [];
    for (const width of [320,390,768,1280]) {
      await page.setViewportSize({width,height:844});
      const result = await page.evaluate(() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        undersizedControls:[...document.querySelectorAll('.workspace-screen button')].filter(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0&&(box.width<44||box.height<44);}).length}));
      if(result.scrollWidth>width || width<=768&&result.undersizedControls) throw Error('UI_MOBILE_LAYOUT_FAILED');
      viewports.push(result);
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Chi tiết & Ảnh',exact:true}).first().click();
    await page.locator('.machine-profile-modal').waitFor();
    await page.getByRole('button',{name:'Chỉnh sửa máy tính',exact:true}).click();
    await page.getByRole('button',{name:'Lưu Thay Đổi',exact:true}).waitFor();
    await page.getByRole('button',{name:'← Quay lại hồ sơ máy',exact:true}).click();
    await page.locator('.machine-profile-modal').waitFor();
    await page.getByRole('button',{name:'Đóng hồ sơ máy',exact:true}).click();
    await desktop();
    await page.getByRole('button',{name:'Nhà Phân Phối (NPP)',exact:true}).click();
    await page.getByRole('button',{name:'Thêm NPP',exact:true}).click();
    await page.getByPlaceholder('09xx xxx xxx').fill('12');
    await page.locator('#npp-phone-feedback').filter({hasText:'không đúng định dạng'}).waitFor();
    await page.getByRole('button',{name:'Hủy Bỏ',exact:true}).click();
    await page.getByRole('button',{name:/Xử Lý & Sửa Chữa Máy/}).first().click();
    await page.getByRole('button',{name:'Tạo phiếu',exact:true}).click();
    await page.locator('input[aria-describedby="repair-serial-feedback"]').fill('???');
    await page.locator('#repair-serial-feedback').filter({hasText:'chỉ được chứa'}).waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:${JSON.stringify(resolve(output, 'repair-mobile.png'))},fullPage:false});
    const close = page.locator('.modal-header button').last(); await close.click();
    await desktop();
    await page.getByRole('button',{name:/Lịch Bảo Trì 1 Năm/}).first().click();
    await page.locator('.maintenanceschedule-screen').waitFor();
    await page.context().setOffline(true);
    await page.getByRole('button',{name:'Nhà Phân Phối (NPP)',exact:true}).click();
    await page.locator('.nppmanagement-screen').waitFor();
    await page.context().setOffline(false);
    if(errors.length) throw Error('UI_RUNTIME_ERROR');
    return {passed:true,synthetic:true,realBackendConnected:false,viewports,profileEditReturn:true,nppFeedback:true,repairFeedback:true,maintenance:true,offlineCachedNavigation:true,pageErrors:errors};
  }`;
  // File input avoids Windows npm/shell rewriting multiline JavaScript quotes.
  const browserFile = resolve(output, 'browser-check.js');
  await writeFile(browserFile, browserCode);
  const text = await cli('run-code', `--filename=${browserFile}`);
  const match = text.match(/### Result\s*\n([\s\S]*?)\n### Ran/);
  const result = match ? JSON.parse(match[1]) : null;
  if (!result?.passed || result.realBackendConnected !== false) throw new Error('UI_CHECK_RECEIPT_INVALID');
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await cli('close').catch(() => {});
  await server.close();
}
