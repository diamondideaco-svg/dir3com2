// Own disposable Docker fixture only. Never pulls, mounts a checkout or queries a platform DB.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const suffix=randomBytes(6).toString('hex');
const scope=process.argv.length===2?'current_state':process.argv.length===3&&process.argv[2]==='--scope=continuous'?'continuous':process.argv.length===3&&process.argv[2]==='--scope=protected_operations'?'protected_operations':null;
assert.ok(scope,'Only the explicit current_state, continuous or protected_operations local fixture is allowed');
const name='dir3com-state-test-'+suffix, network=name+'-net';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
let containerId,networkId;
try {
 const [image]=JSON.parse(docker(['image','inspect','postgres:17']));
 assert.equal(image.Os,'linux');
 networkId=docker(['network','create','--driver','bridge','--label','com.dir3com.fixture=task166-current-state',network]);
 containerId=docker(['create','--pull=never','--name',name,'--label','com.dir3com.fixture=task166-current-state',
  '--network',network,'--publish','127.0.0.1:54339:5432','--tmpfs','/var/lib/postgresql/data:rw',
  '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=dir3com_test','postgres:17']);
 docker(['start',containerId]);
 const [container]=JSON.parse(docker(['inspect',containerId]));
 assert.equal(container.Image,image.Id);assert.equal(container.Config.Labels['com.dir3com.fixture'],'task166-current-state');
 assert.deepEqual(container.HostConfig.PortBindings['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'54339'}]);
 assert.equal((container.HostConfig.Binds??[]).length,0);
 assert.equal(JSON.parse(docker(['network','inspect',networkId]))[0].Driver,'bridge');
 assert.deepEqual(Object.keys(container.NetworkSettings.Networks),[network]);
 assert.ok(container.HostConfig.Tmpfs['/var/lib/postgresql/data']);
 let ready=false;
 for(let attempt=0;attempt<40;attempt++) {
  try {docker(['exec',containerId,'pg_isready','-h','127.0.0.1','-U','postgres','-d','dir3com_test']);ready=true;break;}
  catch {await new Promise(resolve=>setTimeout(resolve,500));}
 }
 assert.ok(ready,'Disposable PostgreSQL did not become ready');
 console.log('FIXTURE_VERIFIED=owned-container/dedicated-bridge/loopback-port/tmpfs/no-host-mounts/no-pull');
 // The policy fixture starts many docker/psql processes on Windows. Keep its
 // complete existing checks, with a bounded ten-minute allowance rather than skipping them.
 const run=spawnSync(process.execPath,[scope==='protected_operations'?'scripts/test-protected-operations-postgresql.mjs':'scripts/test-drive-whatsapp-postgresql.mjs'],{stdio:'inherit',timeout:scope==='protected_operations'?600000:180000,
  env:{...process.env,DRIVE_WHATSAPP_TEST_SCOPE:scope,DRIVE_WHATSAPP_TEST_DATABASE_URL:'postgresql://postgres@127.0.0.1:54339/dir3com_test',
   ...(scope==='protected_operations'?{DIR3COM_PROTECTED_OPS_FIXTURE_CONTAINER:name}:{})}});
 if(run.error)throw run.error;
 process.exitCode=run.status??1;
} catch(error) {
 console.error(error);process.exitCode=1;
} finally {
 if(containerId) {
  const [owned]=JSON.parse(docker(['inspect',containerId]));
  assert.equal(owned.Config.Labels['com.dir3com.fixture'],'task166-current-state');
  assert.equal((owned.HostConfig.Binds??[]).length,0);
  docker(['rm','--force',containerId]);
 }
 if(networkId) {
  const [owned]=JSON.parse(docker(['network','inspect',networkId]));
  assert.equal(owned.Labels['com.dir3com.fixture'],'task166-current-state');
  // Wait only for the just-owned container endpoint to detach.
  for(let attempt=0;;attempt++) {
   try {docker(['network','rm',networkId]);break;}
   catch(error){if(attempt===19)throw error;await new Promise(resolve=>setTimeout(resolve,250));}
  }
 }
 console.log('FIXTURE_CLEANED=owned-temporary-container-and-network-only');
}
