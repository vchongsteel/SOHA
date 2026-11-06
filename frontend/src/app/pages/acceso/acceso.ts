import { MatIconModule } from '@angular/material/icon';
import { Component,inject,signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Session } from '../../core/services/session';
import { mensajeApi } from '../../core/services/personal-api';
@Component({selector:'app-acceso',imports:[FormsModule,MatIconModule],templateUrl:'./acceso.html',styleUrl:'./acceso.scss'})
export class Acceso {
  session=inject(Session);private router=inject(Router);
  cargando=signal(true);guardando=signal(false);error=signal('');
  datos={nombre:'',usuario:'',password:''};
  confirmacion='';mostrar=signal(false);mostrarConfirmacion=signal(false);
  constructor(){void this.cargar();}
  async cargar(){this.error.set('');this.cargando.set(true);try{await this.session.refresh();if(this.session.usuario())await this.router.navigateByUrl('/inicio');}catch(e){this.error.set(mensajeApi(e));}finally{this.cargando.set(false);}}
  async entrar(){if(this.guardando())return;if(this.session.requiereConfiguracion() && this.datos.password!==this.confirmacion){this.error.set('Las contraseñas no coinciden.');return;}this.error.set('');this.guardando.set(true);try{await this.session.ingresar(this.datos,this.session.requiereConfiguracion());this.datos.password='';this.confirmacion='';await this.router.navigateByUrl('/inicio');}catch(e){this.error.set(mensajeApi(e));}finally{this.guardando.set(false);}}
}
