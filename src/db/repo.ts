/**
 * Única capa que habla SQL.
 *
 * Todos los métodos son asíncronos porque la base puede estar del otro lado de la red
 * (libSQL/Turso). Donde importa la latencia se cargan los datos en lote en vez de una
 * consulta por fila: contra un archivo local da igual, pero contra una base remota cada
 * consulta es un viaje de ida y vuelta.
 */
import type { Client, InValue, ResultSet } from "@libsql/client";
import { db, hoyISO, type Ejecutor } from "./index.js";
import type { Partido } from "../domain/bracket.js";
import { armarLlave, cargarResultado, mezclar, normalizar, puestos } from "../domain/bracket.js";
import {
  calcularRanking,
  REGLAS_POR_DEFECTO,
  type FilaRanking,
  type ReglasPuntos,
  type ResultadoTorneo,
} from "../domain/ranking.js";
import type { Movimiento } from "../domain/caja.js";

export interface Jugador {
  id: number;
  discord_id: string;
  discord_tag: string;
  nombre: string;
  riot_id: string | null;
  alias_pago: string | null;
  mayor_edad: number;
  notas: string | null;
  baneado: number;
  creado_en: string;
}

export interface Temporada {
  id: number;
  nombre: string;
  desde_fecha: string;
  hasta_fecha: string;
  estado: string;
  premio_final_centavos: number;
  reglas_puntos: string;
  creado_en: string;
}

export interface Torneo {
  id: number;
  temporada_id: number;
  nombre: string;
  juego: string;
  formato: string;
  cupo: number;
  minimo_participantes: number;
  empieza_en: string;
  inscripcion_centavos: number;
  premio_centavos: number;
  premio_tipo: "gift_card" | "especie" | "efectivo";
  premio_descripcion: string | null;
  best_of: number;
  best_of_final: number;
  siembra: string;
  estado: string;
  creado_en: string;
}

export interface Participante {
  id: number;
  torneo_id: number;
  nombre: string;
  pago_ok: number;
  medio_pago: string | null;
  referencia_pago: string | null;
  cubierto_por_pase: number;
  presente: number;
  siembra: number | null;
  creado_en: string;
}

export interface PartidoFila {
  id: number;
  torneo_id: number;
  ronda: number;
  posicion: number;
  participante_a_id: number | null;
  participante_b_id: number | null;
  ganador_id: number | null;
  score_a: number;
  score_b: number;
  best_of: number;
  estado: Partido["estado"];
  jugado_en: string | null;
}

/** Las filas de libSQL exponen las columnas por nombre; las copiamos a objetos planos. */
function aFilas<T>(resultado: ResultSet): T[] {
  return resultado.rows.map((fila) => ({ ...fila }) as unknown as T);
}

function aFila<T>(resultado: ResultSet): T | undefined {
  const fila = resultado.rows[0];
  return fila ? ({ ...fila } as unknown as T) : undefined;
}

function nuevoId(resultado: ResultSet): number {
  return Number(resultado.lastInsertRowid ?? 0);
}

/** Atajo para las rutas: conexión ya migrada + repositorio, en una línea. */
export async function abrirRepo(): Promise<Repo> {
  return new Repo(await db());
}

export class Repo {
  constructor(private readonly conexion: Client) {}

  // ---------- auditoría ----------

  async registrar(actor: string, accion: string, detalle = ""): Promise<void> {
    await this.conexion.execute({
      sql: `INSERT INTO auditoria (actor, accion, detalle) VALUES (?, ?, ?)`,
      args: [actor, accion, detalle],
    });
  }

  async ultimaAuditoria(
    limite = 20,
  ): Promise<Array<{ actor: string; accion: string; detalle: string; creado_en: string }>> {
    return aFilas(
      await this.conexion.execute({
        sql: `SELECT actor, accion, detalle, creado_en FROM auditoria ORDER BY id DESC LIMIT ?`,
        args: [limite],
      }),
    );
  }

  // ---------- jugadores ----------

  async jugadores(): Promise<Jugador[]> {
    return aFilas(
      await this.conexion.execute(
        `SELECT * FROM jugadores ORDER BY baneado ASC, nombre COLLATE NOCASE ASC`,
      ),
    );
  }

  async jugador(id: number): Promise<Jugador | undefined> {
    return aFila(
      await this.conexion.execute({ sql: `SELECT * FROM jugadores WHERE id = ?`, args: [id] }),
    );
  }

