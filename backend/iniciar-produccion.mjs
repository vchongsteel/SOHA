import {spawnSync,spawn} from 'node:child_process';
if(!process.env.DATABASE_URL){
 const respaldo=spawnSync(process.execPath,['respaldar.mjs','--diario'],{stdio:'inherit'});
 if(respaldo.status!==0)throw Error('No se pudo verificar el respaldo previo al inicio.');
}
const api=spawn(process.execPath,['server.mjs'],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>api.kill(signal));
api.on('exit',code=>process.exit(code??1));
