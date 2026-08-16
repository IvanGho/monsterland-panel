/**
 * Motor de llaves de eliminación simple.
 *
 * Reglas de diseño:
 * - Funciones puras: reciben datos y devuelven datos. Nada de base ni de HTTP acá.
 *   Así se puede testear el caso "8 inscriptos, 2 no se presentan" sin levantar el server.
 * - El cuadro siempre se arma a la próxima potencia de 2. Los lugares que faltan son BYE
 *   y se los quedan los mejores sembrados, que avanzan solos a la ronda 2.
 * - La progresión no se guarda con punteros: el partido `posicion` de la ronda `r`
 *   alimenta al partido `floor(posicion / 2)` de la ronda `r + 1`.
 *   Si `posicion` es par entra por la ranura A, si es impar por la B.
 */

export type ParticipanteId = number;

export interface Partido {
  ronda: number;
  posicion: number;
  a: ParticipanteId | null;
  b: ParticipanteId | null;
  ganadorId: ParticipanteId | null;
  scoreA: number;
  scoreB: number;
  bestOf: number;
  estado: "pendiente" | "listo" | "jugado" | "walkover";
}

export interface OpcionesLlave {
  bestOf: number;
  bestOfFinal: number;
}

export function proximaPotenciaDeDos(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function cantidadDeRondas(tamanoCuadro: number): number {
  return Math.max(0, Math.log2(tamanoCuadro));
}

/**
 * Orden de siembra: para un cuadro de 8 devuelve [1, 8, 4, 5, 2, 7, 3, 6],
 * o sea los cruces 1-8, 4-5, 2-7, 3-6.
 *
 * Cumple las dos propiedades que importan en un torneo:
 * - el mejor sembrado enfrenta al peor en la primera ronda;
 * - el 1 y el 2 caen en mitades opuestas del cuadro, así sólo se cruzan en la final.
 *
 * (Hay otra convención muy usada, [1, 8, 5, 4, 3, 6, 7, 2], que produce exactamente
 * los mismos cruces en otro orden de filas. Elegí esta porque se genera derecho
 * duplicando la ronda anterior, sin tablas hardcodeadas por tamaño de cuadro.)
 */
export function ordenDeSiembra(tamanoCuadro: number): number[] {
  if (tamanoCuadro < 2) return [1];
  let ronda = [1, 2];
  while (ronda.length < tamanoCuadro) {
    const siguiente: number[] = [];
    const tope = ronda.length * 2 + 1;
    for (const semilla of ronda) {
      siguiente.push(semilla, tope - semilla);
    }
    ronda = siguiente;
  }
  return ronda;
}

/**
 * Arma la llave completa.
 * @param participantes ids en orden de siembra (el primero es el mejor sembrado)
 */
export function armarLlave(participantes: ParticipanteId[], opciones: OpcionesLlave): Partido[] {
  const cantidad = participantes.length;
  if (cantidad < 2) throw new Error("Se necesitan al menos 2 participantes para armar una llave");

  const tamanoCuadro = proximaPotenciaDeDos(cantidad);
  const rondas = cantidadDeRondas(tamanoCuadro);
  const orden = ordenDeSiembra(tamanoCuadro);

  // Cada posición del cuadro recibe un participante o null (BYE).
  const ranuras: (ParticipanteId | null)[] = orden.map((semilla) => {
    const indice = semilla - 1;
    return indice < cantidad ? (participantes[indice] ?? null) : null;
  });

  const partidos: Partido[] = [];

  // Primera ronda
  const partidosPrimeraRonda = tamanoCuadro / 2;
  for (let posicion = 0; posicion < partidosPrimeraRonda; posicion++) {
    const a = ranuras[posicion * 2] ?? null;
    const b = ranuras[posicion * 2 + 1] ?? null;
    partidos.push({
      ronda: 1,
      posicion,
      a,
      b,
      ganadorId: null,
      scoreA: 0,
      scoreB: 0,
      bestOf: bestOfDeRonda(1, rondas, opciones),
      estado: "pendiente",
    });
  }

  // Rondas siguientes, vacías
  for (let ronda = 2; ronda <= rondas; ronda++) {
    const cantidadPartidos = tamanoCuadro / 2 ** ronda;
    for (let posicion = 0; posicion < cantidadPartidos; posicion++) {
      partidos.push({
        ronda,
        posicion,
        a: null,
        b: null,
        ganadorId: null,
        scoreA: 0,
        scoreB: 0,
        bestOf: bestOfDeRonda(ronda, rondas, opciones),
        estado: "pendiente",
      });
    }
  }

  return normalizar(partidos, rondas);
}

function bestOfDeRonda(ronda: number, rondas: number, opciones: OpcionesLlave): number {
  return ronda === rondas ? opciones.bestOfFinal : opciones.bestOf;
}

/**
 * Resuelve BYEs en cascada y marca como "listo" todo partido con los dos lados definidos.
 * Es idempotente: se puede llamar después de cada resultado sin romper nada.
 */
export function normalizar(partidos: Partido[], rondas?: number): Partido[] {
  const total = rondas ?? Math.max(...partidos.map((p) => p.ronda));
  const copia = partidos.map((p) => ({ ...p }));
  const buscar = (ronda: number, posicion: number) =>
    copia.find((p) => p.ronda === ronda && p.posicion === posicion);

  for (let ronda = 1; ronda <= total; ronda++) {
    for (const partido of copia.filter((p) => p.ronda === ronda)) {
      const tieneA = partido.a !== null;
      const tieneB = partido.b !== null;

      // BYE: un solo lado ocupado y nadie más va a aparecer -> avanza sin jugar.
      if (ronda === 1 && tieneA !== tieneB && partido.estado === "pendiente") {
        partido.ganadorId = partido.a ?? partido.b;
        partido.estado = "walkover";
      }

      if (partido.estado === "pendiente" && tieneA && tieneB) {
        partido.estado = "listo";
      }

      if (partido.ganadorId !== null && ronda < total) {
        const siguiente = buscar(ronda + 1, Math.floor(partido.posicion / 2));
        if (siguiente) {
          if (partido.posicion % 2 === 0) siguiente.a = partido.ganadorId;
          else siguiente.b = partido.ganadorId;
        }
      }
    }
  }

  // Segunda pasada: una ronda posterior puede haber quedado con un solo lado
  // porque el rival venía de un cuadro todo-BYE. Ese lado también avanza.
  for (let ronda = 2; ronda <= total; ronda++) {
    for (const partido of copia.filter((p) => p.ronda === ronda)) {
      const alimentaA = buscar(ronda - 1, partido.posicion * 2);
      const alimentaB = buscar(ronda - 1, partido.posicion * 2 + 1);
      const aResuelto = !alimentaA || alimentaA.ganadorId !== null;
      const bResuelto = !alimentaB || alimentaB.ganadorId !== null;
      const unoSolo = (partido.a === null) !== (partido.b === null);
      if (unoSolo && aResuelto && bResuelto && partido.estado === "pendiente") {
        partido.ganadorId = partido.a ?? partido.b;
        partido.estado = "walkover";
        if (ronda < total) {
          const siguiente = buscar(ronda + 1, Math.floor(partido.posicion / 2));
          if (siguiente) {
            if (partido.posicion % 2 === 0) siguiente.a = partido.ganadorId;
            else siguiente.b = partido.ganadorId;
          }
        }
      }
      if (partido.estado === "pendiente" && partido.a !== null && partido.b !== null) {
        partido.estado = "listo";
      }
    }
  }

  return copia;
}

export interface ResultadoCargado {
  ronda: number;
  posicion: number;
  ganadorId: ParticipanteId;
  scoreA: number;
  scoreB: number;
  walkover?: boolean;
}

/** Carga un resultado y propaga al ganador. Devuelve la llave nueva. */
export function cargarResultado(partidos: Partido[], resultado: ResultadoCargado): Partido[] {
  const total = Math.max(...partidos.map((p) => p.ronda));
  const copia = partidos.map((p) => ({ ...p }));
  const partido = copia.find(
    (p) => p.ronda === resultado.ronda && p.posicion === resultado.posicion,
  );
  if (!partido) throw new Error("Ese partido no existe en la llave");
  if (partido.a === null || partido.b === null) {
    throw new Error("No se puede cargar un resultado si falta uno de los dos lados");
  }
  if (resultado.ganadorId !== partido.a && resultado.ganadorId !== partido.b) {
    throw new Error("El ganador tiene que ser uno de los dos participantes del partido");
  }
  const victoriasNecesarias = Math.floor(partido.bestOf / 2) + 1;
  const scoreGanador = resultado.ganadorId === partido.a ? resultado.scoreA : resultado.scoreB;
  if (!resultado.walkover && scoreGanador < victoriasNecesarias) {
    throw new Error(
      `En BO${partido.bestOf} el ganador necesita ${victoriasNecesarias} mapa(s)/mano(s) ganada(s)`,
    );
  }

  partido.ganadorId = resultado.ganadorId;
  partido.scoreA = resultado.scoreA;
  partido.scoreB = resultado.scoreB;
  partido.estado = resultado.walkover ? "walkover" : "jugado";

  // Si se corrige un resultado ya cargado, hay que limpiar lo que venía después.
  limpiarDescendencia(copia, partido, total);
  return normalizar(copia, total);
}

function limpiarDescendencia(partidos: Partido[], desde: Partido, total: number): void {
  let ronda = desde.ronda + 1;
  let posicion = Math.floor(desde.posicion / 2);
  let slot: "a" | "b" = desde.posicion % 2 === 0 ? "a" : "b";
  while (ronda <= total) {
    const siguiente = partidos.find((p) => p.ronda === ronda && p.posicion === posicion);
    if (!siguiente) return;
    siguiente[slot] = null;
    siguiente.ganadorId = null;
    siguiente.scoreA = 0;
    siguiente.scoreB = 0;
    siguiente.estado = "pendiente";
    slot = posicion % 2 === 0 ? "a" : "b";
    posicion = Math.floor(posicion / 2);
    ronda += 1;
  }
}

export interface Puesto {
  participanteId: ParticipanteId;
  puesto: number;
  victorias: number;
  partidosJugados: number;
}

/**
 * Puestos finales. Sin partido por el tercer puesto: los dos perdedores de semis
 * comparten el 3° (y comparten el bonus). Es lo estándar en torneos amateur y evita
 * un partido extra que nadie quiere jugar a las 3 de la mañana.
 */
export function puestos(partidos: Partido[], participantes: ParticipanteId[]): Puesto[] {
  const total = Math.max(...partidos.map((p) => p.ronda));
  const stats = new Map<ParticipanteId, { victorias: number; jugados: number; ultimaRonda: number }>();
  for (const id of participantes) stats.set(id, { victorias: 0, jugados: 0, ultimaRonda: 0 });

  for (const partido of partidos) {
    for (const lado of [partido.a, partido.b]) {
      if (lado === null) continue;
      const s = stats.get(lado);
      if (!s) continue;
      s.ultimaRonda = Math.max(s.ultimaRonda, partido.ronda);
      if (partido.estado === "jugado") s.jugados += 1;
    }
    if (partido.ganadorId !== null && partido.a !== null && partido.b !== null) {
      const s = stats.get(partido.ganadorId);
      if (s) s.victorias += 1;
    }
  }

  const final = partidos.find((p) => p.ronda === total && p.posicion === 0);
  const campeon = final?.ganadorId ?? null;
  const subcampeon =
    final && campeon !== null ? (final.a === campeon ? final.b : final.a) : null;

  const semifinalistasPerdedores: ParticipanteId[] = [];
  if (total >= 2) {
    for (const semi of partidos.filter((p) => p.ronda === total - 1)) {
      if (semi.ganadorId === null) continue;
      const perdedor = semi.a === semi.ganadorId ? semi.b : semi.a;
      if (perdedor !== null) semifinalistasPerdedores.push(perdedor);
    }
  }

  const resultado: Puesto[] = [];
  const agregar = (id: ParticipanteId, puesto: number) => {
    const s = stats.get(id) ?? { victorias: 0, jugados: 0, ultimaRonda: 0 };
    resultado.push({ participanteId: id, puesto, victorias: s.victorias, partidosJugados: s.jugados });
  };

  if (campeon !== null) agregar(campeon, 1);
  if (subcampeon !== null) agregar(subcampeon, 2);
  for (const id of semifinalistasPerdedores) agregar(id, 3);

  const yaEstan = new Set(resultado.map((r) => r.participanteId));
  const restantes = participantes
    .filter((id) => !yaEstan.has(id))
    .sort((a, b) => {
      const sa = stats.get(a)!;
      const sb = stats.get(b)!;
      if (sb.ultimaRonda !== sa.ultimaRonda) return sb.ultimaRonda - sa.ultimaRonda;
      return sb.victorias - sa.victorias;
    });

  let puestoActual = resultado.length > 0 ? Math.max(...resultado.map((r) => r.puesto)) + 1 : 1;
  for (const id of restantes) {
    agregar(id, puestoActual);
    puestoActual += 1;
  }

  return resultado.sort((a, b) => a.puesto - b.puesto);
}

export function llaveTerminada(partidos: Partido[]): boolean {
  const total = Math.max(...partidos.map((p) => p.ronda));
  const final = partidos.find((p) => p.ronda === total && p.posicion === 0);
  return Boolean(final && final.ganadorId !== null);
}

export function nombreDeRonda(ronda: number, rondas: number): string {
  const desdeElFinal = rondas - ronda;
  if (desdeElFinal === 0) return "Final";
  if (desdeElFinal === 1) return "Semifinal";
  if (desdeElFinal === 2) return "Cuartos";
  if (desdeElFinal === 3) return "Octavos";
  return `Ronda ${ronda}`;
}

/** Mezcla con Fisher-Yates. `random` se inyecta para poder testear el sorteo. */
export function mezclar<T>(items: T[], random: () => number = Math.random): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = copia[i]!;
    const b = copia[j]!;
    copia[i] = b;
    copia[j] = a;
  }
  return copia;
}
