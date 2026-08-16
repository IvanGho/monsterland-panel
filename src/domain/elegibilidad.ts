/**
 * Reglas de quién puede entrar a un torneo.
 *
 * Este módulo es el que evita el problema que más caro sale: que alguien sin mayoría de edad
 * confirmada participe de una instancia con dinero de por medio. La regla es dura y no se
 * puede saltear desde la interfaz: si el torneo tiene inscripción paga o premio en dinero
 * o gift card, hace falta `mayorEdad`.
 */

export interface JugadorParaValidar {
  id: number;
  nombre: string;
  mayorEdad: boolean;
  baneado: boolean;
}

export interface TorneoParaValidar {
  inscripcionCentavos: number;
  premioCentavos: number;
  premioTipo: "gift_card" | "especie" | "efectivo";
  cupo: number;
  estado: string;
}

export interface ContextoInscripcion {
  participantesActuales: number;
  tienePaseActivo: boolean;
  pagoConfirmado: boolean;
}

export interface Veredicto {
  puede: boolean;
  motivos: string[];
  requierePago: boolean;
}

export function tieneValorReal(t: TorneoParaValidar): boolean {
  return t.inscripcionCentavos > 0 || t.premioCentavos > 0;
}

export function validarInscripcion(
  jugador: JugadorParaValidar,
  torneo: TorneoParaValidar,
  contexto: ContextoInscripcion,
): Veredicto {
  const motivos: string[] = [];

  if (jugador.baneado) motivos.push("El jugador está baneado del servidor.");

  if (torneo.estado !== "inscripcion") {
    motivos.push("El torneo no está con la inscripción abierta.");
  }

  if (contexto.participantesActuales >= torneo.cupo) {
    motivos.push("El cupo está completo.");
  }

  if (tieneValorReal(torneo) && !jugador.mayorEdad) {
    motivos.push(
      "Este torneo tiene inscripción o premio con valor real: hace falta mayoría de edad confirmada (18+). " +
        "Mandalo a la Pista Libre, que es gratuita y con premios no monetarios.",
    );
  }

  const requierePago =
    torneo.inscripcionCentavos > 0 && !contexto.tienePaseActivo && !contexto.pagoConfirmado;

  return { puede: motivos.length === 0, motivos, requierePago };
}

/** Un torneo sin plata de por medio: acá puede jugar cualquiera del servidor. */
export function esPistaLibre(t: TorneoParaValidar): boolean {
  return t.inscripcionCentavos === 0 && t.premioCentavos === 0;
}

export function paseVigente(
  pase: { desdeFecha: string; hastaFecha: string } | undefined,
  hoy: string,
): boolean {
  if (!pase) return false;
  return pase.desdeFecha <= hoy && hoy <= pase.hastaFecha;
}
