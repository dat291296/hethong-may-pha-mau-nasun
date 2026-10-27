import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createOfflinePreviewServer } from './serve-offline-preview.mjs';
const engine=process.env.UI_TEST_ENGINE||'chrome';
if(!['chrome','webkit'].includes(engine))throw Error('INVALID_TEST_ENGINE');
const session=`nasun-stage1-${engine}-${Date.now()}`;
let instance;
let browserOpened=false;
async function cli(...args) {
  return new Promise((accept,reject)=>{
    const child=spawn('npx',['--yes','--package','@playwright/cli@0.1.22','playwright-cli',`-s=${session}`,...args],{
      env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!/SUPABASE|VITE_|PASSWORD|TOKEN|PASSPHRASE|SECRET|API_KEY/.test(key))),stdio:['ignore','pipe','pipe'],
    });
    let output='';const timer=setTimeout(()=>{child.kill();reject(Error('STAGE1_BROWSER_TIMEOUT'));},150000);
    child.stdout.on('data',chunk=>{if(output.length<200000)output+=chunk;});child.stderr.on('data',()=>{});
    child.on('error',()=>{clearTimeout(timer);reject(Error('STAGE1_BROWSER_UNAVAILABLE'));});
    child.on('close',code=>{clearTimeout(timer);code===0&&!output.includes('### Error')?accept():reject(Error('STAGE1_BROWSER_CHECK_FAILED'));});
  });
}
try {
  instance=await createOfflinePreviewServer({port:0});
  await cli('open',`${instance.origin}/regression.html`,`--browser=${engine}`);
  browserOpened=true;
  await cli('run-code',`async page=>{
    await page.locator('#result[data-complete="true"]').waitFor({timeout:60000});
    const report=JSON.parse(await page.locator('#result').textContent());
    if(report.passed!==true || report.backendConnected!==false || Object.keys(report.checks).length<17 || Object.values(report.checks).some(value=>value!==true))throw Error('STAGE1_BROWSER_REGRESSION');
    await page.reload();
    await page.locator('#result[data-passed="true"]').waitFor({timeout:60000});
    await page.context().setOffline(true);
    await page.getByRole('button',{name:'Đọc lại nháp khi mất mạng',exact:true}).click();
    await page.locator('#offline-read-result[data-passed="true"]').waitFor();
    await page.context().setOffline(false);
    await page.getByRole('button',{name:'Kiểm tra kết nối trở lại',exact:true}).click();
    await page.locator('#reconnect-result[data-passed="true"]').waitFor();
  }`);
  await mkdir('output/stage1-evidence',{recursive:true});
  await writeFile(`output/stage1-evidence/${engine}.json`,JSON.stringify({passed:true,engine,commit:process.env.GITHUB_SHA||null,
    synthetic:true,backendConnected:false,realSafariVerified:false,fullSupabaseRestoreVerified:false,
    browserNetworkOfflineVerified:true,
    scope:'Schema v3 fixture -> page reload -> current storage, old/future queue compatibility, owner isolation, lease, network faults and offline/reconnect in browser context',
  },null,2));
  console.log(`[stage1] ${engine} isolated browser environment passed; real Safari and live restore remain separate.`);
} catch {console.error('STAGE1_BROWSER_VERIFICATION_FAILED');process.exitCode=1;}
finally {if(browserOpened)await cli('close').catch(()=>{});await instance?.close();}
