import { HistorialCapacitaciones } from './historial-capacitaciones';
import { Session } from '../../../core/services/session';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { catchError, distinctUntilChanged, finalize, firstValueFrom, map, of, switchMap } from 'rxjs';
import { Colaborador, PersonalApi, mensajeApi } from '../../../core/services/personal-api';
import { ColaboradorFormulario } from '../colaborador-formulario/colaborador-formulario';

@Component({
  selector: 'app-ficha-personal',
  imports: [RouterLink, MatIconModule, HistorialCapacitaciones],
  templateUrl: './ficha-personal.html',
  styleUrl: './ficha-personal.scss',
})
export class FichaPersonal {
  session = inject(Session);
  private api = inject(PersonalApi);
  private ruta = inject(ActivatedRoute);
  private dialogos = inject(MatDialog);
  private destroyRef = inject(DestroyRef);
  persona = signal<Colaborador | null>(null);
  cargando = signal(true);
  preparandoEdicion = signal(false);
  error = signal('');
  errorEdicion = signal('');
  mensaje = signal('');

  constructor() {
    this.ruta.paramMap.pipe(
      map(params => params.get('id') || ''),
      distinctUntilChanged(),
      switchMap(id => {
        this.cargando.set(true);
        this.error.set('');
        this.errorEdicion.set('');
        this.mensaje.set('');
        this.persona.set(null);
        return this.api.obtener(id).pipe(
          catchError(error => { this.error.set(mensajeApi(error)); return of(null); }),
          finalize(() => this.cargando.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(persona => this.persona.set(persona));
  }

  origen(persona:Colaborador){try{return JSON.parse(persona.datos_origen || 'null');}catch{return null;}}
  iniciales(nombre: string) {
    return nombre.trim().split(/\s+/).slice(0, 2).map(parte => parte[0]).join('').toUpperCase();
  }

  async editar() {
    const persona = this.persona();
    if (!persona || this.preparandoEdicion()) return;
    this.preparandoEdicion.set(true);
    this.errorEdicion.set('');
    try {
      const lista = await firstValueFrom(this.api.listar());
      if (this.destroyRef.destroyed) return;
      const dialogo = this.dialogos.open<ColaboradorFormulario, { codigosExistentes: string[]; colaborador: Colaborador }, Colaborador>(ColaboradorFormulario, {
        width: '600px', maxWidth: '95vw', maxHeight: '90dvh', ariaLabel: 'Editar colaborador',
        data: { colaborador: persona, codigosExistentes: lista.filter(item => item.id !== persona.id).map(item => item.codigo) },
      });
      const actualizado = await firstValueFrom(dialogo.afterClosed());
      if (actualizado && !this.destroyRef.destroyed) {
        this.persona.set(actualizado);
        this.mensaje.set('Los datos del colaborador se actualizaron correctamente.');
      }
    } catch (error) {
      if (!this.destroyRef.destroyed) this.errorEdicion.set(mensajeApi(error));
    } finally {
      if (!this.destroyRef.destroyed) this.preparandoEdicion.set(false);
    }
  }
}
