import {Component,inject} from '@angular/core';
import {RouterLink} from '@angular/router';
import {MatIconModule} from '@angular/material/icon';
import {Session} from '../../core/services/session';
import {PiePagina} from '../../shared/pie-pagina';
@Component({selector:'app-bienvenida',imports:[RouterLink,MatIconModule,PiePagina],templateUrl:'./bienvenida.html',styleUrl:'./bienvenida.scss'})
export class Bienvenida {session=inject(Session);}
