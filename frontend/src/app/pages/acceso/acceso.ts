import { PiePagina } from '../../shared/pie-pagina';
import { MatIconModule } from '@angular/material/icon';
import { Component,inject,signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router,RouterLink } from '@angular/router';
import { Session } from '../../core/services/session';
import {errorAcceso} from './error-acceso';
@Component({selector:'app-acceso',imports:[FormsModule,MatIconModule,PiePagina,RouterLink],templateUrl:'./acceso.html',styleUrl:'./acceso.scss'})
export class Acceso {
  session=inject(Session);private router=inject(Router);
  cargando=signal(true);guardando=signal(false);error=signal('');errorTitulo=signal('No pudimos iniciar sesión');credencialesInvalidas=signal(false);
  datos={nombre:'',usuario:'',password:''};
  confirmacion='';mostrar=signal(false);mostrarConfirmacion=signal(false);
  limpiarError(){this.error.set('');this.credencialesInvalidas.set(false);this.errorTitulo.set('No pudimos iniciar sesión');}
  corregirDatos(){if(this.credencialesInvalidas())this.limpiarError();}
  private mostrarError(e:unknown){const aviso=errorAcceso(e);this.errorTitulo.set(aviso.titulo);this.error.set(aviso.mensaje);this.credencialesInvalidas.set(aviso.credenciales);}
  constructor(){void this.cargar();}
  async cargar(){this.limpiarError();this.cargando.set(true);try{await this.session.refresh();if(this.session.usuario())await this.router.navigateByUrl('/bienvenida');}catch(e){this.mostrarError(e);}finally{this.cargando.set(false);}}
  async entrar(){if(this.guardando())return;if(this.session.requiereConfiguracion() && this.datos.password!==this.confirmacion){this.error.set('Las contraseñas no coinciden.');return;}this.limpiarError();this.guardando.set(true);try{await this.session.ingresar(this.datos,this.session.requiereConfiguracion());this.datos.password='';this.confirmacion='';await this.router.navigateByUrl('/bienvenida');}catch(e){this.mostrarError(e);}finally{this.guardando.set(false);}}
}
