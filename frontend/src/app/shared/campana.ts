import { Component,inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Avisos } from '../core/services/avisos';
@Component({selector:'app-campana',imports:[RouterLink,MatIconModule],template:`<a class="campana" routerLink="/notificaciones" [attr.aria-label]="'Notificaciones: '+avisos.noLeidos()+' sin leer'"><mat-icon>notifications_none</mat-icon>@if(avisos.noLeidos()){<span>{{avisos.noLeidos()>99?'99+':avisos.noLeidos()}}</span>}</a>`,styles:[`:host{display:block}.campana{position:relative;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;color:#556170;text-decoration:none}.campana:hover{background:#e4f5f1;color:#008b80}.campana span{position:absolute;top:0;right:0;min-width:17px;padding:2px 4px;border-radius:10px;background:#b84b3f;color:white;font-size:10px;text-align:center}.campana:focus-visible{outline:3px solid #008b80;outline-offset:3px}`]})
export class Campana {avisos=inject(Avisos);}
