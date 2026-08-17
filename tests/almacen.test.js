/**
 * El mismo flujo completo corrido contra los DOS backends.
 *
 * Esto es lo que garantiza que el modo demo y la producción se comporten igual: si el
 * almacén de Postgres y el de memoria divergen, estos tests fallan en uno de los dos.
 *
 * Para Postgres usamos PGlite, que es Postgres compilado a WASM: mismo motor, mismo SQL,
 * mismo comportamiento de jsonb y transacciones, sin levantar ningún servidor.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { almacenEnMemoria } from "../src/almacen/memoria.js";
import { almacenPostgres } from "../src/almacen/postgres.js";
import { crearRepo } from "../src/datos/repo.js";
import { sembrar } from "../src/datos/semilla.js";
import { pesosACentavos } from "../src/dominio/dinero.js";
import { resumirCaja } from "../src/dominio/caja.js";

/** Un almacén Postgres de verdad, apoyado en PGlite. */
async function almacenPGlite() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const consultar = (sql, params) => db.query(sql, params);
  return {
    almacen: almacenPostgres({
      consultar,
      // PGlite es de una sola conexión, así que la "transacción dedicada" es la misma.
      transaccion: async (fn) => {
        await db.exec("BEGIN");
        try {
          const r = await fn(consultar);
          await db.exec("COMMIT");
          return r;
        } catch (error) {
          await db.exec("ROLLBACK");
          throw error;
        }
      },
      descripcion: "PGlite",
    }),
    cerrar: () => db.close(),
  };
}

const BACKENDS = [
  { nombre: "memoria", crear: async () => ({ almacen: almacenEnMemoria(), cerrar: () => {} }) },
  { nombre: "postgres (PGlite)", crear: almacenPGlite },
];

