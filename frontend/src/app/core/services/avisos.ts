import { Injectable,inject,signal,computed,DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom,timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Session } from './session';
@Injectable({providedIn:'root'})
export class Avisos {
  private http=inject(HttpClient);private session=inject(Session);private destroy=inject(DestroyRef);
  lista=signal<any[]>([]);error=signal('');noLeidos=computed(()=>this.lista().filter(a=>!a.leida).length);
  constructor(){timer(0,60000).pipe(takeUntilDestroyed(this.destroy)).subscribe(()=>{if(this.session.usuario())void this.actualizar();});}
  async actualizar(){try{const r=await firstValueFrom(this.http.get<{avisos:any[]}>('/api/notificaciones'));this.lista.set(r.avisos);this.error.set('');}catch{this.error.set('No se pudieron actualizar los avisos.');}}
  async leer(ids:string[]){await firstValueFrom(this.http.post('/api/notificaciones/leidas',{ids}));await this.actualizar();}
}
