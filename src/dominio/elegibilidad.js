/**
 * Reglas de quién puede entrar a un torneo.
 *
 * Este módulo evita el problema que más caro sale: que alguien sin mayoría de edad
 * confirmada participe de una instancia con dinero de por medio. La regla es dura y no se
 * puede saltear desde la interfaz: si el torneo tiene inscripción paga o premio con valor
 * real, hace falta `mayorEdad`.
 */

export function tieneValorReal(torneo) {
  return torneo.inscripcionCentavos > 0 || torneo.premioCentavos > 0;
}

/** Un torneo sin plata de por medio: acá puede jugar cualquiera del servidor. */
export function esPistaLibre(torneo) {
  return torneo.inscripcionCentavos === 0 && torneo.premioCentavos === 0;
}

/**
 * @param {{nombre: string, mayorEdad: boolean, baneado: boolean}} jugador
 * @param {{inscripcionCentavos: number, premioCentavos: number, cupo: number, estado: string}} torneo
 * @param {{participantesActuales: number, tienePaseActivo: boolean, pagoConfirmado: boolean}} contexto
 */
export function validarInscripcion(jugador, torneo, contexto) {
  const motivos = [];

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

export function paseVigente(pase, hoy) {
  if (!pase) return false;
  return pase.desdeFecha <= hoy && hoy <= pase.hastaFecha;
}
