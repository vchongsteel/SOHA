import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './server.mjs';

test('fases 1 a 3: permisos, variantes, saldos, traslados atómicos, duplicados y persistencia',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'so-fases-')); const path=join(dir,'test.sqlite'); let server;
  try {
    server=createApp(path);server.listen(0,'127.0.0.1');await once(server,'listening');let base=`http://127.0.0.1:${server.address().port}`;let cookie='';
    const request=async(method,path,data,session=cookie)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:session},body:data===undefined?undefined:JSON.stringify(data)});const b=await r.json();return{status:r.status,b,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
    assert.equal((await request('GET','/api/colaboradores')).status,401);
    assert.equal((await request('POST','/api/auth/setup',{nombre:'Admin',usuario:'admin',password:'1234567'})).status,400);
    let r=await request('POST','/api/auth/setup',{nombre:'Administrador de prueba',usuario:'admin',password:'Prueba88'});assert.equal(r.status,201);cookie=r.cookie;
    assert.equal((await request('POST','/api/auth/setup',{nombre:'Otro',usuario:'otro',password:'Prueba88'})).status,409);
    const project=(await request('POST','/api/proyectos',{codigo:'P1',nombre:'Proyecto prueba',empresa:'STEEL',activo:1})).b;
    const person={codigo:'C01',nombre:'Persona temporal',puesto:'Técnico',area:'Operaciones',empresa:'STEEL',estado:'Activo',proyecto_id:project.id};
    r=await request('POST','/api/colaboradores',person);assert.equal(r.status,201);const saved=r.b;
    assert.equal((await request('POST','/api/colaboradores',{...person,codigo:'C02',empresa:'IEM'})).status,400);
    assert.equal((await request('POST','/api/colaboradores',{...person,codigo:'c01'})).status,409);
    assert.equal((await request('GET','/api/colaboradores/'+saved.id)).b.proyecto_nombre,'Proyecto prueba');
    const provider=(await request('POST','/api/proveedores',{codigo:'PR1',nombre:'Proveedor temporal',contacto:'',activo:1})).b;
    const articleData={codigo:'EPP-M',descripcion:'Guante de prueba',variante:'M',unidad:'Par',ficha_url:'https://example.com/ficha.pdf',minimo:2,activo:1,proveedores:[{proveedor_id:provider.id,codigo_proveedor:'EXT-01'}]};
    const article=(await request('POST','/api/articulos',articleData)).b;assert.equal(article.proveedores[0].codigo_proveedor,'EXT-01');
    assert.equal((await request('POST','/api/articulos',{...articleData,codigo:'EPP-X',ficha_url:'javascript:alert(1)'})).status,400);
    const origin=(await request('POST','/api/ubicaciones',{codigo:'B1',nombre:'Bodega prueba',tipo:'Bodega',empresa:'STEEL',proyecto_id:null,activo:1})).b;
    const dest=(await request('POST','/api/ubicaciones',{codigo:'B2',nombre:'Proyecto destino',tipo:'Proyecto',empresa:'STEEL',proyecto_id:project.id,activo:1})).b;
    let movement={solicitud:'init-1',tipo:'SALDO_INICIAL',articulo_id:article.id,destino_id:origin.id,cantidad:10,fecha:'2026-01-01',motivo:'Saldo verificado de prueba'};
    assert.equal((await request('POST','/api/movimientos',movement)).status,201);
    assert.equal((await request('POST','/api/movimientos',movement)).status,200);
    assert.equal((await request('POST','/api/movimientos',{...movement,cantidad:11})).status,409);
    assert.equal((await request('POST','/api/movimientos',{...movement,solicitud:'init-2'})).status,409);
    movement={...movement,tipo:'TRASLADO',origen_id:origin.id,destino_id:dest.id,cantidad:4,fecha:'2026-01-02',solicitud:'transfer-1'};
    assert.equal((await request('POST','/api/movimientos',movement)).status,201);
    assert.equal((await request('POST','/api/movimientos',{...movement,solicitud:'bad',cantidad:20})).status,409);
    let stocks=(await request('GET','/api/existencias?fecha=2026-01-02')).b;
    assert.equal(stocks.find(s=>s.ubicacion_id===origin.id).cantidad,6);assert.equal(stocks.find(s=>s.ubicacion_id===dest.id).cantidad,4);
    const before=(await request('GET','/api/existencias?fecha=2026-01-01')).b;assert.equal(before.find(s=>s.ubicacion_id===origin.id).cantidad,10);
    assert.equal((await request('POST','/api/movimientos',{...movement,solicitud:'past',fecha:'2025-12-31'})).status,409);
    assert.equal((await request('POST','/api/movimientos',{...movement,solicitud:'same',destino_id:origin.id})).status,400);
    const viewer=(await request('POST','/api/usuarios',{usuario:'consulta',nombre:'Consulta prueba',rol:'Consulta',activo:1,password:'PruebaConsulta123'})).b;
    const viewerLogin=await request('POST','/api/auth/login',{usuario:'consulta',password:'PruebaConsulta123'});
    assert.equal((await request('GET','/api/existencias',undefined,viewerLogin.cookie)).status,200);
    assert.equal((await request('POST','/api/movimientos',{...movement,solicitud:'denied'},viewerLogin.cookie)).status,403);
    const registry=(await request('POST','/api/usuarios',{usuario:'registro',nombre:'Registro prueba',rol:'Registro',activo:1,password:'PruebaRegistro123'})).b;
    const registryLogin=await request('POST','/api/auth/login',{usuario:'registro',password:'PruebaRegistro123'});
    assert.equal((await request('POST','/api/movimientos',{...movement,tipo:'AJUSTE',cantidad:-1,solicitud:'ajuste-denied'},registryLogin.cookie)).status,403);
    assert.equal((await request('GET','/api/usuarios',undefined,registryLogin.cookie)).status,403);
    assert.equal((await request('PUT','/api/articulos/'+article.id,{...articleData,version:article.version,activo:0})).status,200);
    assert.equal((await request('POST','/api/movimientos',{...movement,solicitud:'inactive'})).status,400);
    assert.equal((await request('GET','/api/movimientos')).b.length,2);
    assert.ok((await request('GET','/api/auditoria')).b.some(a=>a.accion==='TRASLADO'));
    await new Promise(r=>server.close(r));server=createApp(path);server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
    stocks=(await request('GET','/api/existencias?fecha=2026-01-02')).b;assert.equal(stocks.find(s=>s.ubicacion_id===origin.id).cantidad,6);
    assert.equal((await request('POST','/api/auth/logout',{})).status,200);assert.equal((await request('GET','/api/colaboradores')).status,401);
  } finally {if(server?.listening)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});

test('migración conserva el personal y la empresa existentes',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'so-migracion-'));let server;
  try{const path=join(dir,'test.sqlite');const db=new DatabaseSync(path);db.exec("CREATE TABLE colaboradores(id TEXT PRIMARY KEY,codigo TEXT UNIQUE,nombre TEXT,puesto TEXT,area TEXT,estado TEXT,creado TEXT,version INTEGER,empresa TEXT); INSERT INTO colaboradores VALUES('old','C1','Persona anterior','Técnico','Campo','Activo','2026-01-01',1,'IEM');");db.close();server=createApp(path);server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:'admin',nombre:'Admin',password:'PruebaTemporal123'})});const rows=await(await fetch(base+'/api/colaboradores',{headers:{Cookie:setup.headers.get('set-cookie').split(';')[0]}})).json();assert.equal(rows[0].empresa,'IEM');assert.equal(rows[0].proyecto_id,null);}finally{if(server?.listening)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
