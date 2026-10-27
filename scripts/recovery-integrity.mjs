import {createReadStream} from 'node:fs';
import {readFile,writeFile,readdir,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

async function hashFile(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
async function inventory(directory){
 const root=await realpath(directory);const files=[];
 async function visit(relative){for(const item of await readdir(join(root,relative),{withFileTypes:true})){
  const path=relative?`${relative}/${item.name}`:item.name;
  if(path==='recovery-manifest.json')continue;
  const absolute=join(root,path);const info=await lstat(absolute);
  if(info.isSymbolicLink())throw Error('RECOVERY_SYMLINK_REJECTED');
  if(info.isDirectory())await visit(path);
  else if(info.isFile())files.push({path,bytes:info.size,sha256:await hashFile(absolute)});
  else throw Error('RECOVERY_SPECIAL_FILE_REJECTED');
 }}
 await visit('');return files.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function createRecoveryIntegrity(directory){
 const files=await inventory(directory);
 for(const name of ['database.dump','roles.sql','storage/manifest.json'])if(!files.some(file=>file.path===name&&file.bytes>0))throw Error('RECOVERY_COMPONENT_MISSING');
 const manifest={version:1,files,fullRestoreVerified:false};
 await writeFile(join(directory,'recovery-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
 return {files:files.length,fullRestoreVerified:false};
}
export async function verifyRecoveryIntegrity(directory){
 const manifest=JSON.parse(await readFile(join(directory,'recovery-manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.files)||manifest.fullRestoreVerified!==false)throw Error('RECOVERY_MANIFEST_INVALID');
 const root=await realpath(directory);
 for(const item of manifest.files){
  if(typeof item.path!=='string'||item.path.includes('\\')||!resolve(root,item.path).startsWith(root+sep)||!Number.isSafeInteger(item.bytes)||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('RECOVERY_MANIFEST_INVALID');
 }
 const actual=await inventory(directory);
 if(JSON.stringify(actual)!==JSON.stringify(manifest.files))throw Error('RECOVERY_ARCHIVE_MISMATCH');
 for(const name of ['database.dump','roles.sql','storage/manifest.json'])if(!actual.some(item=>item.path===name&&item.bytes>0))throw Error('RECOVERY_COMPONENT_MISSING');
 return {files:actual.length,fullRestoreVerified:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const action=process.argv[2];const directory=process.argv[3];
 if(!['create','verify'].includes(action)||!directory)throw Error('RECOVERY_INTEGRITY_ARGUMENTS_REQUIRED');
 (action==='create'?createRecoveryIntegrity(directory):verifyRecoveryIntegrity(directory)).then(result=>console.log(JSON.stringify(result)))
 .catch(()=>{console.error('RECOVERY_INTEGRITY_FAILED');process.exitCode=1;});
}
