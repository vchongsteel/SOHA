import { Component,inject,signal,computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom,forkJoin } from 'rxjs';
import { GestionApi,descargarCsv } from '../../core/services/gestion-api';
import { mensajeApi } from '../../core/services/personal-api';
import { hoyLocal } from '../inventario/inventario';
@Component({selector:'app-reportes',imports:[FormsModule],templateUrl:'./reportes.html',styleUrl:'./reportes.scss'})
export class Reportes {
  private api=inject(GestionApi);corte=signal('');private solicitud=0;fecha=signal(hoyLocal());empresa=signal('');ubicacion=signal('');filas=signal<any[]>([]);ubicaciones=signal<any[]>([]);cargando=signal(true);error=signal('');
  visibles=computed(()=>this.filas().filter(r=>(!this.empresa() || r.empresa===this.empresa()) && (!this.ubicacion() || r.ubicacion_id===this.ubicacion())));
  constructor(){void this.cargar();}
  async cargar(){const solicitud=++this.solicitud,fecha=this.fecha();this.cargando.set(true);this.error.set('');try{const r=await firstValueFrom(forkJoin({s:this.api.existencias(fecha),u:this.api.lista('inventario-empresas')}));if(solicitud!==this.solicitud)return;this.filas.set(r.s);this.ubicaciones.set(r.u);this.corte.set(fecha);}catch(e){this.error.set(mensajeApi(e));}finally{if(solicitud===this.solicitud)this.cargando.set(false);}}
  exportar(){descargarCsv('reporte-existencias-'+this.corte()+'.csv',['Fecha de corte','Empresa','Estado del saldo','Código','Artículo','Variante','Unidad','Existencia','Mínimo'],this.visibles().map(s=>[this.corte(),s.empresa,s.registros?'Registrado':'Sin saldo registrado',s.codigo,s.descripcion,s.variante,s.unidad,s.registros?s.cantidad:null,s.minimo]));}
}
