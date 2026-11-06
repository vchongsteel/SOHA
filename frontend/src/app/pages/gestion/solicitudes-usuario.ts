import {Component,inject,signal,output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {mensajeApi} from '../../core/services/personal-api';
@Component({selector:'app-solicitudes-usuario',imports:[FormsModule],styleUrl:'./gestion.scss',template:`
<section class="panel editor"><h2>Solicitudes de registro</h2><p class="muted">Aprobá las solicitudes para habilitar el acceso. El permiso se asigna aquí.</p>
@if(error()){<p class="error" role="alert">{{error()}}</p>}@if(mensaje()){<p class="exito" role="status">{{mensaje()}}</p>}
<button class="suave" (click)="cargar()" [disabled]="cargando() || !!procesando()">Actualizar solicitudes</button>
@if(cargando()){<p role="status">Cargando solicitudes…</p>}@else{<div class="tabla"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Permiso al aprobar</th><th>Acciones</th></tr></thead><tbody>
@for(s of solicitudes();track s.id){<tr><td>{{s.nombre}}</td><td>{{s.usuario}}</td><td><select [(ngModel)]="s.rol" [attr.aria-label]="'Permiso para '+s.usuario" [disabled]="!!procesando()"><option value="Consulta">Consulta</option><option value="Registro">Registro</option><option value="Administrador">Administrador</option></select></td><td><div class="acciones-fila"><button class="primario" (click)="resolver(s,'aprobar')" [disabled]="!!procesando()">Aprobar y crear usuario</button><button class="suave" (click)="resolver(s,'rechazar')" [disabled]="!!procesando()">Rechazar</button></div></td></tr>}
@empty{<tr><td colspan="4" class="vacio">No hay solicitudes pendientes.</td></tr>}</tbody></table></div>}</section>`})
export class SolicitudesUsuario {
 resuelta=output<void>();
 private http=inject(HttpClient);solicitudes=signal<any[]>([]);cargando=signal(true);procesando=signal('');error=signal('');mensaje=signal('');
 constructor(){void this.cargar();}
 async cargar(){this.cargando.set(true);this.error.set('');try{const lista=await firstValueFrom(this.http.get<any[]>('/api/solicitudes-usuario'));this.solicitudes.set(lista.map(s=>({...s,rol:'Consulta'})));}catch(e){this.error.set(mensajeApi(e));}finally{this.cargando.set(false);}}
 async resolver(s:any,accion:'aprobar'|'rechazar'){if(this.procesando())return;this.procesando.set(s.id);this.error.set('');this.mensaje.set('');try{await firstValueFrom(this.http.post('/api/solicitudes-usuario/'+s.id+'/'+accion,{rol:s.rol}));this.mensaje.set(accion==='aprobar'?'Acceso aprobado para '+s.nombre+'. Ya puede iniciar sesión.':'Solicitud rechazada.');await this.cargar();this.resuelta.emit();}catch(e){this.error.set(mensajeApi(e));}finally{this.procesando.set('');}}
}