  async crearJugador(datos: {
    discord_id: string;
    discord_tag: string;
    nombre: string;
    riot_id?: string | null;
    alias_pago?: string | null;
    mayor_edad: boolean;
    notas?: string | null;
  }): Promise<number> {
    const resultado = await this.conexion.execute({
      sql: `INSERT INTO jugadores (discord_id, discord_tag, nombre, riot_id, alias_pago, mayor_edad, notas)
            VALUES (@discord_id, @discord_tag, @nombre, @riot_id, @alias_pago, @mayor_edad, @notas)`,
      args: {
        discord_id: datos.discord_id,
        discord_tag: datos.discord_tag,
        nombre: datos.nombre,
        riot_id: datos.riot_id ?? null,
        alias_pago: datos.alias_pago ?? null,
        mayor_edad: datos.mayor_edad ? 1 : 0,
        notas: datos.notas ?? null,
      },
    });
    return nuevoId(resultado);
  }

  async actualizarJugador(
    id: number,
    datos: {
      discord_tag: string;
      nombre: string;
      riot_id?: string | null;
      alias_pago?: string | null;
      mayor_edad: boolean;
      baneado: boolean;
      notas?: string | null;
    },
  ): Promise<void> {
    await this.conexion.execute({
      sql: `UPDATE jugadores SET discord_tag = @discord_tag, nombre = @nombre, riot_id = @riot_id,
            alias_pago = @alias_pago, mayor_edad = @mayor_edad, baneado = @baneado, notas = @notas
            WHERE id = @id`,
      args: {
        id,
        discord_tag: datos.discord_tag,
        nombre: datos.nombre,
        riot_id: datos.riot_id ?? null,
        alias_pago: datos.alias_pago ?? null,
        mayor_edad: datos.mayor_edad ? 1 : 0,
        baneado: datos.baneado ? 1 : 0,
        notas: datos.notas ?? null,
      },
    });
  }

  // ---------- temporadas ----------

  async temporadas(): Promise<Temporada[]> {
    return aFilas(await this.conexion.execute(`SELECT * FROM temporadas ORDER BY desde_fecha DESC`));
  }

  async temporada(id: number): Promise<Temporada | undefined> {
    return aFila(
      await this.conexion.execute({ sql: `SELECT * FROM temporadas WHERE id = ?`, args: [id] }),
    );
  }

  async temporadaActiva(): Promise<Temporada | undefined> {
    return aFila(
      await this.conexion.execute(
        `SELECT * FROM temporadas WHERE estado = 'activa' ORDER BY desde_fecha DESC LIMIT 1`,
      ),
    );
  }

