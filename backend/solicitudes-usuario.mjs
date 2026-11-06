import {randomUUID} from 'node:crypto';
export function configurarSolicitudes(db){
 db.exec(`CREATE TABLE IF NOT EXISTS solicitudes_usuario(id TEXT PRIMARY KEY,usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,nombre TEXT NOT NULL,clave TEXT NOT NULL,estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK(estado IN ('Pendiente','Aprobada','Rechazada')),creado TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),usuario_id TEXT REFERENCES usuarios(id));`);
 const one=(sql,...p)=>db.prepare(sql).get(...p),run=(sql,...p)=>db.prepare(sql).run(...p);
 let ventana=Date.now(),intentos=0;
 return({path,method,input,user,send,text,fail,tx,audit,passwordHash,userView})=>{
  if(method==='POST' && path==='/api/auth/registro'){
   if(Date.now()-ventana>60000){ventana=Date.now();intentos=0;}if(++intentos>30)fail(429,'Se recibieron muchas solicitudes. Intentá en unos minutos.');
   if(input.rol!==undefined || input.activo!==undefined)fail(400,'Los permisos de acceso los asigna un administrador.');
   const nombre=text(input.nombre,'el nombre'),usuario=text(input.usuario,'el usuario',60).toLowerCase();
   if(one('SELECT id FROM usuarios WHERE usuario=?',usuario)||one('SELECT id FROM solicitudes_usuario WHERE usuario=?',usuario))fail(409,'Ese nombre de usuario ya está registrado o tiene una solicitud. Elegí otro o consultá al administrador.');
   const clave=passwordHash(input.password),id=randomUUID();
   tx(()=>{run('INSERT INTO solicitudes_usuario(id,usuario,nombre,clave) VALUES(?,?,?,?)',id,usuario,nombre,clave);audit(null,'SOLICITAR_ACCESO','solicitudes_usuario',id);});
   send(201,{estado:'Pendiente',nombre});return true;
  }
  if(!path.startsWith('/api/solicitudes-usuario'))return false;
  if(!user)fail(401,'Iniciá sesión para continuar.');if(user.rol!=='Administrador')fail(403,'Esta operación requiere un administrador.');
  if(path==='/api/solicitudes-usuario' && method==='GET'){send(200,db.prepare("SELECT id,usuario,nombre,estado,creado FROM solicitudes_usuario WHERE estado='Pendiente' ORDER BY creado").all());return true;}
  const match=path.match(/^\/api\/solicitudes-usuario\/([\w-]+)\/(aprobar|rechazar)$/);
  if(method==='POST' && match){
   const rol=input.rol||'Consulta';if(!['Consulta','Registro','Administrador'].includes(rol))fail(400,'Permiso de acceso inválido.');
   const resultado=tx(()=>{const solicitud=one('SELECT * FROM solicitudes_usuario WHERE id=?',match[1]);if(!solicitud)fail(404,'Solicitud no encontrada.');if(solicitud.estado!=='Pendiente')fail(409,'La solicitud ya fue atendida. Actualizá la lista.');
    if(match[2]==='rechazar'){run("UPDATE solicitudes_usuario SET estado='Rechazada',clave='' WHERE id=?",solicitud.id);audit(user,'RECHAZAR_ACCESO','solicitudes_usuario',solicitud.id);return{estado:'Rechazada'};}
    if(one('SELECT id FROM usuarios WHERE usuario=?',solicitud.usuario))fail(409,'El nombre de usuario ya está ocupado.');
    const id=randomUUID();run('INSERT INTO usuarios(id,usuario,nombre,rol,activo,clave) VALUES(?,?,?,?,1,?)',id,solicitud.usuario,solicitud.nombre,rol,solicitud.clave);
    run("UPDATE solicitudes_usuario SET estado='Aprobada',usuario_id=?,clave='' WHERE id=?",id,solicitud.id);audit(user,'APROBAR_ACCESO','solicitudes_usuario',solicitud.id);return userView(one('SELECT * FROM usuarios WHERE id=?',id));
   });send(200,resultado);return true;
  }
  fail(404,'Ruta no encontrada.');
 };
}
