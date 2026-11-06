import {PiePagina} from '../../shared/pie-pagina';
import {Component,inject,signal} from '@angular/core';
import {FormBuilder,ReactiveFormsModule,Validators} from '@angular/forms';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {MatIconModule} from '@angular/material/icon';
import {firstValueFrom} from 'rxjs';
import {GestionApi} from '../../core/services/gestion-api';
import {mensajeApi} from '../../core/services/personal-api';
@Component({selector:'app-registrar-usuario',imports:[ReactiveFormsModule,RouterLink,MatIconModule,PiePagina],templateUrl:'./registrar-usuario.html',styleUrl:'./registrar-usuario.scss'})
export class RegistrarUsuario {
 publico=inject(ActivatedRoute).snapshot.data['publico']===true;
 private fb=inject(FormBuilder);private api=inject(GestionApi);
 guardando=signal(false);error=signal('');creado=signal('');mostrar=signal(false);mostrarConfirmacion=signal(false);
 formulario=this.fb.nonNullable.group({nombre:['',[Validators.required,Validators.maxLength(120)]],usuario:['',[Validators.required,Validators.maxLength(60)]],rol:this.fb.nonNullable.control<'Consulta'|'Registro'|'Administrador'>('Consulta'),password:['',[Validators.required,Validators.minLength(8),Validators.maxLength(128)]],confirmacion:['',[Validators.required,Validators.minLength(8),Validators.maxLength(128)]]},{validators:grupo=>grupo.get('password')?.value===grupo.get('confirmacion')?.value?null:{contraseñasDistintas:true}});
 async guardar(){
  if(this.guardando())return;
  this.formulario.patchValue({nombre:this.formulario.controls.nombre.value.trim(),usuario:this.formulario.controls.usuario.value.trim().toLowerCase()});this.formulario.markAllAsTouched();this.error.set('');
  if(this.formulario.invalid)return;
  this.guardando.set(true);
  try{const {confirmacion,...datos}=this.formulario.getRawValue();const usuario=await firstValueFrom(this.publico?this.api.guardar('auth/registro',{nombre:datos.nombre,usuario:datos.usuario,password:datos.password}):this.api.guardar('usuarios',{...datos,activo:1}));this.creado.set(usuario.nombre);this.formulario.reset({nombre:'',usuario:'',rol:'Consulta',password:'',confirmacion:''});this.mostrar.set(false);this.mostrarConfirmacion.set(false);}catch(e){this.error.set(mensajeApi(e));}finally{this.guardando.set(false);}
 }
}
