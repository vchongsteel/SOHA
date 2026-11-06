import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom, catchError, throwError } from 'rxjs';

export interface Usuario { id:string;usuario:string;nombre:string;rol:'Administrador'|'Registro'|'Consulta';activo:number;version:number; }
@Injectable({providedIn:'root'})
export class Session {
  private http=inject(HttpClient);
  usuario=signal<Usuario|null>(null);
  requiereConfiguracion=signal(false);
  administrador=computed(()=>this.usuario()?.rol==='Administrador');
  puedeRegistrar=computed(()=>!!this.usuario() && this.usuario()?.rol!=='Consulta');
  async refresh(){const r=await firstValueFrom(this.http.get<{usuario:Usuario|null;requiereConfiguracion:boolean}>('/api/auth/session'));this.usuario.set(r.usuario);this.requiereConfiguracion.set(r.requiereConfiguracion);return r;}
  async ingresar(datos:object,setup=false){const r=await firstValueFrom(this.http.post<{usuario:Usuario}>('/api/auth/'+(setup?'setup':'login'),datos));this.usuario.set(r.usuario);this.requiereConfiguracion.set(false);}
  async salir(){await firstValueFrom(this.http.post('/api/auth/logout',{}));this.usuario.set(null);}
}
export const accesoGuard:CanActivateFn=async()=>{
  const session=inject(Session),router=inject(Router);
  try{await session.refresh();return session.usuario()?true:router.parseUrl('/acceso');}catch{return router.parseUrl('/acceso');}
};
export const sesionInterceptor:HttpInterceptorFn=(req,next)=>{
  const router=inject(Router);
  return next(req).pipe(catchError(error=>{if(error.status===401 && !req.url.startsWith('/api/auth/'))void router.navigateByUrl('/acceso');return throwError(()=>error);}));
};
