import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

export interface Colaborador {
  id: string;
  codigo: string;
  nombre: string;
  puesto: string;
  area: string;
  estado: 'Activo' | 'Inactivo';
  empresa: 'STEEL' | 'IEM' | null;
  proyecto_id: string | null;
  proyecto_nombre?: string | null;
  datos_origen?: string | null;
  version: number;
}

export type DatosColaborador = Omit<Colaborador, 'id' | 'version'>;

export function mensajeApi(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0 || error.status === 502 || error.status === 504) return 'No se pudo conectar con el servidor. Verificá que el backend esté encendido e intentá de nuevo.';
    if (error.status === 200) return 'La aplicación recibió una página en lugar de datos. Reiniciá Angular para activar la conexión con el backend.';
    if (typeof error.error?.message === 'string') return error.error.message;
  }
  return 'No se pudo completar la operación. Intentá de nuevo.';
}

@Injectable({ providedIn: 'root' })
export class PersonalApi {
  private http = inject(HttpClient);
  obtener(id: string) { return this.http.get<Colaborador>('/api/colaboradores/' + encodeURIComponent(id)); }
  listar() { return this.http.get<Colaborador[]>('/api/colaboradores'); }
  crear(datos: DatosColaborador) { return this.http.post<Colaborador>('/api/colaboradores', datos); }
  actualizar(persona: Colaborador, datos: DatosColaborador) {
    return this.http.put<Colaborador>('/api/colaboradores/' + encodeURIComponent(persona.id), { ...datos, version: persona.version });
  }
}
