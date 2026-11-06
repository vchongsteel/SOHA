import { Campana } from '../../shared/campana';
import { Session } from '../../core/services/session';
import { Router } from '@angular/router';
import { Component, inject } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-shell',
  imports: [
    Campana, RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  session = inject(Session);
  private router = inject(Router);
  async salir() { await this.session.salir(); await this.router.navigateByUrl('/acceso'); }
  private breakpoints = inject(BreakpointObserver);

  esCompacto = toSignal(
    this.breakpoints
      .observe('(max-width: 1023px)')
      .pipe(map(resultado => resultado.matches)),
    { initialValue: false }
  );

  esCelular = toSignal(
    this.breakpoints
      .observe('(max-width: 599px)')
      .pipe(map(resultado => resultado.matches)),
    { initialValue: false }
  );

  menu = [
    { ruta:'/inicio', etiqueta:'Inicio', icono:'home' },
    { ruta:'/personal', etiqueta:'Personal', icono:'groups' },
    { ruta:'/proyectos', etiqueta:'Proyectos', icono:'business' },
    { ruta:'/catalogo', etiqueta:'Catálogo EPP', icono:'category' },
    { ruta:'/proveedores', etiqueta:'Proveedores', icono:'local_shipping' },
    { ruta:'/capacitaciones', etiqueta:'Capacitaciones', icono:'school' },
    { ruta:'/inventario', etiqueta:'Inventario', icono:'inventory_2' },
    { ruta:'/reportes', etiqueta:'Reportes', icono:'bar_chart' },
    { ruta:'/usuarios', etiqueta:'Usuarios', icono:'manage_accounts' },
  ];
  menuMovil = [this.menu[0],this.menu[1],this.menu[6]];
}