for (const backend of BACKENDS) {
  describe(`almacén: ${backend.nombre}`, () => {
    let base;
    let cerrar;
    let repo;

    beforeEach(async () => {
      const creado = await backend.crear();
      base = creado.almacen;
      cerrar = creado.cerrar;
      repo = crearRepo(base);
    });

    after(async () => {
      await cerrar?.();
    });

    it("guarda y recupera documentos con id numérico", async () => {
      const creado = await base.crear("cosas", { nombre: "una", n: 1 });
      assert.equal(typeof creado.id, "number");
      const leido = await base.obtener("cosas", creado.id);
      assert.equal(leido.nombre, "una");
      assert.equal(leido.n, 1);
    });

    it("actualiza sólo los campos que se le pasan", async () => {
      const creado = await base.crear("cosas", { a: 1, b: 2 });
      await base.actualizar("cosas", creado.id, { b: 99 });
      const leido = await base.obtener("cosas", creado.id);
      assert.equal(leido.a, 1, "el campo que no se tocó tiene que seguir ahí");
      assert.equal(leido.b, 99);
    });

    it("filtra por campo y borra", async () => {
      await base.crear("cosas", { grupo: 1 });
      await base.crear("cosas", { grupo: 1 });
      await base.crear("cosas", { grupo: 2 });
      assert.equal((await base.listarDonde("cosas", "grupo", 1)).length, 2);
      assert.equal(await base.borrarDonde("cosas", "grupo", 1), 2);
      assert.equal((await base.listarDonde("cosas", "grupo", 1)).length, 0);
      assert.equal((await base.listar("cosas")).length, 1);
    });

    it("no devuelve referencias vivas a lo guardado", async () => {
      const creado = await base.crear("cosas", { lista: [1, 2] });
      const leido = await base.obtener("cosas", creado.id);
      leido.lista.push(3);
      const otraVez = await base.obtener("cosas", creado.id);
      assert.deepEqual(otraVez.lista, [1, 2], "mutar lo leído no puede cambiar lo guardado");
    });

    it("devuelve undefined si el documento no existe", async () => {
      assert.equal(await base.obtener("cosas", 9999), undefined);
      assert.equal(await base.borrar("cosas", 9999), false);
    });

    // ---------- flujo real del panel ----------

    it("la inscripción pagada entra sola a la caja", async () => {
      const temporada = await repo.crearTemporada({
        nombre: "T",
        desdeFecha: "2026-08-01",
        hastaFecha: "2026-09-15",
      });
      const torneo = await repo.crearTorneo({
        temporadaId: temporada.id,
        nombre: "Torneo",
        juego: "valorant",
        formato: "1v1",
        cupo: 8,
        minimoParticipantes: 2,
        empiezaEn: "2026-08-20T22:00",
        inscripcionCentavos: pesosACentavos("2500"),
        premioCentavos: pesosACentavos("6000"),
        estado: "inscripcion",
      });
      const jugador = await repo.crearJugador({ nombre: "Uno", discordId: "1", mayorEdad: true });

      await repo.inscribir({
        torneoId: torneo.id,
        nombre: "Uno",
        jugadorIds: [jugador.id],
        pagoOk: true,
        cubiertoPorPase: false,
        inscripcionCentavos: pesosACentavos("2500"),
      });

      assert.equal(resumirCaja(await repo.movimientos()).ingresosCentavos, pesosACentavos("2500"));
    });

    it("el pase entra a la caja y cubre la inscripción sin cobrar dos veces", async () => {
      const temporada = await repo.crearTemporada({
        nombre: "T",
        desdeFecha: "2026-08-01",
        hastaFecha: "2026-09-15",
      });
      const jugador = await repo.crearJugador({ nombre: "Uno", discordId: "1", mayorEdad: true });
      await repo.crearPase({
        jugadorId: jugador.id,
        temporadaId: temporada.id,
        nivel: "combatiente",
        precioCentavos: pesosACentavos("7000"),
        desdeFecha: "2000-01-01",
        hastaFecha: "2100-01-01",
      });

      assert.equal((await repo.jugadoresConPaseActivo()).has(jugador.id), true);

      const torneo = await repo.crearTorneo({
        temporadaId: temporada.id,
        nombre: "Torneo",
        juego: "valorant",
        formato: "1v1",
        cupo: 8,
        minimoParticipantes: 2,
        empiezaEn: "2026-08-20T22:00",
        inscripcionCentavos: pesosACentavos("2500"),
        estado: "inscripcion",
      });
      await repo.inscribir({
        torneoId: torneo.id,
        nombre: "Uno",
        jugadorIds: [jugador.id],
        pagoOk: true,
        cubiertoPorPase: true,
        inscripcionCentavos: pesosACentavos("2500"),
      });

      // Sólo el pase: la inscripción ya estaba cubierta.
      assert.equal(resumirCaja(await repo.movimientos()).ingresosCentavos, pesosACentavos("7000"));
    });

    it("marcar pago dos veces no duplica el ingreso", async () => {
      const temporada = await repo.crearTemporada({
        nombre: "T",
        desdeFecha: "2026-08-01",
        hastaFecha: "2026-09-15",
      });
      const torneo = await repo.crearTorneo({
        temporadaId: temporada.id,
        nombre: "Torneo",
        juego: "valorant",
        formato: "1v1",
        cupo: 8,
        minimoParticipantes: 2,
        empiezaEn: "2026-08-20T22:00",
        inscripcionCentavos: pesosACentavos("2500"),
        estado: "inscripcion",
      });
      const jugador = await repo.crearJugador({ nombre: "Uno", discordId: "1", mayorEdad: true });
      const participante = await repo.inscribir({
        torneoId: torneo.id,
        nombre: "Uno",
        jugadorIds: [jugador.id],
        pagoOk: false,
        cubiertoPorPase: false,
        inscripcionCentavos: pesosACentavos("2500"),
      });

      assert.equal(resumirCaja(await repo.movimientos()).ingresosCentavos, 0);
      await repo.marcarPago(participante.id, true, "transferencia", "ref-1");
      assert.equal(resumirCaja(await repo.movimientos()).ingresosCentavos, pesosACentavos("2500"));
      await repo.marcarPago(participante.id, true, "transferencia", "ref-1");
      assert.equal(
        resumirCaja(await repo.movimientos()).ingresosCentavos,
        pesosACentavos("2500"),
        "volver a apretar el botón no puede sumar plata de nuevo",
      );
    });

    it("no deja cargar dos veces el mismo ID de Discord", async () => {
      await repo.crearJugador({ nombre: "Uno", discordId: "111", mayorEdad: true });
      await assert.rejects(
        () => repo.crearJugador({ nombre: "Otro", discordId: "111", mayorEdad: true }),
        /DISCORD_ID_DUPLICADO/,
      );
    });

    it("juega un torneo de 4 de punta a punta y acredita el ranking", async () => {
      const temporada = await repo.crearTemporada({
        nombre: "T",
        desdeFecha: "2026-08-01",
        hastaFecha: "2026-09-15",
      });
      const torneo = await repo.crearTorneo({
        temporadaId: temporada.id,
        nombre: "Torneo",
        juego: "valorant",
        formato: "1v1",
        cupo: 4,
        minimoParticipantes: 4,
        empiezaEn: "2026-08-20T22:00",
        bestOf: 1,
        bestOfFinal: 3,
        siembra: "manual",
        estado: "inscripcion",
      });

      for (let i = 0; i < 4; i++) {
        const jugador = await repo.crearJugador({
          nombre: `Jugador ${i}`,
          discordId: `d${i}`,
          mayorEdad: true,
        });
        const participante = await repo.inscribir({
          torneoId: torneo.id,
          nombre: `Jugador ${i}`,
          jugadorIds: [jugador.id],
          pagoOk: true,
          cubiertoPorPase: false,
          inscripcionCentavos: 0,
        });
        await repo.marcarPresente(participante.id, true);
      }

      assert.equal((await repo.generarLlave(torneo.id)).ok, true);
      const llave = await repo.llaveNormalizada(torneo.id);
      assert.equal(llave.filter((p) => p.ronda === 1).length, 2);

      const s1 = llave.find((p) => p.ronda === 1 && p.posicion === 0);
      const s2 = llave.find((p) => p.ronda === 1 && p.posicion === 1);
      assert.equal((await repo.cargarResultadoPartido(torneo.id, 1, 0, s1.a, 1, 0)).ok, true);
      assert.equal((await repo.cargarResultadoPartido(torneo.id, 1, 1, s2.a, 1, 0)).ok, true);

      const final = await repo.cargarResultadoPartido(torneo.id, 2, 0, s1.a, 2, 1);
      assert.equal(final.ok, true);
      assert.equal(final.terminado, true);
      assert.equal((await repo.torneo(torneo.id)).estado, "finalizado");

      const tabla = await repo.puestosDeTorneo(torneo.id);
      assert.equal(tabla.find((p) => p.participanteId === s1.a).puesto, 1);

      const ranking = await repo.rankingDeTemporada(temporada.id);
      assert.equal(ranking.length, 4);
      assert.equal(ranking[0].puntos, 28, "5 participación + 2 check-in + 2 victorias*3 + 15 bonus");
      assert.equal(ranking[0].primeros, 1);
    });

    it("rechaza un BO3 mal cargado sin tocar el estado del torneo", async () => {
      const temporada = await repo.crearTemporada({
        nombre: "T",
        desdeFecha: "2026-08-01",
        hastaFecha: "2026-09-15",
      });
      const torneo = await repo.crearTorneo({
        temporadaId: temporada.id,
        nombre: "Torneo",
        juego: "valorant",
        formato: "1v1",
        cupo: 2,
        minimoParticipantes: 2,
        empiezaEn: "2026-08-20T22:00",
        bestOf: 3,
        bestOfFinal: 3,
        siembra: "manual",
        estado: "inscripcion",
      });
      for (let i = 0; i < 2; i++) {
        const jugador = await repo.crearJugador({ nombre: `J${i}`, discordId: `x${i}`, mayorEdad: true });
        const p = await repo.inscribir({
          torneoId: torneo.id,
          nombre: `J${i}`,
          jugadorIds: [jugador.id],
          pagoOk: true,
          cubiertoPorPase: false,
          inscripcionCentavos: 0,
        });
        await repo.marcarPresente(p.id, true);
      }
      await repo.generarLlave(torneo.id);
      const partido = (await repo.llaveNormalizada(torneo.id)).find((p) => p.ronda === 1);
      const resultado = await repo.cargarResultadoPartido(torneo.id, 1, 0, partido.a, 1, 0);
      assert.equal(resultado.ok, false);
      assert.match(resultado.error, /BO3/);
      assert.equal((await repo.torneo(torneo.id)).estado, "en_juego");
    });

    it("la llave se arma sólo con los que hicieron check-in", async () => {
      const temporada = await repo.crearTemporada({
        nombre: "T",
        desdeFecha: "2026-08-01",
        hastaFecha: "2026-09-15",
      });
      const torneo = await repo.crearTorneo({
        temporadaId: temporada.id,
        nombre: "Torneo",
        juego: "valorant",
        formato: "1v1",
        cupo: 8,
        minimoParticipantes: 2,
        empiezaEn: "2026-08-20T22:00",
        siembra: "manual",
        estado: "inscripcion",
      });
      for (let i = 0; i < 6; i++) {
        const jugador = await repo.crearJugador({ nombre: `J${i}`, discordId: `y${i}`, mayorEdad: true });
        const p = await repo.inscribir({
          torneoId: torneo.id,
          nombre: `J${i}`,
          jugadorIds: [jugador.id],
          pagoOk: true,
          cubiertoPorPase: false,
          inscripcionCentavos: 0,
        });
        if (i < 4) await repo.marcarPresente(p.id, true);
      }
      await repo.generarLlave(torneo.id);
      const llave = await repo.llaveNormalizada(torneo.id);
      const enLlave = new Set(llave.flatMap((p) => [p.a, p.b]).filter((x) => x !== null));
      assert.equal(enLlave.size, 4, "los 2 que no hicieron check-in quedan afuera");
    });

    it("un equipo de 2v2 acredita puntos a los dos integrantes", async () => {
      const temporada = await repo.crearTemporada({
        nombre: "T",
        desdeFecha: "2026-08-01",
        hastaFecha: "2026-09-15",
      });
      const torneo = await repo.crearTorneo({
        temporadaId: temporada.id,
        nombre: "Torneo",
        juego: "truco",
        formato: "2v2",
        cupo: 4,
        minimoParticipantes: 2,
        empiezaEn: "2026-08-20T22:00",
        siembra: "manual",
        estado: "inscripcion",
      });
      const ids = [];
      for (let i = 0; i < 4; i++) {
        const j = await repo.crearJugador({ nombre: `J${i}`, discordId: `z${i}`, mayorEdad: true });
        ids.push(j.id);
      }
      const equipoA = await repo.inscribir({
        torneoId: torneo.id,
        nombre: "Equipo A",
        jugadorIds: [ids[0], ids[1]],
        pagoOk: true,
        cubiertoPorPase: false,
        inscripcionCentavos: 0,
      });
      const equipoB = await repo.inscribir({
        torneoId: torneo.id,
        nombre: "Equipo B",
        jugadorIds: [ids[2], ids[3]],
        pagoOk: true,
        cubiertoPorPase: false,
        inscripcionCentavos: 0,
      });
      await repo.marcarPresente(equipoA.id, true);
      await repo.marcarPresente(equipoB.id, true);

      await repo.generarLlave(torneo.id);
      const partido = (await repo.llaveNormalizada(torneo.id)).find((p) => p.ronda === 1);
      await repo.cargarResultadoPartido(torneo.id, 1, 0, partido.a, 2, 0);

      const ranking = await repo.rankingDeTemporada(temporada.id);
      assert.equal(ranking.length, 4);
      assert.equal(ranking[0].puntos, ranking[1].puntos, "los dos del equipo ganador empatan");

      const porParticipante = await repo.jugadoresPorParticipante(torneo.id);
      assert.equal(porParticipante.get(equipoA.id).length, 2);
    });

    it("borrar un participante lo saca de la llave ya sorteada", async () => {
      const temporada = await repo.crearTemporada({
        nombre: "T",
        desdeFecha: "2026-08-01",
        hastaFecha: "2026-09-15",
      });
      const torneo = await repo.crearTorneo({
        temporadaId: temporada.id,
        nombre: "Torneo",
        juego: "valorant",
        formato: "1v1",
        cupo: 4,
        minimoParticipantes: 2,
        empiezaEn: "2026-08-20T22:00",
        siembra: "manual",
        estado: "inscripcion",
      });
      const participantes = [];
      for (let i = 0; i < 4; i++) {
        const j = await repo.crearJugador({ nombre: `J${i}`, discordId: `w${i}`, mayorEdad: true });
        const p = await repo.inscribir({
          torneoId: torneo.id,
          nombre: `J${i}`,
          jugadorIds: [j.id],
          pagoOk: true,
          cubiertoPorPase: false,
          inscripcionCentavos: 0,
        });
        await repo.marcarPresente(p.id, true);
        participantes.push(p);
      }
      await repo.generarLlave(torneo.id);
      const victima = participantes[0];
      await repo.eliminarParticipante(victima.id);

      const llave = await repo.partidos(torneo.id);
      const sigueAhi = llave.some((p) => p.a === victima.id || p.b === victima.id);
      assert.equal(sigueAhi, false, "no pueden quedar partidos apuntando a un participante borrado");
    });

    it("premioPagado evita pagar dos veces el mismo premio", async () => {
      const temporada = await repo.crearTemporada({
        nombre: "T",
        desdeFecha: "2026-08-01",
        hastaFecha: "2026-09-15",
      });
      const torneo = await repo.crearTorneo({
        temporadaId: temporada.id,
        nombre: "Torneo",
        juego: "valorant",
        formato: "1v1",
        cupo: 2,
        minimoParticipantes: 2,
        empiezaEn: "2026-08-20T22:00",
      });
      assert.equal(await repo.premioPagado(torneo.id), false);
      await repo.crearMovimiento({
        fecha: "2026-08-21",
        tipo: "egreso",
        categoria: "premio",
        concepto: "Premio",
        montoCentavos: pesosACentavos("6000"),
        torneoId: torneo.id,
      });
      assert.equal(await repo.premioPagado(torneo.id), true);
    });

    it("los datos de ejemplo cargan bien y no se duplican", async () => {
      const primera = await sembrar(repo);
      assert.equal(primera.ok, true);
      assert.equal((await repo.jugadores()).length, 8);
      assert.equal((await repo.participantes(primera.torneoId)).length, 8);
      assert.ok((await repo.partidos(primera.torneoId)).length > 0, "la llave quedó sorteada");

      const segunda = await sembrar(repo);
      assert.equal(segunda.ok, false, "sembrar dos veces no puede duplicar datos");
      assert.equal((await repo.jugadores()).length, 8);
    });
  });
}
