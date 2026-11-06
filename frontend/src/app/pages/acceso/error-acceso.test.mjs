import {test} from 'node:test';
import assert from 'node:assert/strict';
import {errorAcceso} from './error-acceso.ts';
test('el acceso distingue credenciales incorrectas, conexión e intentos limitados',()=>{
  const credenciales=errorAcceso({status:401,error:{message:'Unauthorized'}});
  assert.equal(credenciales.titulo,'Datos incorrectos');assert.equal(credenciales.credenciales,true);assert.match(credenciales.mensaje,/usuario o la contraseña/);
  for(const status of [0,502,503,504]){const aviso=errorAcceso({status});assert.equal(aviso.credenciales,false);assert.equal(aviso.titulo,'No pudimos conectarnos');assert.doesNotMatch(aviso.mensaje,/backend|contraseña|Angular/);}
  assert.equal(errorAcceso({status:429}).titulo,'Demasiados intentos');
  assert.equal(errorAcceso({status:400,error:{message:'Revisá el usuario.'}}).mensaje,'Revisá el usuario.');
  assert.equal(errorAcceso(null).credenciales,false);
});