  async crearTemporada(datos: {
    nombre: string;
    desde_fecha: string;
    hasta_fecha: string;
    premio_final_centavos: number;
    reglas?: ReglasPuntos;
  }): Promise<number> {
    const resultado = await this.conexion.execute({
      sql: `INSERT INTO temporadas (nombre, desde_fecha, hasta_fecha, premio_final_centavos, reglas_puntos)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        datos.nombre,
        datos.desde_fecha,
        datos.hasta_fecha,
        datos.premio_final_centavos,
        JSON.stringify(datos.reglas ?? REGLAS_POR_DEFECTO),
      ],
    });
    return nuevoId(resultado);
  }

  async cerrarTemporada(id: number): Promise<void> {
    await this.conexion.execute({
      sql: `UPDATE temporadas SET estado = 'cerrada' WHERE id = ?`,
      args: [id],
    });
  }

  async reglasDeTemporada(id: number): Promise<ReglasPuntos> {
    const temporada = await this.temporada(id);
    if (!temporada) return REGLAS_POR_DEFECTO;
    try {
      return { ...REGLAS_POR_DEFECTO, ...(JSON.parse(temporada.reglas_puntos) as ReglasPuntos) };
    } catch {
      return REGLAS_POR_DEFECTO;
    }
  }

  // ---------- pases ----------

  async pasesDeTemporada(temporadaId: number): Promise<
    Array<{
      id: number;
      jugador_id: number;
      nombre: string;
      nivel: string;
      precio_centavos: number;
      desde_fecha: string;
      hasta_fecha: string;
    }>
  > {
    return aFilas(
      await this.conexion.execute({
        sql: `SELECT p.id, p.jugador_id, j.nombre, p.nivel, p.precio_centavos, p.desde_fecha, p.hasta_fecha
              FROM pases p JOIN jugadores j ON j.id = p.jugador_id
              WHERE p.temporada_id = ? ORDER BY p.hasta_fecha DESC`,
        args: [temporadaId],
      }),
    );
  }

  async tienePaseActivo(jugadorId: number, fecha = hoyISO()): Promise<boolean> {
    const resultado = await this.conexion.execute({
      sql: `SELECT 1 FROM pases WHERE jugador_id = ? AND desde_fecha <= ? AND hasta_fecha >= ? LIMIT 1`,
      args: [jugadorId, fecha, fecha],
    });
    return resultado.rows.length > 0;
  }

  /** Todos los jugadores con pase vigente, en una sola consulta. */
  async jugadoresConPaseActivo(fecha = hoyISO()): Promise<Set<number>> {
    const resultado = await this.conexion.execute({
      sql: `SELECT DISTINCT jugador_id FROM pases WHERE desde_fecha <= ? AND hasta_fecha >= ?`,
      args: [fecha, fecha],
    });
    return new Set(resultado.rows.map((fila) => Number(fila.jugador_id)));
  }

  async crearPase(datos: {
    jugador_id: number;
    temporada_id: number;
    nivel: string;
    precio_centavos: number;
    desde_fecha: string;
    hasta_fecha: string;
    medio_pago?: string | null;
    referencia_pago?: string | null;
  }): Promise<number> {
    const resultado = await this.conexion.execute({
      sql: `INSERT INTO pases (jugador_id, temporada_id, nivel, precio_centavos, desde_fecha, hasta_fecha, medio_pago, referencia_pago)
            VALUES (@jugador_id, @temporada_id, @nivel, @precio_centavos, @desde_fecha, @hasta_fecha, @medio_pago, @referencia_pago)`,
      args: {
        jugador_id: datos.jugador_id,
        temporada_id: datos.temporada_id,
        nivel: datos.nivel,
        precio_centavos: datos.precio_centavos,
        desde_fecha: datos.desde_fecha,
        hasta_fecha: datos.hasta_fecha,
        medio_pago: datos.medio_pago ?? null,
        referencia_pago: datos.referencia_pago ?? null,
      },
    });
    const paseId = nuevoId(resultado);
    // El pase entra a la caja automáticamente: si no, la caja miente.
    await this.crearMovimiento({
      fecha: hoyISO(),
      tipo: "ingreso",
      categoria: "pase",
      concepto: `Pase ${datos.nivel}`,
      monto_centavos: datos.precio_centavos,
      jugador_id: datos.jugador_id,
      medio: datos.medio_pago ?? null,
      referencia: datos.referencia_pago ?? null,
      creado_por: "panel",
    });
    return paseId;
  }

  // ---------- torneos ----------

  async torneos(filtro?: { temporadaId?: number; estado?: string }): Promise<Torneo[]> {
    const condiciones: string[] = [];
    const args: InValue[] = [];
    if (filtro?.temporadaId) {
      condiciones.push("temporada_id = ?");
      args.push(filtro.temporadaId);
    }
    if (filtro?.estado) {
      condiciones.push("estado = ?");
      args.push(filtro.estado);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
    return aFilas(
      await this.conexion.execute({
        sql: `SELECT * FROM torneos ${where} ORDER BY empieza_en DESC`,
        args,
      }),
    );
  }

  async torneo(id: number): Promise<Torneo | undefined> {
    return aFila(
      await this.conexion.execute({ sql: `SELECT * FROM torneos WHERE id = ?`, args: [id] }),
    );
  }

  async crearTorneo(
    datos: Omit<Torneo, "id" | "creado_en" | "estado"> & { estado?: string },
  ): Promise<number> {
    const resultado = await this.conexion.execute({
      sql: `INSERT INTO torneos (temporada_id, nombre, juego, formato, cupo, minimo_participantes, empieza_en,
              inscripcion_centavos, premio_centavos, premio_tipo, premio_descripcion, best_of, best_of_final, siembra, estado)
            VALUES (@temporada_id, @nombre, @juego, @formato, @cupo, @minimo_participantes, @empieza_en,
              @inscripcion_centavos, @premio_centavos, @premio_tipo, @premio_descripcion, @best_of, @best_of_final, @siembra, @estado)`,
      args: {
        temporada_id: datos.temporada_id,
        nombre: datos.nombre,
        juego: datos.juego,
        formato: datos.formato,
        cupo: datos.cupo,
        minimo_participantes: datos.minimo_participantes,
        empieza_en: datos.empieza_en,
        inscripcion_centavos: datos.inscripcion_centavos,
        premio_centavos: datos.premio_centavos,
        premio_tipo: datos.premio_tipo,
        premio_descripcion: datos.premio_descripcion ?? null,
        best_of: datos.best_of,
        best_of_final: datos.best_of_final,
        siembra: datos.siembra,
        estado: datos.estado ?? "borrador",
      },
    });
    return nuevoId(resultado);
  }

  async cambiarEstadoTorneo(id: number, estado: string): Promise<void> {
    await this.conexion.execute({
      sql: `UPDATE torneos SET estado = ? WHERE id = ?`,
      args: [estado, id],
    });
  }

  // ---------- participantes ----------

  async participantes(torneoId: number): Promise<Participante[]> {
    return aFilas(
      await this.conexion.execute({
        sql: `SELECT * FROM participantes WHERE torneo_id = ? ORDER BY id ASC`,
        args: [torneoId],
      }),
    );
  }

  async participante(id: number): Promise<Participante | undefined> {
    return aFila(
      await this.conexion.execute({ sql: `SELECT * FROM participantes WHERE id = ?`, args: [id] }),
    );
  }

  async jugadoresDeParticipante(participanteId: number): Promise<Jugador[]> {
    return aFilas(
      await this.conexion.execute({
        sql: `SELECT j.* FROM jugadores j
              JOIN participante_jugadores pj ON pj.jugador_id = j.id
              WHERE pj.participante_id = ? ORDER BY pj.capitan DESC, j.nombre ASC`,
        args: [participanteId],
      }),
    );
  }

  /**
   * Los jugadores de todos los participantes de un torneo, en una sola consulta.
   * Evita el N+1 en la ficha del torneo y en el cálculo del ranking.
   */
  async jugadoresPorParticipante(torneoId: number): Promise<Map<number, Jugador[]>> {
    const resultado = await this.conexion.execute({
      sql: `SELECT pj.participante_id AS participante_id, j.*
            FROM jugadores j
            JOIN participante_jugadores pj ON pj.jugador_id = j.id
            JOIN participantes p ON p.id = pj.participante_id
            WHERE p.torneo_id = ?
            ORDER BY pj.capitan DESC, j.nombre ASC`,
      args: [torneoId],
    });
    const porParticipante = new Map<number, Jugador[]>();
    for (const fila of resultado.rows) {
      const { participante_id, ...jugador } = { ...fila };
      const clave = Number(participante_id);
      const lista = porParticipante.get(clave);
      if (lista) lista.push(jugador as unknown as Jugador);
      else porParticipante.set(clave, [jugador as unknown as Jugador]);
    }
    return porParticipante;
  }

  async inscribir(datos: {
    torneo_id: number;
    nombre: string;
    jugadorIds: number[];
    pago_ok: boolean;
    cubierto_por_pase: boolean;
    medio_pago?: string | null;
    referencia_pago?: string | null;
    inscripcion_centavos: number;
  }): Promise<number> {
    const tx = await this.conexion.transaction("write");
    try {
      const resultado = await tx.execute({
        sql: `INSERT INTO participantes (torneo_id, nombre, pago_ok, medio_pago, referencia_pago, cubierto_por_pase)
              VALUES (@torneo_id, @nombre, @pago_ok, @medio_pago, @referencia_pago, @cubierto_por_pase)`,
        args: {
          torneo_id: datos.torneo_id,
          nombre: datos.nombre,
          pago_ok: datos.pago_ok ? 1 : 0,
          medio_pago: datos.medio_pago ?? null,
          referencia_pago: datos.referencia_pago ?? null,
          cubierto_por_pase: datos.cubierto_por_pase ? 1 : 0,
        },
      });
      const participanteId = nuevoId(resultado);

      for (const [indice, jugadorId] of datos.jugadorIds.entries()) {
        await tx.execute({
          sql: `INSERT OR IGNORE INTO participante_jugadores (participante_id, jugador_id, capitan) VALUES (?, ?, ?)`,
          args: [participanteId, jugadorId, indice === 0 ? 1 : 0],
        });
      }

      if (datos.pago_ok && !datos.cubierto_por_pase && datos.inscripcion_centavos > 0) {
        await this.crearMovimiento(
          {
            fecha: hoyISO(),
            tipo: "ingreso",
            categoria: "inscripcion",
            concepto: `Inscripción ${datos.nombre}`,
            monto_centavos: datos.inscripcion_centavos,
            torneo_id: datos.torneo_id,
            jugador_id: datos.jugadorIds[0] ?? null,
            medio: datos.medio_pago ?? null,
            referencia: datos.referencia_pago ?? null,
            creado_por: "panel",
          },
          tx,
        );
      }

      await tx.commit();
      return participanteId;
    } finally {
      tx.close();
    }
  }

  async marcarPago(
    participanteId: number,
    pago: boolean,
    medio?: string,
    referencia?: string,
  ): Promise<void> {
    const participante = await this.participante(participanteId);
    if (!participante) return;
    await this.conexion.execute({
      sql: `UPDATE participantes SET pago_ok = ?, medio_pago = ?, referencia_pago = ? WHERE id = ?`,
      args: [
        pago ? 1 : 0,
        medio ?? participante.medio_pago,
        referencia ?? participante.referencia_pago,
        participanteId,
      ],
    });

    if (pago && !participante.pago_ok && !participante.cubierto_por_pase) {
      const torneo = await this.torneo(participante.torneo_id);
      if (torneo && torneo.inscripcion_centavos > 0) {
        const jugadores = await this.jugadoresDeParticipante(participanteId);
        await this.crearMovimiento({
          fecha: hoyISO(),
          tipo: "ingreso",
          categoria: "inscripcion",
          concepto: `Inscripción ${participante.nombre}`,
          monto_centavos: torneo.inscripcion_centavos,
          torneo_id: torneo.id,
          jugador_id: jugadores[0]?.id ?? null,
          medio: medio ?? null,
          referencia: referencia ?? null,
          creado_por: "panel",
        });
      }
    }
  }

  async marcarPresente(participanteId: number, presente: boolean): Promise<void> {
    await this.conexion.execute({
      sql: `UPDATE participantes SET presente = ? WHERE id = ?`,
      args: [presente ? 1 : 0, participanteId],
    });
  }

  async eliminarParticipante(participanteId: number): Promise<void> {
    await this.conexion.execute({
      sql: `DELETE FROM participantes WHERE id = ?`,
      args: [participanteId],
    });
  }

  // ---------- llaves ----------

  async partidos(torneoId: number): Promise<PartidoFila[]> {
    return aFilas(
      await this.conexion.execute({
        sql: `SELECT * FROM partidos WHERE torneo_id = ? ORDER BY ronda ASC, posicion ASC`,
        args: [torneoId],
      }),
    );
  }

  private aDominio(filas: PartidoFila[]): Partido[] {
    return filas.map((f) => ({
      ronda: f.ronda,
      posicion: f.posicion,
      a: f.participante_a_id,
      b: f.participante_b_id,
      ganadorId: f.ganador_id,
      scoreA: f.score_a,
      scoreB: f.score_b,
      bestOf: f.best_of,
      estado: f.estado,
    }));
  }

  /** Reescribe la llave completa de forma atómica y en un solo viaje a la base. */
  private async guardarLlave(torneoId: number, partidos: Partido[]): Promise<void> {
    await this.conexion.batch(
      [
        { sql: `DELETE FROM partidos WHERE torneo_id = ?`, args: [torneoId] },
        ...partidos.map((p) => ({
          sql: `INSERT INTO partidos (torneo_id, ronda, posicion, participante_a_id, participante_b_id,
                  ganador_id, score_a, score_b, best_of, estado, jugado_en)
                VALUES (@torneo_id, @ronda, @posicion, @a, @b, @ganador, @score_a, @score_b, @best_of, @estado, @jugado_en)`,
          args: {
            torneo_id: torneoId,
            ronda: p.ronda,
            posicion: p.posicion,
            a: p.a,
            b: p.b,
            ganador: p.ganadorId,
            score_a: p.scoreA,
            score_b: p.scoreB,
            best_of: p.bestOf,
            estado: p.estado,
            jugado_en:
              p.estado === "jugado" || p.estado === "walkover" ? new Date().toISOString() : null,
          },
        })),
      ],
      "write",
    );
  }

  /**
   * Genera la llave con los participantes presentes (check-in hecho).
   * Los que no se presentaron quedan afuera: el walkover automático es peor que no armar la llave.
   */
  async generarLlave(
    torneoId: number,
    random: () => number = Math.random,
  ): Promise<{ ok: boolean; error?: string }> {
    const torneo = await this.torneo(torneoId);
    if (!torneo) return { ok: false, error: "El torneo no existe" };

    const todos = await this.participantes(torneoId);
    const presentes = todos.filter((p) => p.presente === 1);
    const base = presentes.length >= 2 ? presentes : todos;
    if (base.length < 2) return { ok: false, error: "Hacen falta al menos 2 participantes" };

    let ordenados = base;
    if (torneo.siembra === "sorteo") {
      ordenados = mezclar(base, random);
    } else if (torneo.siembra === "manual") {
      ordenados = [...base].sort((a, b) => (a.siembra ?? 999) - (b.siembra ?? 999));
    } else if (torneo.siembra === "ranking") {
      const ranking = await this.rankingDeTemporada(torneo.temporada_id);
      const posicion = new Map(ranking.map((f, i) => [f.jugadorId, i]));
      const jugadoresPor = await this.jugadoresPorParticipante(torneoId);
      ordenados = [...base].sort((a, b) => {
        const ja = jugadoresPor.get(a.id)?.[0]?.id ?? -1;
        const jb = jugadoresPor.get(b.id)?.[0]?.id ?? -1;
        return (posicion.get(ja) ?? 999) - (posicion.get(jb) ?? 999);
      });
    }

    const llave = armarLlave(
      ordenados.map((p) => p.id),
      { bestOf: torneo.best_of, bestOfFinal: torneo.best_of_final },
    );
    await this.guardarLlave(torneoId, llave);
    await this.cambiarEstadoTorneo(torneoId, "en_juego");
    return { ok: true };
  }

  async cargarResultadoPartido(
    torneoId: number,
    ronda: number,
    posicion: number,
    ganadorId: number,
    scoreA: number,
    scoreB: number,
    walkover = false,
  ): Promise<{ ok: boolean; error?: string; terminado?: boolean }> {
    const filas = await this.partidos(torneoId);
    if (filas.length === 0) return { ok: false, error: "El torneo no tiene llave generada" };
    let nueva: Partido[];
    try {
      nueva = cargarResultado(this.aDominio(filas), {
        ronda,
        posicion,
        ganadorId,
        scoreA,
        scoreB,
        walkover,
      });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Error desconocido" };
    }
    await this.guardarLlave(torneoId, nueva);
    const total = Math.max(...nueva.map((p) => p.ronda));
    const final = nueva.find((p) => p.ronda === total && p.posicion === 0);
    const terminado = Boolean(final?.ganadorId);
    if (terminado) await this.cambiarEstadoTorneo(torneoId, "finalizado");
    return { ok: true, terminado };
  }

  async llaveNormalizada(torneoId: number): Promise<Partido[]> {
    const filas = await this.partidos(torneoId);
    if (filas.length === 0) return [];
    return normalizar(this.aDominio(filas));
  }

  async puestosDeTorneo(torneoId: number): Promise<ReturnType<typeof puestos>> {
    const filas = await this.partidos(torneoId);
    if (filas.length === 0) return [];
    const participantes = (await this.participantes(torneoId))
      .filter((p) => filas.some((f) => f.participante_a_id === p.id || f.participante_b_id === p.id))
      .map((p) => p.id);
    return puestos(this.aDominio(filas), participantes);
  }

  // ---------- ranking ----------

  /** Convierte los resultados de todos los torneos finalizados de la temporada en filas de ranking. */
  async resultadosDeTemporada(temporadaId: number): Promise<ResultadoTorneo[]> {
    const torneos = (await this.torneos({ temporadaId })).filter(
      (t) => t.estado === "finalizado" || t.estado === "en_juego",
    );
    const salida: ResultadoTorneo[] = [];
    for (const torneo of torneos) {
      // Tres consultas por torneo en vez de dos por participante.
      const [puestosTorneo, participantes, jugadoresPor] = await Promise.all([
        this.puestosDeTorneo(torneo.id),
        this.participantes(torneo.id),
        this.jugadoresPorParticipante(torneo.id),
      ]);
      const porId = new Map(participantes.map((p) => [p.id, p]));
      for (const puesto of puestosTorneo) {
        const participante = porId.get(puesto.participanteId);
        if (!participante) continue;
        for (const jugador of jugadoresPor.get(puesto.participanteId) ?? []) {
          salida.push({
            torneoId: torneo.id,
            jugadorId: jugador.id,
            puesto: puesto.puesto,
            victorias: puesto.victorias,
            partidosJugados: puesto.partidosJugados,
            sePresento: participante.presente === 1 || puesto.partidosJugados > 0,
          });
        }
      }
    }
    return salida;
  }

  async rankingDeTemporada(temporadaId: number): Promise<FilaRanking[]> {
    const [reglas, resultados] = await Promise.all([
      this.reglasDeTemporada(temporadaId),
      this.resultadosDeTemporada(temporadaId),
    ]);
    return calcularRanking(resultados, reglas);
  }

  // ---------- caja ----------

  async crearMovimiento(
    datos: {
      fecha: string;
      tipo: "ingreso" | "egreso";
      categoria: string;
      concepto: string;
      monto_centavos: number;
      torneo_id?: number | null;
      jugador_id?: number | null;
      medio?: string | null;
      referencia?: string | null;
      creado_por?: string | null;
    },
    ejecutor: Ejecutor = this.conexion,
  ): Promise<number> {
    const resultado = await ejecutor.execute({
      sql: `INSERT INTO movimientos (fecha, tipo, categoria, concepto, monto_centavos, torneo_id, jugador_id, medio, referencia, creado_por)
            VALUES (@fecha, @tipo, @categoria, @concepto, @monto_centavos, @torneo_id, @jugador_id, @medio, @referencia, @creado_por)`,
      args: {
        fecha: datos.fecha,
        tipo: datos.tipo,
        categoria: datos.categoria,
        concepto: datos.concepto,
        monto_centavos: datos.monto_centavos,
        torneo_id: datos.torneo_id ?? null,
        jugador_id: datos.jugador_id ?? null,
        medio: datos.medio ?? null,
        referencia: datos.referencia ?? null,
        creado_por: datos.creado_por ?? "panel",
      },
    });
    return nuevoId(resultado);
  }

  async movimientos(filtro?: { desde?: string; hasta?: string; torneoId?: number }): Promise<
    Array<Movimiento & { id: number; categoria: string; medio: string | null; referencia: string | null }>
  > {
    const condiciones: string[] = [];
    const args: InValue[] = [];
    if (filtro?.desde) {
      condiciones.push("fecha >= ?");
      args.push(filtro.desde);
    }
    if (filtro?.hasta) {
      condiciones.push("fecha <= ?");
      args.push(filtro.hasta);
    }
    if (filtro?.torneoId) {
      condiciones.push("torneo_id = ?");
      args.push(filtro.torneoId);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
    const filas = aFilas<{
      id: number;
      fecha: string;
      tipo: "ingreso" | "egreso";
      categoria: string;
      concepto: string;
      monto_centavos: number;
      torneo_id: number | null;
      medio: string | null;
      referencia: string | null;
    }>(
      await this.conexion.execute({
        sql: `SELECT * FROM movimientos ${where} ORDER BY fecha DESC, id DESC`,
        args,
      }),
    );
    return filas.map((f) => ({
      id: f.id,
      fecha: f.fecha,
      tipo: f.tipo,
      categoria: f.categoria,
      concepto: f.concepto,
      montoCentavos: f.monto_centavos,
      torneoId: f.torneo_id,
      medio: f.medio,
      referencia: f.referencia,
    }));
  }

  async borrarMovimiento(id: number): Promise<void> {
    await this.conexion.execute({ sql: `DELETE FROM movimientos WHERE id = ?`, args: [id] });
  }

  /** ¿Ya se registró el pago del premio de este torneo? Sirve para no pagar dos veces. */
  async premioPagado(torneoId: number): Promise<boolean> {
    const resultado = await this.conexion.execute({
      sql: `SELECT 1 FROM movimientos WHERE torneo_id = ? AND categoria = 'premio' LIMIT 1`,
      args: [torneoId],
    });
    return resultado.rows.length > 0;
  }
}
