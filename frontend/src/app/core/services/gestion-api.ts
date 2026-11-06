import { Injectable,inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
@Injectable({providedIn:'root'})
export class GestionApi {
  private http=inject(HttpClient);
  lista(entidad:string){return this.http.get<any[]>('/api/'+entidad);}
  guardar(entidad:string,datos:any){return datos.id?this.http.put<any>('/api/'+entidad+'/'+encodeURIComponent(datos.id),datos):this.http.post<any>('/api/'+entidad,datos);}
  resumen(){return this.http.get<any>('/api/resumen');}
  existencias(fecha:string){return this.http.get<any[]>('/api/existencias-empresa',{params:{fecha}});}
  movimiento(datos:any){return this.http.post<any>('/api/movimientos',datos);}
}
export function descargarCsv(nombre:string,cabeceras:string[],filas:unknown[][]){
  const celda=(v:unknown)=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const blob=new Blob(['\uFEFF'+[cabeceras,...filas].map(f=>f.map(celda).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=nombre;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
