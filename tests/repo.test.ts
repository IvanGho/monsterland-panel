/**
 * Test de integración sobre SQLite en memoria: recorre el flujo completo de un torneo
 * (crear temporada → jugadores → torneo → inscripción → check-in → llave → resultados → caja).
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import { dbEnMemoria } from "../src/db/index.js";
import { Repo } from "../src/db/repo.js";
import { pesosACentavos } from "../src/domain/money.js";
import { resumirCaja } from "../src/domain/caja.js";

let conexion: Database;
let repo: Repo;
let temporadaId: number;

function crearJugadores(cantidad: number, mayorEdad = true): number[] {
  return Array.from({ length: cantidad }, (_, i) =>
    repo.crearJugador({
      discord_id: `id-${i}-${Math.random()}`,
      discord_tag: `@j${i}`,
      nombre: `Jugador ${i}`,
      mayor_edad: mayorEdad,
    }),
  );
}

function crearTorneo(overrides: Partial<Parameters<Repo["crearTorneo"]>[0]> = {}): number {
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

beforeEach(() => {
  conexion = dbEnMemoria();
  repo = new Repo(conexion);
  temporadaId = repo.crearTemporada({
    nombre: "Temporada de prueba",
    desde_fecha: "2026-08-01",
    hasta_fecha: "2026-09-15",
    premio_final_centavos: pesosACentavos("30000"),
  });
});

describe("inscripciones y caja", () => {
  it("la inscripción pagada entra sola a la caja", () => {
    const torneoId = crearTorneo();
    const [jugadorId] = crearJugadores(1);
    repo.inscribir({
      torneo_id: torneoId,
      nombre: "Jugador 0",
      jugadorIds: [jugadorId!],
      pago_ok: true,
      cubierto_por_pase: false,
      medio_pago: "mercadopago",
      inscripcion_centavos: pesosACentavos("2500"),
    });

    const resumen = resumirCaja(repo.movimientos());
    expect(resumen.ingresosCentavos).toBe(pesosACentavos("2500"));
  });

  it("la inscripción cubierta por pase no duplica ingreso", () => {
    const torneoId = crearTorneo();
    const [jugadorId] = crearJugadores(1);
    repo.crearPase({
      jugador_id: jugadorId!,
      temporada_id: temporadaId,
      nivel: "combatiente",
      precio_centavos: pesosACentavos("7000"),
      desde_fecha: "2000-01-01",
      hasta_fecha: "2100-01-01",
    });
    expect(repo.tienePaseActivo(jugadorId!)).toBe(true);

    repo.inscribir({
      torneo_id: torneoId,
      nombre: "Jugador 0",
      jugadorIds: [jugadorId!],
      pago_ok: true,
      cubierto_por_pase: true,
      inscripcion_centavos: pesosACentavos("2500"),
    });

    const resumen = resumirCaja(repo.movimientos());
    // Sólo el pase, no la inscripción.
    expect(resumen.ingresosCentavos).toBe(pesosACentavos("7000"));
  });

  it("marcar pago después también registra el ingreso, y sólo una vez", () => {
    const torneoId = crearTorneo();
    const [jugadorId] = crearJugadores(1);
    const participanteId = repo.inscribir({
      torneo_id: torneoId,
      nombre: "Jugador 0",
      jugadorIds: [jugadorId!],
      pago_ok: false,
      cubierto_por_pase: false,
      inscripcion_centavos: pesosACentavos("2500"),
    });

    expect(resumirCaja(repo.movimientos()).ingresosCentavos).toBe(0);
    repo.marcarPago(participanteId, true, "transferencia", "ref-1");
    expect(resumirCaja(repo.movimientos()).ingresosCentavos).toBe(pesosACentavos("2500"));
    // Volver a marcar pago no debería duplicar el movimiento.
    repo.marcarPago(participanteId, true, "transferencia", "ref-1");
    expect(resumirCaja(repo.movimientos()).ingresosCentavos).toBe(pesosACentavos("2500"));
  });

  it("premioPagado evita pagar dos veces el mismo premio", () => {
    const torneoId = crearTorneo();
    expect(repo.premioPagado(torneoId)).toBe(false);
    repo.crearMovimiento({
      fecha: "2026-08-21",
      tipo: "egreso",
      categoria: "premio",
      concepto: "Premio",
      monto_centavos: pesosACentavos("6000"),
      torneo_id: torneoId,
    });
    expect(repo.premioPagado(torneoId)).toBe(true);
  });
});

describe("llave y ranking end to end", () => {
  it("juega un torneo de 4 y acredita puntos en el ranking", () => {
    const torneoId = crearTorneo({ siembra: "manual", cupo: 4, minimo_participantes: 4 });
    const jugadores = crearJugadores(4);
    const participantes = jugadores.map((jugadorId, i) => {
      const pid = repo.inscribir({
        torneo_id: torneoId,
        nombre: `Jugador ${i}`,
        jugadorIds: [jugadorId],
        pago_ok: true,
        cubierto_por_pase: false,
        inscripcion_centavos: pesosACentavos("2500"),
      });
      repo.marcarPresente(pid, true);
      return pid;
    });

    expect(repo.generarLlave(torneoId).ok).toBe(true);
    const llave = repo.llaveNormalizada(torneoId);
    expect(llave.filter((p) => p.ronda === 1)).toHaveLength(2);

    const semi1 = llave.find((p) => p.ronda === 1 && p.posicion === 0)!;
    const semi2 = llave.find((p) => p.ronda === 1 && p.posicion === 1)!;

    expect(repo.cargarResultadoPartido(torneoId, 1, 0, semi1.a!, 1, 0).ok).toBe(true);
    expect(repo.cargarResultadoPartido(torneoId, 1, 1, semi2.a!, 1, 0).ok).toBe(true);
    const resultadoFinal = repo.cargarResultadoPartido(torneoId, 2, 0, semi1.a!, 2, 1);
    expect(resultadoFinal.ok).toBe(true);
    expect(resultadoFinal.terminado).toBe(true);
    expect(repo.torneo(torneoId)!.estado).toBe("finalizado");

    const puestos = repo.puestosDeTorneo(torneoId);
    expect(puestos.find((p) => p.participanteId === semi1.a)!.puesto).toBe(1);

    const ranking = repo.rankingDeTemporada(temporadaId);
    expect(ranking).toHaveLength(4);
    // El campeón: 5 participación + 2 check-in + 2 victorias * 3 + 15 bonus = 28
    expect(ranking[0]!.puntos).toBe(28);
    expect(ranking[0]!.primeros).toBe(1);
    expect(participantes).toHaveLength(4);
  });

  it("rechaza un BO3 mal cargado en la final y no toca el estado del torneo", () => {
    const torneoId = crearTorneo({ cupo: 2, minimo_participantes: 2 });
    const jugadores = crearJugadores(2);
    jugadores.forEach((jugadorId, i) => {
      const pid = repo.inscribir({
        torneo_id: torneoId,
        nombre: `Jugador ${i}`,
        jugadorIds: [jugadorId],
        pago_ok: true,
        cubierto_por_pase: false,
        inscripcion_centavos: pesosACentavos("2500"),
      });
      repo.marcarPresente(pid, true);
    });
    repo.generarLlave(torneoId);
    const final = repo.llaveNormalizada(torneoId).find((p) => p.ronda === 1)!;
    const resultado = repo.cargarResultadoPartido(torneoId, 1, 0, final.a!, 1, 0);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain("BO3");
    expect(repo.torneo(torneoId)!.estado).toBe("en_juego");
  });

  it("la llave se arma sólo con los que hicieron check-in", () => {
    const torneoId = crearTorneo({ cupo: 8, minimo_participantes: 2 });
    const jugadores = crearJugadores(6);
    jugadores.forEach((jugadorId, i) => {
      const pid = repo.inscribir({
        torneo_id: torneoId,
        nombre: `Jugador ${i}`,
        jugadorIds: [jugadorId],
        pago_ok: true,
        cubierto_por_pase: false,
        inscripcion_centavos: pesosACentavos("2500"),
      });
      if (i < 4) repo.marcarPresente(pid, true);
    });

    repo.generarLlave(torneoId);
    const llave = repo.llaveNormalizada(torneoId);
    const enLlave = new Set(llave.flatMap((p) => [p.a, p.b]).filter((x) => x !== null));
    expect(enLlave.size).toBe(4);
  });

  it("no arma llave con menos de 2 participantes", () => {
    const torneoId = crearTorneo();
    const [jugadorId] = crearJugadores(1);
    repo.inscribir({
      torneo_id: torneoId,
      nombre: "Solito",
      jugadorIds: [jugadorId!],
      pago_ok: true,
      cubierto_por_pase: false,
      inscripcion_centavos: 0,
    });
    const resultado = repo.generarLlave(torneoId);
    expect(resultado.ok).toBe(false);
  });
});

describe("equipos", () => {
  it("un participante de 2v2 acredita puntos a los dos integrantes", () => {
    const torneoId = crearTorneo({ formato: "2v2", cupo: 4, minimo_participantes: 2, juego: "truco" });
    const jugadores = crearJugadores(4);
    const equipoA = repo.inscribir({
      torneo_id: torneoId,
      nombre: "Los Guardianes",
      jugadorIds: [jugadores[0]!, jugadores[1]!],
      pago_ok: true,
      cubierto_por_pase: false,
      inscripcion_centavos: pesosACentavos("2500"),
    });
    const equipoB = repo.inscribir({
      torneo_id: torneoId,
      nombre: "Los Combatientes",
      jugadorIds: [jugadores[2]!, jugadores[3]!],
      pago_ok: true,
      cubierto_por_pase: false,
      inscripcion_centavos: pesosACentavos("2500"),
    });
    repo.marcarPresente(equipoA, true);
    repo.marcarPresente(equipoB, true);

    repo.generarLlave(torneoId);
    const final = repo.llaveNormalizada(torneoId).find((p) => p.ronda === 1)!;
    repo.cargarResultadoPartido(torneoId, 1, 0, final.a!, 2, 0);

    const ranking = repo.rankingDeTemporada(temporadaId);
    expect(ranking).toHaveLength(4);
    // Los dos del equipo ganador tienen el mismo puntaje.
    expect(ranking[0]!.puntos).toBe(ranking[1]!.puntos);
    expect(repo.jugadoresDeParticipante(equipoA)).toHaveLength(2);
  });
});
