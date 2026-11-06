import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
const modo=process.argv[2];
if(!['plan','apply'].includes(modo))throw Error('Usá plan o apply.');
let ejecutable=process.env.RAILWAY_CLI_PATH || 'railway';
if(process.platform==='win32' && !process.env.RAILWAY_CLI_PATH){
 const nativo=join(process.env.APPDATA||'','npm','node_modules','@railway','cli','bin','railway.exe');
 if(existsSync(nativo))ejecutable=nativo;
}
const resultado=spawnSync(ejecutable,['config',modo,...process.argv.slice(3)],{stdio:'inherit',env:{...process.env,_:ejecutable}});
if(resultado.error)throw resultado.error;
process.exit(resultado.status??1);
