import { Session } from '../../core/services/session';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { finalize } from 'rxjs';
import { Colaborador, PersonalApi, mensajeApi } from '../../core/services/personal-api';
import { ColaboradorFormulario } from './colaborador-formulario/colaborador-formulario';



interface DatosDialogo {
  codigosExistentes: string[];
  colaborador?: Colaborador;
}

@Component({
  selector: 'app-personal',
  imports: [MatIconModule, RouterLink],
  templateUrl: './personal.html',
  styleUrl: './personal.scss',
})
export class Personal {
  session = inject(Session);
  private dialogos = inject(MatDialog);
  private api = inject(PersonalApi);
  cargando = signal(true);
  errorCarga = signal('');

  constructor() { this.cargar(); }

  cargar() {
    if (this.cargando() && this.colaboradores().length) return;
    this.cargando.set(true);
    this.errorCarga.set('');
    this.api.listar().pipe(finalize(() => this.cargando.set(false))).subscribe({
      next: lista => { this.colaboradores.set(lista); this.pagina.set(0); },
      error: error => this.errorCarga.set(mensajeApi(error)),
    });
  }

  readonly tamanoPagina = 5;

  busqueda = signal('');
  area = signal('');
  estado = signal('');
  pagina = signal(0);
  mensaje = signal('');

  readonly colaboradores = signal<Colaborador[]>([]);

  readonly areas = computed(() =>
    [...new Set(this.colaboradores().map(persona => persona.area))]
      .sort()
  );

  readonly total = computed(() => this.colaboradores().length);

  readonly activos = computed(() =>
    this.colaboradores().filter(persona => persona.estado === 'Activo').length
  );

  readonly inactivos = computed(() =>
    this.colaboradores().filter(persona => persona.estado === 'Inactivo').length
  );

  readonly filtrados = computed(() => {
    const texto = this.normalizar(this.busqueda().trim());

    return this.colaboradores().filter(persona =>
      (
        !texto ||
        this.normalizar(
          `${persona.nombre} ${persona.codigo} ${persona.puesto}`
        ).includes(texto)
      ) &&
      (!this.area() || persona.area === this.area()) &&
      (!this.estado() || persona.estado === this.estado())
    );
  });

  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.filtrados().length / this.tamanoPagina))
  );

  readonly visibles = computed(() => {
    const inicio = this.pagina() * this.tamanoPagina;
    return this.filtrados().slice(inicio, inicio + this.tamanoPagina);
  });

  readonly desde = computed(() =>
    this.filtrados().length
      ? this.pagina() * this.tamanoPagina + 1
      : 0
  );

  readonly hasta = computed(() =>
    Math.min(
      (this.pagina() + 1) * this.tamanoPagina,
      this.filtrados().length
    )
  );

  readonly hayFiltros = computed(() =>
    Boolean(this.busqueda() || this.area() || this.estado())
  );

  buscar(valor: string) {
    this.busqueda.set(valor);
    this.pagina.set(0);
  }

  cambiarArea(valor: string) {
    this.area.set(valor);
    this.pagina.set(0);
  }

  cambiarEstado(valor: string) {
    this.estado.set(valor);
    this.pagina.set(0);
  }

  limpiarFiltros() {
    this.busqueda.set('');
    this.area.set('');
    this.estado.set('');
    this.pagina.set(0);
  }

  anterior() {
    this.pagina.update(actual => Math.max(0, actual - 1));
  }

  siguiente() {
    this.pagina.update(actual =>
      Math.min(this.totalPaginas() - 1, actual + 1)
    );
  }

  iniciales(nombre: string) {
    return nombre.trim().split(/\s+/)
      .slice(0, 2)
      .map(parte => parte[0])
      .join('')
      .toUpperCase();
  }

  nuevoColaborador() {
    this.abrirFormulario();
  }

  editarColaborador(persona: Colaborador) {
    this.abrirFormulario(persona);
  }

  private abrirFormulario(persona?: Colaborador) {
    const data: DatosDialogo = {
      codigosExistentes: this.colaboradores()
        .filter(item => item.id !== persona?.id)
        .map(item => item.codigo),
    };

    if (persona) {
      data.colaborador = persona;
    }

    const dialogo = this.dialogos.open<
      ColaboradorFormulario,
      DatosDialogo,
      Colaborador
    >(ColaboradorFormulario, {
      width: '600px',
      maxWidth: '95vw',
      maxHeight: '90dvh',
      ariaLabel: persona ? 'Editar colaborador' : 'Nuevo colaborador',
      data,
    });

    dialogo.afterClosed().subscribe(resultado => {
      if (!resultado) {
        return;
      }

      if (persona) {
        this.colaboradores.update(lista =>
          lista.map(item =>
            item.id === persona.id
              ? resultado
              : item
          )
        );

        this.mensaje.set('Los cambios se guardaron correctamente.');
      } else {
        this.colaboradores.update(lista => [
          resultado,
          ...lista,
        ]);

        this.mensaje.set('El colaborador se agregó correctamente.');
      }

      this.limpiarFiltros();
    });
  }

  private normalizar(texto: string) {
    return texto.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}