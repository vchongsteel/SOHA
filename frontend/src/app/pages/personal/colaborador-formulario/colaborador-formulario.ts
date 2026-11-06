import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { finalize } from 'rxjs';
import { Colaborador, PersonalApi, mensajeApi } from '../../../core/services/personal-api';

interface DatosFormulario {
  codigosExistentes: string[];
  colaborador?: Colaborador;
}

@Component({
  selector: 'app-colaborador-formulario',
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  templateUrl: './colaborador-formulario.html',
  styleUrl: './colaborador-formulario.scss',
})
export class ColaboradorFormulario {
  private fb = inject(FormBuilder);
  private dialogo = inject(MatDialogRef<ColaboradorFormulario>);
  private datos = inject<DatosFormulario>(MAT_DIALOG_DATA);
  private api = inject(PersonalApi);
  readonly esEdicion = Boolean(this.datos.colaborador);
  guardando = signal(false);
  error = signal('');
  codigoDuplicado = false;

  formulario = this.fb.nonNullable.group({
    proyecto_id: this.fb.control<string | null>(null),
    empresa: this.fb.control<'STEEL' | 'IEM' | null>(null, Validators.required),
    codigo: ['', [Validators.required, Validators.maxLength(40)]],
    nombre: ['', [Validators.required, Validators.maxLength(120)]],
    puesto: ['', [Validators.required, Validators.maxLength(80)]],
    area: ['', [Validators.required, Validators.maxLength(80)]],
    estado: this.fb.nonNullable.control<'Activo' | 'Inactivo'>('Activo'),
  });


  constructor() {
    if (this.datos.colaborador) this.formulario.patchValue(this.datos.colaborador);
  }

  cancelar() {
    if (!this.guardando()) this.dialogo.close();
  }

  guardar() {
    if (this.guardando()) return;
    const valores = this.formulario.getRawValue();
    this.formulario.patchValue({
      codigo: valores.codigo.trim().toUpperCase(),
      nombre: valores.nombre.trim(),
      puesto: valores.puesto.trim(),
      area: valores.area.trim(),
    });
    this.formulario.markAllAsTouched();
    this.error.set('');
    const datos = this.formulario.getRawValue();
    if(this.datos.colaborador && this.datos.colaborador.empresa!==datos.empresa)datos.proyecto_id=null;
    this.codigoDuplicado = this.datos.codigosExistentes.some(c => c.trim().toUpperCase() === datos.codigo);
    if (this.formulario.invalid || this.codigoDuplicado) return;
    this.guardando.set(true);
    this.formulario.disable();
    this.dialogo.disableClose = true;
    const peticion = this.datos.colaborador
      ? this.api.actualizar(this.datos.colaborador, datos)
      : this.api.crear(datos);
    peticion.pipe(finalize(() => {
      this.guardando.set(false);
      this.formulario.enable();
      this.dialogo.disableClose = false;
    })).subscribe({
      next: persona => this.dialogo.close(persona),
      error: error => this.error.set(mensajeApi(error)),
    });
  }
}
