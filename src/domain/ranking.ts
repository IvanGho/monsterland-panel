/**
 * Puntaje de temporada.
 *
 * Criterio: premiar la asistencia tanto como el resultado. En una comunidad de 10-15 activos,
 * si sólo puntúa ganar, los que pierden dos veces no vuelven. El puntaje de participación
 * es el que sostiene el ranking; el bonus por puesto es el que lo hace competitivo.
 */

export interface ReglasPuntos {
  participacion: number;
  porVictoria: number;
  bonusPuesto: Record<string, number>; // { "1": 15, "2": 9, "3": 5 }
  bonusPresentarse: number; // premia el check-in a tiempo
}

export const REGLAS_POR_DEFECTO: ReglasPuntos = {
  participacion: 5,
  porVictoria: 3,
  bonusPuesto: { "1": 15, "2": 9, "3": 5 },
  bonusPresentarse: 2,
};

export interface ResultadoTorneo {
  torneoId: number;
  jugadorId: number;
  puesto: number;
  victorias: number;
  partidosJugados: number;
  sePresento: boolean;
}

export interface FilaRanking {
  jugadorId: number;
  puntos: number;
  torneos: number;
  victorias: number;
  primeros: number;
  segundos: number;
  terceros: number;
}

export function puntosDeResultado(resultado: ResultadoTorneo, reglas: ReglasPuntos): number {
  if (!resultado.sePresento) return 0;
  let puntos = reglas.participacion + reglas.bonusPresentarse;
  puntos += resultado.victorias * reglas.porVictoria;
  puntos += reglas.bonusPuesto[String(resultado.puesto)] ?? 0;
  return puntos;
}

export function calcularRanking(
  resultados: ResultadoTorneo[],
  reglas: ReglasPuntos = REGLAS_POR_DEFECTO,
): FilaRanking[] {
  const porJugador = new Map<number, FilaRanking>();

  for (const resultado of resultados) {
    const fila =
      porJugador.get(resultado.jugadorId) ??
      {
        jugadorId: resultado.jugadorId,
        puntos: 0,
        torneos: 0,
        victorias: 0,
        primeros: 0,
        segundos: 0,
        terceros: 0,
      };

    fila.puntos += puntosDeResultado(resultado, reglas);
    if (resultado.sePresento) {
      fila.torneos += 1;
      fila.victorias += resultado.victorias;
      if (resultado.puesto === 1) fila.primeros += 1;
      if (resultado.puesto === 2) fila.segundos += 1;
      if (resultado.puesto === 3) fila.terceros += 1;
    }
    porJugador.set(resultado.jugadorId, fila);
  }

  return [...porJugador.values()].sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if (b.primeros !== a.primeros) return b.primeros - a.primeros;
    if (b.victorias !== a.victorias) return b.victorias - a.victorias;
    return a.jugadorId - b.jugadorId;
  });
}

/** Los N que entran a los playoffs de temporada. */
export function clasificados(ranking: FilaRanking[], cupos: number): FilaRanking[] {
  return ranking.slice(0, Math.max(0, cupos));
}
