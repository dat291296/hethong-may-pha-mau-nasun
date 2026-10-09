export function assessBackupFreshness(runs, now = Date.now()) {
  return ['Encrypted Database Backup','Auth and Storage recovery backup'].map(name => {
    const latest = runs.filter(run=>run.name===name && run.status==='completed').sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
    const ageHours = latest ? (now-Date.parse(latest.created_at))/3600000 : Infinity;
    return {name, passed:latest?.conclusion==='success' && ageHours>=0 && ageHours<=36, runId:latest?.id || null, ageHours:Number.isFinite(ageHours)?Math.round(ageHours):null};
  });
}
async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo !== 'dat291296/hethong-may-pha-mau-nasun') throw Error('APPROVED_REPOSITORY_REQUIRED');
  const runs=[];
  for(const workflow of ['database-backup.yml', 'recovery-backup.yml']) {
    const response=await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?per_page=10&branch=main`,{
      headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000),
    });
    if(!response.ok)throw Error('BACKUP_STATUS_UNAVAILABLE');
    const result=await response.json();runs.push(...result.workflow_runs);
  }
  const results=assessBackupFreshness(runs);
  console.log(JSON.stringify({backupJobs:results,restoreVerified:false,scope:'Workflow success and freshness only; not restore evidence or production permission verification'},null,2));
  if(results.some(item=>!item.passed))throw Error('BACKUP_JOB_FAILED_OR_STALE');
}
if (process.argv[1]?.endsWith('verify-internal-readiness.mjs')) main().catch(error=>{console.error(error.message);process.exitCode=1;});
