import { Component,inject,signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom,forkJoin } from 'rxjs';
import { GestionApi } from '../../core/services/gestion-api';
import { Session } from '../../core/services/session';
import { mensajeApi } from '../../core/services/personal-api';
@Component({selector:'app-inicio',imports:[RouterLink,MatIconModule],templateUrl:'./inicio.html',styleUrl:'./inicio.scss'})
export class Inicio {
  private api=inject(GestionApi);session=inject(Session);resumen=signal<any>(null);movimientos=signal<any[]>([]);error=signal('');cargando=signal(true);
  constructor(){void this.cargar();}
  async cargar(){this.cargando.set(true);this.error.set('');try{const r=await firstValueFrom(forkJoin({r:this.api.resumen(),m:this.api.lista('movimientos')}));this.resumen.set(r.r);this.movimientos.set(r.m.slice(0,5));}catch(e){this.error.set(mensajeApi(e));}finally{this.cargando.set(false);}}
}
