export interface AvisoAcceso { titulo:string;mensaje:string;credenciales:boolean; }
export function errorAcceso(error:unknown):AvisoAcceso {
  const respuesta=error && typeof error==='object'?error as {status?:number;error?:{message?:unknown}}:{};
  if(respuesta.status===401)return {titulo:'Datos incorrectos',mensaje:'El usuario o la contraseña no son correctos. Revisá los datos e intentá de nuevo.',credenciales:true};
  if([0,502,503,504].includes(respuesta.status ?? -1))return {titulo:'No pudimos conectarnos',mensaje:'No se pudo comprobar tu acceso. Verificá tu conexión e intentá de nuevo en unos momentos.',credenciales:false};
  if(respuesta.status===429)return {titulo:'Demasiados intentos',mensaje:'Esperá unos minutos antes de volver a intentar.',credenciales:false};
  return {titulo:'No pudimos iniciar sesión',mensaje:typeof respuesta.error?.message==='string'?respuesta.error.message:'No se pudo comprobar tu acceso. Actualizá la página e intentá de nuevo.',credenciales:false};
}
