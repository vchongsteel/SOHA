import { Component,inject,signal,computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Avisos } from '../../core/services/avisos';
import { mensajeApi } from '../../core/services/personal-api';
@Component({selector:'app-notificaciones',imports:[FormsModule,RouterLink],templateUrl:'./notificaciones.html',styleUrl:'./notificaciones.scss'})
export class Notificaciones {
  private http=inject(HttpClient);avisos=inject(Avisos);lista=signal<any[]>([]);dias=signal(30);estado=signal('');cargando=signal(true);error=signal('');
  visibles=computed(()=>this.lista().filter(a=>!this.estado() || a.estado===this.estado()));
  constructor(){void this.cargar();}
  async cargar(){this.cargando.set(true);this.error.set('');try{const r=await firstValueFrom(this.http.get<{avisos:any[]}>('/api/notificaciones',{params:{dias:this.dias()}}));this.lista.set(r.avisos);await this.avisos.actualizar();}catch(e){this.error.set(mensajeApi(e));}finally{this.cargando.set(false);}}
  async marcar(id:string){try{await this.avisos.leer([id]);await this.cargar();}catch(e){this.error.set(mensajeApi(e));}}
}
