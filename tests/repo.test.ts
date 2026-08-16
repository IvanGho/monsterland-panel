/**
 * Test de integración sobre una base SQLite real (archivo temporal): recorre el flujo completo
 * de un torneo (crear temporada → jugadores → torneo → inscripción → check-in → llave →
 * resultados → caja).
 *
 * Va sobre archivo y no sobre `:memory:` a propósito: en @libsql/client, `batch()` y
 * `transaction()` abren su propia conexión, y con una base en memoria esa conexión ve una
 * base vacía distinta. El archivo temporal se comporta igual que la base de producción.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dbDePrueba } from "../src/db/index.js";
import { Repo } from "../src/db/repo.js";
import { pesosACentavos } from "../src/domain/money.js";
import { resumirCaja } from "../src/domain/caja.js";

let repo: Repo;
let limpiar: () => void;
let temporadaId: number;

async function crearJugadores(cantidad: number, mayorEdad = true): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < cantidad; i++) {
    ids.push(
      await repo.crearJugador({
        discord_id: `id-${i}-${Math.random()}`,
        discord_tag: `@j${i}`,
        nombre: `Jugador ${i}`,
        mayor_edad: mayorEdad,
      }),
    );
  }
  return ids;
}

function crearTorneo(
  overrides: Partial<Parameters<Repo["crearTorneo"]>[0]> = {},
): Promise<number> {
  return repo.crearTorneo({
    temporada_id: temporadaId,
    nombre: "Torneo de prueba",
    juego: "valorant",
    formato: "1v1",
    cupo: 8,
    minimo_participantes: 4,
    empieza_en: "2026-08-20 22:00",
    inscripcion_centavos: pesosACentavos("2500"),
    premio_centavos: pesosACentavos("6000"),
    premio_tipo: "gift_card",
    premio_descripcion: "Steam",
    best_of: 1,
    best_of_final: 3,
    siembra: "manual",
    estado: "inscripcion",
    ...overrides,
  });
}

beforeEach(async () => {
  const base = await dbDePrueba();
  limpiar = base.borrar;
  repo = new Repo(base.cliente);
  temporadaId = await repo.crearTemporada({
    nombre: "Temporada de prueba",
    desde_fecha: "2026-08-01",
    hasta_fecha: "2026-09-15",
    premio_final_centavos: pesosACentavos("30000"),
  });
});

afterEach(() => {
  limpiar();
});

describe("inscripciones y caja", () => {
  it("la inscripción pagada entra sola a la caja", async () => {
    const torneoId = await crearTorneo();
    const [jugadorId] = await crearJugadores(1);
    await repo.inscribir({
      torneo_id: torneoId,
      nombre: "Jugador 0",
      jugadorIds: [jugadorId!],
      pago_ok: true,
      cubierto_por_pase: false,
      medio_pago: "mercadopago",
      inscripcion_centavos: pesosACentavos("2500"),
    });

    const resumen = resumirCaja(await repo.movimientos());
    expect(resumen.ingresosCentavos).toBe(pesosACentavos("2500"));
  });

  it("la inscripción cubierta por pase no duplica ingreso", async () => {
    const torneoId = await crearTorneo();
    const [jugadorId] = await crearJugadores(1);
    await repo.crearPase({
      jugador_id: jugadorId!,
      temporada_id: temporadaId,
      nivel: "combatiente",
      precio_centavos: pesosACentavos("7000"),
      desde_fecha: "2000-01-01",
      hasta_fecha: "2100-01-01",
    });
    expect(await repo.tienePaseActivo(jugadorId!)).toBe(true);

    await repo.inscribir({
      torneo_id: torneoId,
      nombre: "Jugador 0",
      jugadorIds: [jugadorId!],
      pago_ok: true,
      cubierto_por_pase: true,
      inscripcion_centavos: pesosACentavos("2500"),
    });

    const resumen = resumirCaja(await repo.movimientos());
    // Sólo el pase, no la inscripción.
    expect(resumen.ingresosCentavos).toBe(pesosACentavos("7000"));
  });

  it("marcar pago después también registra el ingreso, y sólo una vez", async () => {
    const torneoId = await crearTorneo();
    const [jugadorId] = await crearJugadores(1);
    const participanteId = await repo.inscribir({
      torneo_id: torneoId,
      nombre: "Jugador 0",
      jugadorIds: [jugadorId!],
      pago_ok: false,
      cubierto_por_pase: false,
      inscripcion_centavos: pesosACentavos("2500"),
    });

    expect(resumirCaja(await repo.movimientos()).ingresosCentavos).toBe(0);
    await repo.marcarPago(participanteId, true, "transferencia", "ref-1");
    expect(resumirCaja(await repo.movimientos()).ingresosCentavos).toBe(pesosACentavos("2500"));
    // Volver a marcar pago no debería duplicar el movimiento.
    await repo.marcarPago(participanteId, true, "transferencia", "ref-1");
    expect(resumirCaja(await repo.movimientos()).ingresosCentavos).toBe(pesosACentavos("2500"));
  });

  it("premioPagado evita pagar dos veces el mismo premio", async () => {
    const torneoId = await crearTorneo();
    expect(await repo.premioPagado(torneoId)).toBe(false);
    await repo.crearMovimiento({
      fecha: "2026-08-21",
      tipo: "egreso",
      categoria: "premio",
      concepto: "Premio",
      monto_centavos: pesosACentavos("6000"),
      torneo_id: torneoId,
    });
    expect(await repo.premioPagado(torneoId)).toBe(true);
  });
});

describe("llave y ranking end to end", () => {
  it("juega un torneo de 4 y acredita puntos en el ranking", async () => {
    const torneoId = await crearTorneo({ siembra: "manual", cupo: 4, minimo_participantes: 4 });
    const jugadores = await crearJugadores(4);
    const participantes: number[] = [];
    for (const [i, jugadorId] of jugadores.entries()) {
      const pid = await repo.inscribir({
        torneo_id: torneoId,
        nombre: `Jugador ${i}`,
        jugadorIds: [jugadorId],
        pago_ok: true,
        cubierto_por_pase: false,
        inscripcion_centavos: pesosACentavos("2500"),
      });
      await repo.marcarPresente(pid, true);
      participantes.push(pid);
    }

    expect((await repo.generarLlave(torneoId)).ok).toBe(true);
    const llave = await repo.llaveNormalizada(torneoId);
    expect(llave.filter((p) => p.ronda === 1)).toHaveLength(2);

    const semi1 = llave.find((p) => p.ronda === 1 && p.posicion === 0)!;
    const semi2 = llave.find((p) => p.ronda === 1 && p.posicion === 1)!;

    expect((await repo.cargarResultadoPartido(torneoId, 1, 0, semi1.a!, 1, 0)).ok).toBe(true);
    expect((await repo.cargarResultadoPartido(torneoId, 1, 1, semi2.a!, 1, 0)).ok).toBe(true);
    const resultadoFinal = await repo.cargarResultadoPartido(torneoId, 2, 0, semi1.a!, 2, 1);
    expect(resultadoFinal.ok).toBe(true);
    expect(resultadoFinal.terminado).toBe(true);
    expect((await repo.torneo(torneoId))!.estado).toBe("finalizado");

    const puestos = await repo.puestosDeTorneo(torneoId);
    expect(puestos.find((p) => p.participanteId === semi1.a)!.puesto).toBe(1);

    const ranking = await repo.rankingDeTemporada(temporadaId);
    expect(ranking).toHaveLength(4);
    // El campeón: 5 participación + 2 check-in + 2 victorias * 3 + 15 bonus = 28
    expect(ranking[0]!.puntos).toBe(28);
    expect(ranking[0]!.primeros).toBe(1);
    expect(participantes).toHaveLength(4);
  });

  it("rechaza un BO3 mal cargado en la final y no toca el estado del torneo", async () => {
    const torneoId = await crearTorneo({ cupo: 2, minimo_participantes: 2 });
    const jugadores = await crearJugadores(2);
    for (const [i, jugadorId] of jugadores.entries()) {
      const pid = await repo.inscribir({
        torneo_id: torneoId,
        nombre: `Jugador ${i}`,
        jugadorIds: [jugadorId],
        pago_ok: true,
        cubierto_por_pase: false,
        inscripcion_centavos: pesosACentavos("2500"),
      });
      await repo.marcarPresente(pid, true);
    }
    await repo.generarLlave(torneoId);
    const final = (await repo.llaveNormalizada(torneoId)).find((p) => p.ronda === 1)!;
    const resultado = await repo.cargarResultadoPartido(torneoId, 1, 0, final.a!, 1, 0);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain("BO3");
    expect((await repo.torneo(torneoId))!.estado).toBe("en_juego");
  });

  it("la llave se arma sólo con los que hicieron check-in", async () => {
    const torneoId = await crearTorneo({ cupo: 8, minimo_participantes: 2 });
    const jugadores = await crearJugadores(6);
    for (const [i, jugadorId] of jugadores.entries()) {
      const pid = await repo.inscribir({
        torneo_id: torneoId,
        nombre: `Jugador ${i}`,
        jugadorIds: [jugadorId],
        pago_ok: true,
        cubierto_por_pase: false,
        inscripcion_centavos: pesosACentavos("2500"),
      });
      if (i < 4) await repo.marcarPresente(pid, true);
    }

    await repo.generarLlave(torneoId);
    const llave = await repo.llaveNormalizada(torneoId);
    const enLlave = new Set(llave.flatMap((p) => [p.a, p.b]).filter((x) => x !== null));
    expect(enLlave.size).toBe(4);
  });

  it("no arma llave con menos de 2 participantes", async () => {
    const torneoId = await crearTorneo();
    const [jugadorId] = await crearJugadores(1);
    await repo.inscribir({
      torneo_id: torneoId,
      nombre: "Solito",
      jugadorIds: [jugadorId!],
      pago_ok: true,
      cubierto_por_pase: false,
      inscripcion_centavos: 0,
    });
    const resultado = await repo.generarLlave(torneoId);
    expect(resultado.ok).toBe(false);
  });
});

describe("equipos", () => {
  it("un participante de 2v2 acredita puntos a los dos integrantes", async () => {
    const torneoId = await crearTorneo({
      formato: "2v2",
      cupo: 4,
      minimo_participantes: 2,
      juego: "truco",
    });
    const jugadores = await crearJugadores(4);
    const equipoA = await repo.inscribir({
      torneo_id: torneoId,
      nombre: "Los Guardianes",
      jugadorIds: [jugadores[0]!, jugadores[1]!],
      pago_ok: true,
      cubierto_por_pase: false,
      inscripcion_centavos: pesosACentavos("2500"),
    });
    const equipoB = await repo.inscribir({
      torneo_id: torneoId,
      nombre: "Los Combatientes",
      jugadorIds: [jugadores[2]!, jugadores[3]!],
      pago_ok: true,
      cubierto_por_pase: false,
      inscripcion_centavos: pesosACentavos("2500"),
    });
    await repo.marcarPresente(equipoA, true);
    await repo.marcarPresente(equipoB, true);

    await repo.generarLlave(torneoId);
    const final = (await repo.llaveNormalizada(torneoId)).find((p) => p.ronda === 1)!;
    await repo.cargarResultadoPartido(torneoId, 1, 0, final.a!, 2, 0);

    const ranking = await repo.rankingDeTemporada(temporadaId);
    expect(ranking).toHaveLength(4);
    // Los dos del equipo ganador tienen el mismo puntaje.
    expect(ranking[0]!.puntos).toBe(ranking[1]!.puntos);
    expect(await repo.jugadoresDeParticipante(equipoA)).toHaveLength(2);
  });
});
