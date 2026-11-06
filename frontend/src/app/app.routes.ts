import { Routes } from '@angular/router';
import { Shell } from './layout/shell/shell';
import { accesoGuard } from './core/services/session';

export const routes:Routes=[
  {path:'acceso',loadComponent:()=>import('./pages/acceso/acceso').then(m=>m.Acceso)},
  {path:'',component:Shell,canActivate:[accesoGuard],canActivateChild:[accesoGuard],children:[
    {path:'',pathMatch:'full',redirectTo:'inicio'},
    {path:'inicio',loadComponent:()=>import('./pages/inicio/inicio').then(m=>m.Inicio)},
    {path:'personal',loadComponent:()=>import('./pages/personal/personal').then(m=>m.Personal)},
    {path:'personal/:id',loadComponent:()=>import('./pages/personal/ficha-personal/ficha-personal').then(m=>m.FichaPersonal)},
    {path:'proyectos',data:{entidad:'proyectos'},loadComponent:()=>import('./pages/gestion/gestion').then(m=>m.Gestion)},
    {path:'catalogo',data:{entidad:'articulos'},loadComponent:()=>import('./pages/gestion/gestion').then(m=>m.Gestion)},
    {path:'proveedores',data:{entidad:'proveedores'},loadComponent:()=>import('./pages/gestion/gestion').then(m=>m.Gestion)},
    {path:'usuarios',data:{entidad:'usuarios'},loadComponent:()=>import('./pages/gestion/gestion').then(m=>m.Gestion)},
    {path:'capacitaciones',loadComponent:()=>import('./pages/capacitaciones/capacitaciones').then(m=>m.Capacitaciones)},
    {path:'notificaciones',loadComponent:()=>import('./pages/notificaciones/notificaciones').then(m=>m.Notificaciones)},
    {path:'inventario',loadComponent:()=>import('./pages/inventario/inventario').then(m=>m.Inventario)},
    {path:'reportes',loadComponent:()=>import('./pages/reportes/reportes').then(m=>m.Reportes)},
    {path:'**',redirectTo:'inicio'},
  ]},
];
