import { Component,inject,signal,computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom,forkJoin } from 'rxjs';
import { GestionApi,descargarCsv } from '../../core/services/gestion-api';
import { Session } from '../../core/services/session';
import { mensajeApi } from '../../core/services/personal-api';
export const hoyLocal=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
@Component({selector:'app-inventario',imports:[FormsModule,MatIconModule],templateUrl:'./inventario.html',styleUrl:'./inventario.scss'})
export class Inventario {
  private api=inject(GestionApi);private solicitudCarga=0;corte=signal('');session=inject(Session);
  articulos=signal<any[]>([]);ubicaciones=signal<any[]>([]);saldos=signal<any[]>([]);movimientos=signal<any[]>([]);
  cargando=signal(true);guardando=signal(false);error=signal('');mensaje=signal('');form=signal<any|null>(null);tab=signal('saldos');busqueda=signal('');ubicacion=signal('');fecha=signal(hoyLocal());desde=signal('');hasta=signal(hoyLocal());
  visibles=computed(()=>{const q=this.busqueda().toLocaleLowerCase();return this.saldos().filter(s=>(!this.ubicacion() || s.ubicacion_id===this.ubicacion()) && (!q || `${s.codigo} ${s.descripcion} ${s.variante}`.toLocaleLowerCase().includes(q)));});
  historial=computed(()=>{const q=this.busqueda().toLocaleLowerCase();return this.movimientos().filter(m=>(!this.desde() || m.fecha>=this.desde()) && (!this.hasta() || m.fecha<=this.hasta()) && (!q || `${m.codigo} ${m.descripcion} ${m.variante} ${m.origen||''} ${m.destino||''} ${m.responsable}`.toLocaleLowerCase().includes(q)));});
  bajas=computed(()=>this.visibles().filter(s=>s.registros>0 && s.cantidad<s.minimo).length);
  hoy=hoyLocal();
  constructor(){void this.cargar();}
  async cargar(){const solicitud=++this.solicitudCarga,fecha=this.fecha();this.cargando.set(true);this.error.set('');try{const r=await firstValueFrom(forkJoin({a:this.api.lista('articulos'),u:this.api.lista('inventario-empresas'),s:this.api.existencias(fecha),m:this.api.lista('movimientos')}));if(solicitud!==this.solicitudCarga)return;this.corte.set(fecha);this.articulos.set(r.a);this.ubicaciones.set(r.u);this.saldos.set(r.s);this.movimientos.set(r.m);}catch(e){this.error.set(mensajeApi(e));}finally{if(solicitud===this.solicitudCarga)this.cargando.set(false);}}
  abrir(){this.error.set('');this.mensaje.set('');this.form.set({solicitud:crypto.randomUUID(),tipo:'ENTRADA',articulo_id:'',origen_id:'',destino_id:'',cantidad:1,fecha:hoyLocal(),motivo:''});}
  cerrar(){if(!this.guardando())this.form.set(null);}
  async guardar(){if(this.guardando())return;this.guardando.set(true);this.error.set('');try{const r=await firstValueFrom(this.api.movimiento(this.form()));this.form.set(null);this.mensaje.set(r.repetido?'El movimiento ya estaba registrado; no se duplicó.':'Movimiento registrado correctamente.');this.fecha.set(hoyLocal());await this.cargar();}catch(e){this.error.set(mensajeApi(e));}finally{this.guardando.set(false);}}
  exportar(){if(this.tab()==='saldos')descargarCsv('existencias-'+this.corte()+'.csv',['Fecha de corte','Código','Artículo','Variante','Unidad','Empresa','Estado del saldo','Cantidad','Mínimo'],this.visibles().map(s=>[this.corte(),s.codigo,s.descripcion,s.variante,s.unidad,s.empresa,s.registros?'Registrado':'Sin saldo registrado',s.registros?s.cantidad:null,s.minimo]));else descargarCsv('movimientos.csv',['Fecha','Tipo','Código','Artículo','Variante','Origen','Destino','Cantidad','Motivo','Responsable'],this.historial().map(m=>[m.fecha,m.tipo,m.codigo,m.descripcion,m.variante,m.origen,m.destino,m.cantidad,m.motivo,m.responsable]));}
  tipo(valor:string){return ({SALDO_INICIAL:'Saldo inicial',ENTRADA:'Entrada',TRASLADO:'Traslado',AJUSTE:'Ajuste'} as Record<string,string>)[valor]||valor;}
}
