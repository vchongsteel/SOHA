import { Component,inject,signal,computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom,forkJoin } from 'rxjs';
import { Session } from '../../core/services/session';
import { Avisos } from '../../core/services/avisos';
import { mensajeApi } from '../../core/services/personal-api';
import { descargarCsv } from '../../core/services/gestion-api';
import { hoyLocal } from '../inventario/inventario';
@Component({selector:'app-capacitaciones',imports:[FormsModule,RouterLink,MatIconModule],templateUrl:'./capacitaciones.html',styleUrl:'./capacitaciones.scss'})
export class Capacitaciones {
  private http=inject(HttpClient);session=inject(Session);private avisos=inject(Avisos);
  catalogo=signal<any[]>([]);cursoForm=signal<any|null>(null);sesiones=signal<any[]>([]);personal=signal<any[]>([]);form=signal<any|null>(null);detalle=signal<any|null>(null);seleccionados=signal<string[]>([]);busqueda=signal('');empresa=signal('');error=signal('');mensaje=signal('');cargando=signal(true);guardando=signal(false);motivo='';hoy=hoyLocal();
  personasVisibles=computed(()=>{const q=this.busqueda().toLocaleLowerCase();return this.personal().filter(p=>p.estado==='Activo' && (!this.empresa() || p.empresa===this.empresa()) && (!q || `${p.codigo} ${p.nombre}`.toLocaleLowerCase().includes(q)));});
  constructor(){void this.cargar();}
  async cargar(){this.cargando.set(true);this.error.set('');try{const r=await firstValueFrom(forkJoin({c:this.http.get<any[]>('/api/capacitaciones'),p:this.http.get<any[]>('/api/colaboradores'),catalogo:this.http.get<any[]>('/api/catalogo-capacitaciones')}));this.catalogo.set(r.catalogo);this.sesiones.set(r.c);this.personal.set(r.p);}catch(e){this.error.set(mensajeApi(e));}finally{this.cargando.set(false);}}
  abrir(){this.personalizados.set(false);this.seleccionados.set([]);this.busqueda.set('');this.empresa.set('');this.error.set('');this.mensaje.set('');this.detalle.set(null);this.form.set({solicitud:crypto.randomUUID(),vencimientos:{},catalogo_id:'',modalidad:'Grupal',tema:'',fecha:hoyLocal(),instructor:'',lugar:'',vence:'',observaciones:''});}
  cambiarModalidad(){this.seleccionados.set([]);this.form().vencimientos={};}
  editarCurso(c:any=null){this.cursoForm.set(c?{...c}:{nombre:"",descripcion:"",activo:1});}
  async guardarCurso(){if(this.guardando())return;this.guardando.set(true);this.error.set("");try{const c=this.cursoForm();await firstValueFrom(c.id?this.http.put("/api/catalogo-capacitaciones/"+c.id,c):this.http.post("/api/catalogo-capacitaciones",c));this.cursoForm.set(null);await this.cargar();}catch(e){this.error.set(mensajeApi(e));}finally{this.guardando.set(false);}}
  marcar(id:string,valor:boolean){if(this.form()?.modalidad==="Individual"){this.seleccionados.set(valor?[id]:[]);return;}this.seleccionados.update(ids=>valor?[...new Set([...ids,id])]:ids.filter(i=>i!==id));}
  eliminarVencimiento(id:string){delete this.form().vencimientos[id];}
  personalizados=signal(false);
  cambiarPersonalizados(valor:boolean){this.personalizados.set(valor);if(!valor)this.form().vencimientos={};}
  todos(){this.seleccionados.update(ids=>[...new Set([...ids,...this.personasVisibles().map(p=>p.id)])]);}
  async guardar(){if(this.guardando()||!this.seleccionados().length)return;this.guardando.set(true);this.error.set('');try{const r=await firstValueFrom(this.http.post<any>('/api/capacitaciones',{...this.form(),participantes:this.seleccionados(),vencimientos:Object.fromEntries(Object.entries(this.form().vencimientos).filter(([id])=>this.seleccionados().includes(id)))}));this.form.set(null);this.detalle.set(r);this.mensaje.set('Capacitación registrada para '+r.asistentes.length+' participantes.');await this.cargar();await this.avisos.actualizar();}catch(e){this.error.set(mensajeApi(e));}finally{this.guardando.set(false);}}
  async ver(id:string){this.error.set('');this.motivo='';try{this.detalle.set(await firstValueFrom(this.http.get('/api/capacitaciones/'+id)));}catch(e){this.error.set(mensajeApi(e));}}
  async anular(){if(!this.detalle()||!this.motivo.trim()||this.guardando())return;this.guardando.set(true);try{this.detalle.set(await firstValueFrom(this.http.post('/api/capacitaciones/'+this.detalle().id+'/anular',{motivo:this.motivo})));await this.cargar();await this.avisos.actualizar();this.motivo='';}catch(e){this.error.set(mensajeApi(e));}finally{this.guardando.set(false);}}
  exportar(){const d=this.detalle();if(d)descargarCsv('asistencia-capacitacion.csv',['Tema','Fecha','Instructor','Código','Nombre','Empresa','Vencimiento'],d.asistentes.map((p:any)=>[d.tema,d.fecha,d.instructor,p.codigo,p.nombre,p.empresa,p.vence]));}
}
