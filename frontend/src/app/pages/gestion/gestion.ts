import {RouterLink} from '@angular/router';
import { Component,inject,signal,computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom,forkJoin } from 'rxjs';
import { GestionApi,descargarCsv } from '../../core/services/gestion-api';
import { Session } from '../../core/services/session';
import { mensajeApi } from '../../core/services/personal-api';

interface Campo {key:string;label:string;tipo?:string;opciones?:string[];opcional?:boolean;max?:number;}
const configuraciones:Record<string,{titulo:string;sub:string;campos:Campo[];columnas:string[]}>={
  proyectos:{titulo:'Proyectos',sub:'Proyectos de STEEL e IEM y su estado.',columnas:['codigo','nombre','empresa'],campos:[{key:'codigo',label:'Código',max:40},{key:'nombre',label:'Nombre'},{key:'empresa',label:'Empresa',opciones:['STEEL','IEM']}]},
  proveedores:{titulo:'Proveedores',sub:'Opciones de suministro para los artículos de EPP.',columnas:['codigo','nombre','contacto'],campos:[{key:'codigo',label:'Código',max:40},{key:'nombre',label:'Nombre'},{key:'contacto',label:'Contacto o referencia',opcional:true,max:200}]},
  articulos:{titulo:'Catálogo de EPP',sub:'Cada código identifica un artículo y su talla o variante.',columnas:['codigo','descripcion','variante','unidad','proveedores'],campos:[{key:'codigo',label:'Código interno',max:40},{key:'descripcion',label:'Descripción',max:1000},{key:'variante',label:'Talla o variante',opcional:true,max:80},{key:'unidad',label:'Unidad de medida',max:30},{key:'minimo',label:'Existencia mínima por ubicación',tipo:'number'},{key:'ficha_url',label:'Enlace de ficha técnica',tipo:'url',opcional:true,max:2000}]},
  usuarios:{titulo:'Usuarios y permisos',sub:'Administrador: acceso completo. Registro: captura y consulta. Consulta: solo lectura.',columnas:['usuario','nombre','rol'],campos:[{key:'usuario',label:'Usuario',max:60},{key:'nombre',label:'Nombre'},{key:'rol',label:'Permiso',opciones:['Administrador','Registro','Consulta']},{key:'password',label:'Contraseña (mínimo 8 caracteres)',tipo:'password',opcional:true,max:128}]},
};
@Component({selector:'app-gestion',imports:[FormsModule,MatIconModule,RouterLink],templateUrl:'./gestion.html',styleUrl:'./gestion.scss'})
export class Gestion {
  private api=inject(GestionApi);session=inject(Session);private ruta=inject(ActivatedRoute);
  entidad=this.ruta.snapshot.data['entidad'] as string;config=configuraciones[this.entidad];
  detalleOrigen=signal<any|null>(null);filas=signal<any[]>([]);proveedores=signal<any[]>([]);proyectos=signal<any[]>([]);cargando=signal(true);guardando=signal(false);error=signal('');mensaje=signal('');form=signal<any|null>(null);busqueda=signal('');estado=signal('1');
  pagina=signal(1);tamano=signal(20);proveedorFiltro=signal('');pendientes=signal(false);
  normalizar(valor:unknown){return String(valor??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();}
  visibles=computed(()=>{const q=this.normalizar(this.busqueda()).trim();return this.filas().filter(r=>(!this.estado() || String(r.activo)===this.estado()) && (!this.proveedorFiltro() || (r.proveedores||[]).some((p:any)=>p.proveedor_id===this.proveedorFiltro())) && (!this.pendientes() || !r.unidad || r.unidad==='Por definir') && (!q || this.normalizar([...this.config.columnas.map(k=>k==='proveedores'?this.valor(r,k):r[k]),this.origen(r)?.codigo_original].join(' ')).includes(q)));});
  totalPaginas=computed(()=>Math.max(1,Math.ceil(this.visibles().length/this.tamano())));
  paginaActual=computed(()=>Math.min(this.pagina(),this.totalPaginas()));
  paginaFilas=computed(()=>this.visibles().slice((this.paginaActual()-1)*this.tamano(),this.paginaActual()*this.tamano()));
  filtrar(){this.pagina.set(1);}
  exportarCatalogo(){descargarCsv('catalogo-epp.csv',['Código interno','Código original','Descripción','Variante','Unidad','Proveedores','Estado'],this.visibles().map(r=>[r.codigo,this.origen(r)?.codigo_original,r.descripcion,r.variante,r.unidad,this.valor(r,'proveedores'),r.activo?'Activo':'Inactivo']));}

  constructor(){void this.cargar();}
  async cargar(){this.cargando.set(true);this.error.set('');try{const r=await firstValueFrom(forkJoin({filas:this.api.lista(this.entidad),proveedores:this.api.lista('proveedores'),proyectos:this.api.lista('proyectos')}));this.filas.set(r.filas);this.proveedores.set(r.proveedores);this.proyectos.set(r.proyectos);}catch(e){this.error.set(mensajeApi(e));}finally{this.cargando.set(false);}}
  abrir(fila?:any){this.confirmacion='';this.mostrarClave.set(false);this.error.set('');this.mensaje.set('');this.form.set(fila?{...fila,password:'',proveedores:structuredClone(fila.proveedores||[])}:{activo:1,empresa:'',tipo:'Bodega',proyecto_id:null,unidad:'Unidad',minimo:0,rol:'Registro',proveedores:[]});}
  cerrar(){if(!this.guardando())this.form.set(null);}
  proveedorMarcado(id:string){return this.form()?.proveedores?.some((p:any)=>p.proveedor_id===id);}
  proveedorCodigo(id:string){return this.form()?.proveedores?.find((p:any)=>p.proveedor_id===id)?.codigo_proveedor || '';}
  cambiarProveedor(id:string,marcado:boolean){const f=this.form();f.proveedores=marcado?[...f.proveedores,{proveedor_id:id,codigo_proveedor:''}]:f.proveedores.filter((p:any)=>p.proveedor_id!==id);}
  codigoProveedor(id:string,codigo:string){const p=this.form().proveedores.find((p:any)=>p.proveedor_id===id);if(p)p.codigo_proveedor=codigo;}
  mostrarClave=signal(false);confirmacion='';
  async guardar(){if(this.guardando())return;if(this.entidad==='usuarios' && this.form().password && this.form().password!==this.confirmacion){this.error.set('Las contraseñas no coinciden.');return;}this.guardando.set(true);this.error.set('');try{await firstValueFrom(this.api.guardar(this.entidad,this.form()));this.form.set(null);this.mensaje.set('Registro guardado correctamente.');await this.cargar();}catch(e){this.error.set(mensajeApi(e));}finally{this.guardando.set(false);}}
  origen(fila:any){try{return JSON.parse(fila.datos_origen || 'null');}catch{return null;}}
  verOrigen(fila:any){this.detalleOrigen.set({...this.origen(fila),descripcion:fila.descripcion});requestAnimationFrame(()=>document.getElementById('detalle-catalogo')?.scrollIntoView({behavior:'smooth',block:'start'}));}
  valor(fila:any,key:string){return key==='proveedores'?(fila.proveedores||[]).map((p:any)=>p.nombre+(p.codigo_proveedor?' · '+p.codigo_proveedor:'')).join(', ') || 'Sin proveedor':fila[key] || '—';}
  etiqueta(key:string){if(key==='proveedores')return 'Proveedores / códigos externos';return this.config.campos.find(c=>c.key===key)?.label||key;}
}
