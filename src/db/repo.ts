import type { Database } from "better-sqlite3";
import { hoyISO } from "./index.js";
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

export class Repo {
  constructor(private readonly conexion: Database) {}

  // ---------- auditoría ----------

  registrar(actor: string, accion: string, detalle = ""): void {
    this.conexion
      .prepare(`INSERT INTO auditoria (actor, accion, detalle) VALUES (?, ?, ?)`)
      .run(actor, accion, detalle);
  }

  ultimaAuditoria(limite = 20): Array<{ actor: string; accion: string; detalle: string; creado_en: string }> {
    return this.conexion
      .prepare(`SELECT actor, accion, detalle, creado_en FROM auditoria ORDER BY id DESC LIMIT ?`)
      .all(limite) as Array<{ actor: string; accion: string; detalle: string; creado_en: string }>;
  }

  // ---------- jugadores ----------

  jugadores(): Jugador[] {
    return this.conexion
      .prepare(`SELECT * FROM jugadores ORDER BY baneado ASC, nombre COLLATE NOCASE ASC`)
      .all() as Jugador[];
  }

  jugador(id: number): Jugador | undefined {
    return this.conexion.prepare(`SELECT * FROM jugadores WHERE id = ?`).get(id) as Jugador | undefined;
  }

  crearJugador(datos: {
    discord_id: string;
    discord_tag: string;
    nombre: string;
    riot_id?: string | null;
    alias_pago?: string | null;
    mayor_edad: boolean;
    notas?: string | null;
  }): number {
    const info = this.conexion
      .prepare(
        `INSERT INTO jugadores (discord_id, discord_tag, nombre, riot_id, alias_pago, mayor_edad, notas)
         VALUES (@discord_id, @discord_tag, @nombre, @riot_id, @alias_pago, @mayor_edad, @notas)`,
      )
      .run({
        discord_id: datos.discord_id,
        discord_tag: datos.discord_tag,
        nombre: datos.nombre,
        riot_id: datos.riot_id ?? null,
        alias_pago: datos.alias_pago ?? null,
        mayor_edad: datos.mayor_edad ? 1 : 0,
        notas: datos.notas ?? null,
      });
    return Number(info.lastInsertRowid);
  }

  actualizarJugador(
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
  ): void {
    this.conexion
      .prepare(
        `UPDATE jugadores SET discord_tag = @discord_tag, nombre = @nombre, riot_id = @riot_id,
         alias_pago = @alias_pago, mayor_edad = @mayor_edad, baneado = @baneado, notas = @notas
         WHERE id = @id`,
      )
      .run({
        id,
        discord_tag: datos.discord_tag,
        nombre: datos.nombre,
        riot_id: datos.riot_id ?? null,
        alias_pago: datos.alias_pago ?? null,
        mayor_edad: datos.mayor_edad ? 1 : 0,
        baneado: datos.baneado ? 1 : 0,
        notas: datos.notas ?? null,
      });
  }

  // ---------- temporadas ----------

  temporadas(): Temporada[] {
    return this.conexion
      .prepare(`SELECT * FROM temporadas ORDER BY desde_fecha DESC`)
      .all() as Temporada[];
  }

  temporada(id: number): Temporada | undefined {
    return this.conexion.prepare(`SELECT * FROM temporadas WHERE id = ?`).get(id) as
      | Temporada
      | undefined;
  }

  temporadaActiva(): Temporada | undefined {
    return this.conexion
      .prepare(`SELECT * FROM temporadas WHERE estado = 'activa' ORDER BY desde_fecha DESC LIMIT 1`)
      .get() as Temporada | undefined;
  }

  crearTemporada(datos: {
    nombre: string;
    desde_fecha: string;
    hasta_fecha: string;
    premio_final_centavos: number;
    reglas?: ReglasPuntos;
  }): number {
    const info = this.conexion
      .prepare(
        `INSERT INTO temporadas (nombre, desde_fecha, hasta_fecha, premio_final_centavos, reglas_puntos)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        datos.nombre,
        datos.desde_fecha,
        datos.hasta_fecha,
        datos.premio_final_centavos,
        JSON.stringify(datos.reglas ?? REGLAS_POR_DEFECTO),
      );
    return Number(info.lastInsertRowid);
  }

  cerrarTemporada(id: number): void {
    this.conexion.prepare(`UPDATE temporadas SET estado = 'cerrada' WHERE id = ?`).run(id);
  }

  reglasDeTemporada(id: number): ReglasPuntos {
    const t = this.temporada(id);
    if (!t) return REGLAS_POR_DEFECTO;
    try {
      return { ...REGLAS_POR_DEFECTO, ...(JSON.parse(t.reglas_puntos) as ReglasPuntos) };
    } catch {
      return REGLAS_POR_DEFECTO;
    }
  }

  // ---------- pases ----------

  pasesDeTemporada(temporadaId: number): Array<{
    id: number;
    jugador_id: number;
    nombre: string;
    nivel: string;
    precio_centavos: number;
    desde_fecha: string;
    hasta_fecha: string;
  }> {
    return this.conexion
      .prepare(
        `SELECT p.id, p.jugador_id, j.nombre, p.nivel, p.precio_centavos, p.desde_fecha, p.hasta_fecha
         FROM pases p JOIN jugadores j ON j.id = p.jugador_id
         WHERE p.temporada_id = ? ORDER BY p.hasta_fecha DESC`,
      )
      .all(temporadaId) as Array<{
      id: number;
      jugador_id: number;
      nombre: string;
      nivel: string;
      precio_centavos: number;
      desde_fecha: string;
      hasta_fecha: string;
    }>;
  }

  tienePaseActivo(jugadorId: number, fecha = hoyISO()): boolean {
    const fila = this.conexion
      .prepare(
        `SELECT 1 FROM pases WHERE jugador_id = ? AND desde_fecha <= ? AND hasta_fecha >= ? LIMIT 1`,
      )
      .get(jugadorId, fecha, fecha);
    return Boolean(fila);
  }

  crearPase(datos: {
    jugador_id: number;
    temporada_id: number;
    nivel: string;
    precio_centavos: number;
    desde_fecha: string;
    hasta_fecha: string;
    medio_pago?: string | null;
    referencia_pago?: string | null;
  }): number {
    const info = this.conexion
      .prepare(
        `INSERT INTO pases (jugador_id, temporada_id, nivel, precio_centavos, desde_fecha, hasta_fecha, medio_pago, referencia_pago)
         VALUES (@jugador_id, @temporada_id, @nivel, @precio_centavos, @desde_fecha, @hasta_fecha, @medio_pago, @referencia_pago)`,
      )
      .run({
        ...datos,
        medio_pago: datos.medio_pago ?? null,
        referencia_pago: datos.referencia_pago ?? null,
      });
    const paseId = Number(info.lastInsertRowid);
    // El pase entra a la caja automáticamente: si no, la caja miente.
    this.crearMovimiento({
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

  torneos(filtro?: { temporadaId?: number; estado?: string }): Torneo[] {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    if (filtro?.temporadaId) {
      condiciones.push("temporada_id = ?");
      params.push(filtro.temporadaId);
    }
    if (filtro?.estado) {
      condiciones.push("estado = ?");
      params.push(filtro.estado);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
    return this.conexion
      .prepare(`SELECT * FROM torneos ${where} ORDER BY empieza_en DESC`)
      .all(...params) as Torneo[];
  }

  torneo(id: number): Torneo | undefined {
    return this.conexion.prepare(`SELECT * FROM torneos WHERE id = ?`).get(id) as Torneo | undefined;
  }

  crearTorneo(datos: Omit<Torneo, "id" | "creado_en" | "estado"> & { estado?: string }): number {
    const info = this.conexion
      .prepare(
        `INSERT INTO torneos (temporada_id, nombre, juego, formato, cupo, minimo_participantes, empieza_en,
            inscripcion_centavos, premio_centavos, premio_tipo, premio_descripcion, best_of, best_of_final, siembra, estado)
         VALUES (@temporada_id, @nombre, @juego, @formato, @cupo, @minimo_participantes, @empieza_en,
            @inscripcion_centavos, @premio_centavos, @premio_tipo, @premio_descripcion, @best_of, @best_of_final, @siembra, @estado)`,
      )
      .run({
        ...datos,
        premio_descripcion: datos.premio_descripcion ?? null,
        estado: datos.estado ?? "borrador",
      });
    return Number(info.lastInsertRowid);
  }

  cambiarEstadoTorneo(id: number, estado: string): void {
    this.conexion.prepare(`UPDATE torneos SET estado = ? WHERE id = ?`).run(estado, id);
  }

  // ---------- participantes ----------

  participantes(torneoId: number): Participante[] {
    return this.conexion
      .prepare(`SELECT * FROM participantes WHERE torneo_id = ? ORDER BY id ASC`)
      .all(torneoId) as Participante[];
  }

  participante(id: number): Participante | undefined {
    return this.conexion.prepare(`SELECT * FROM participantes WHERE id = ?`).get(id) as
      | Participante
      | undefined;
  }

  jugadoresDeParticipante(participanteId: number): Jugador[] {
    return this.conexion
      .prepare(
        `SELECT j.* FROM jugadores j
         JOIN participante_jugadores pj ON pj.jugador_id = j.id
         WHERE pj.participante_id = ? ORDER BY pj.capitan DESC, j.nombre ASC`,
      )
      .all(participanteId) as Jugador[];
  }

  inscribir(datos: {
    torneo_id: number;
    nombre: string;
    jugadorIds: number[];
    pago_ok: boolean;
    cubierto_por_pase: boolean;
    medio_pago?: string | null;
    referencia_pago?: string | null;
    inscripcion_centavos: number;
  }): number {
    const tx = this.conexion.transaction(() => {
      const info = this.conexion
        .prepare(
          `INSERT INTO participantes (torneo_id, nombre, pago_ok, medio_pago, referencia_pago, cubierto_por_pase)
           VALUES (@torneo_id, @nombre, @pago_ok, @medio_pago, @referencia_pago, @cubierto_por_pase)`,
        )
        .run({
          torneo_id: datos.torneo_id,
          nombre: datos.nombre,
          pago_ok: datos.pago_ok ? 1 : 0,
          medio_pago: datos.medio_pago ?? null,
          referencia_pago: datos.referencia_pago ?? null,
          cubierto_por_pase: datos.cubierto_por_pase ? 1 : 0,
        });
      const participanteId = Number(info.lastInsertRowid);
      const insertarJugador = this.conexion.prepare(
        `INSERT OR IGNORE INTO participante_jugadores (participante_id, jugador_id, capitan) VALUES (?, ?, ?)`,
      );
      datos.jugadorIds.forEach((jugadorId, indice) => {
        insertarJugador.run(participanteId, jugadorId, indice === 0 ? 1 : 0);
      });

      if (datos.pago_ok && !datos.cubierto_por_pase && datos.inscripcion_centavos > 0) {
        this.crearMovimiento({
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
        });
      }
      return participanteId;
    });
    return tx();
  }

  marcarPago(participanteId: number, pago: boolean, medio?: string, referencia?: string): void {
    const participante = this.participante(participanteId);
    if (!participante) return;
    this.conexion
      .prepare(`UPDATE participantes SET pago_ok = ?, medio_pago = ?, referencia_pago = ? WHERE id = ?`)
      .run(pago ? 1 : 0, medio ?? participante.medio_pago, referencia ?? participante.referencia_pago, participanteId);

    if (pago && !participante.pago_ok && !participante.cubierto_por_pase) {
      const torneo = this.torneo(participante.torneo_id);
      if (torneo && torneo.inscripcion_centavos > 0) {
        const jugadores = this.jugadoresDeParticipante(participanteId);
        this.crearMovimiento({
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

  marcarPresente(participanteId: number, presente: boolean): void {
    this.conexion
      .prepare(`UPDATE participantes SET presente = ? WHERE id = ?`)
      .run(presente ? 1 : 0, participanteId);
  }

  eliminarParticipante(participanteId: number): void {
    this.conexion.prepare(`DELETE FROM participantes WHERE id = ?`).run(participanteId);
  }

  // ---------- llaves ----------

  partidos(torneoId: number): PartidoFila[] {
    return this.conexion
      .prepare(`SELECT * FROM partidos WHERE torneo_id = ? ORDER BY ronda ASC, posicion ASC`)
      .all(torneoId) as PartidoFila[];
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

  private guardarLlave(torneoId: number, partidos: Partido[]): void {
    const tx = this.conexion.transaction(() => {
      this.conexion.prepare(`DELETE FROM partidos WHERE torneo_id = ?`).run(torneoId);
      const insertar = this.conexion.prepare(
        `INSERT INTO partidos (torneo_id, ronda, posicion, participante_a_id, participante_b_id,
            ganador_id, score_a, score_b, best_of, estado, jugado_en)
         VALUES (@torneo_id, @ronda, @posicion, @a, @b, @ganador, @score_a, @score_b, @best_of, @estado, @jugado_en)`,
      );
      for (const p of partidos) {
        insertar.run({
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
          jugado_en: p.estado === "jugado" || p.estado === "walkover" ? new Date().toISOString() : null,
        });
      }
    });
    tx();
  }

  /**
   * Genera la llave con los participantes presentes (check-in hecho).
   * Los que no se presentaron quedan afuera: el walkover automático es peor que no armar la llave.
   */
  generarLlave(torneoId: number, random: () => number = Math.random): { ok: boolean; error?: string } {
    const torneo = this.torneo(torneoId);
    if (!torneo) return { ok: false, error: "El torneo no existe" };

    const todos = this.participantes(torneoId);
    const presentes = todos.filter((p) => p.presente === 1);
    const base = presentes.length >= 2 ? presentes : todos;
    if (base.length < 2) return { ok: false, error: "Hacen falta al menos 2 participantes" };

    let ordenados = base;
    if (torneo.siembra === "sorteo") {
      ordenados = mezclar(base, random);
    } else if (torneo.siembra === "manual") {
      ordenados = [...base].sort((a, b) => (a.siembra ?? 999) - (b.siembra ?? 999));
    } else if (torneo.siembra === "ranking") {
      const ranking = this.rankingDeTemporada(torneo.temporada_id);
      const posicion = new Map(ranking.map((f, i) => [f.jugadorId, i]));
      ordenados = [...base].sort((a, b) => {
        const ja = this.jugadoresDeParticipante(a.id)[0]?.id ?? -1;
        const jb = this.jugadoresDeParticipante(b.id)[0]?.id ?? -1;
        return (posicion.get(ja) ?? 999) - (posicion.get(jb) ?? 999);
      });
    }

    const llave = armarLlave(
      ordenados.map((p) => p.id),
      { bestOf: torneo.best_of, bestOfFinal: torneo.best_of_final },
    );
    this.guardarLlave(torneoId, llave);
    this.cambiarEstadoTorneo(torneoId, "en_juego");
    return { ok: true };
  }

  cargarResultadoPartido(
    torneoId: number,
    ronda: number,
    posicion: number,
    ganadorId: number,
    scoreA: number,
    scoreB: number,
    walkover = false,
  ): { ok: boolean; error?: string; terminado?: boolean } {
    const filas = this.partidos(torneoId);
    if (filas.length === 0) return { ok: false, error: "El torneo no tiene llave generada" };
    try {
      const nueva = cargarResultado(this.aDominio(filas), {
        ronda,
        posicion,
        ganadorId,
        scoreA,
        scoreB,
        walkover,
      });
      this.guardarLlave(torneoId, nueva);
      const total = Math.max(...nueva.map((p) => p.ronda));
      const final = nueva.find((p) => p.ronda === total && p.posicion === 0);
      const terminado = Boolean(final?.ganadorId);
      if (terminado) this.cambiarEstadoTorneo(torneoId, "finalizado");
      return { ok: true, terminado };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Error desconocido" };
    }
  }

  llaveNormalizada(torneoId: number): Partido[] {
    const filas = this.partidos(torneoId);
    if (filas.length === 0) return [];
    return normalizar(this.aDominio(filas));
  }

  puestosDeTorneo(torneoId: number): ReturnType<typeof puestos> {
    const filas = this.partidos(torneoId);
    if (filas.length === 0) return [];
    const participantes = this.participantes(torneoId)
      .filter((p) => filas.some((f) => f.participante_a_id === p.id || f.participante_b_id === p.id))
      .map((p) => p.id);
    return puestos(this.aDominio(filas), participantes);
  }

  // ---------- ranking ----------

  /** Convierte los resultados de todos los torneos finalizados de la temporada en filas de ranking. */
  resultadosDeTemporada(temporadaId: number): ResultadoTorneo[] {
    const torneos = this.torneos({ temporadaId }).filter(
      (t) => t.estado === "finalizado" || t.estado === "en_juego",
    );
    const salida: ResultadoTorneo[] = [];
    for (const torneo of torneos) {
      const puestosTorneo = this.puestosDeTorneo(torneo.id);
      for (const puesto of puestosTorneo) {
        const participante = this.participante(puesto.participanteId);
        if (!participante) continue;
        for (const jugador of this.jugadoresDeParticipante(puesto.participanteId)) {
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

  rankingDeTemporada(temporadaId: number): FilaRanking[] {
    const reglas = this.reglasDeTemporada(temporadaId);
    const resultados = this.resultadosDeTemporada(temporadaId);
    return calcularRanking(resultados, reglas);
  }

  // ---------- caja ----------

  crearMovimiento(datos: {
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
  }): number {
    const info = this.conexion
      .prepare(
        `INSERT INTO movimientos (fecha, tipo, categoria, concepto, monto_centavos, torneo_id, jugador_id, medio, referencia, creado_por)
         VALUES (@fecha, @tipo, @categoria, @concepto, @monto_centavos, @torneo_id, @jugador_id, @medio, @referencia, @creado_por)`,
      )
      .run({
        ...datos,
        torneo_id: datos.torneo_id ?? null,
        jugador_id: datos.jugador_id ?? null,
        medio: datos.medio ?? null,
        referencia: datos.referencia ?? null,
        creado_por: datos.creado_por ?? "panel",
      });
    return Number(info.lastInsertRowid);
  }

  movimientos(filtro?: { desde?: string; hasta?: string; torneoId?: number }): Array<
    Movimiento & { id: number; categoria: string; medio: string | null; referencia: string | null }
  > {
    const condiciones: string[] = [];
    const params: unknown[] = [];
    if (filtro?.desde) {
      condiciones.push("fecha >= ?");
      params.push(filtro.desde);
    }
    if (filtro?.hasta) {
      condiciones.push("fecha <= ?");
      params.push(filtro.hasta);
    }
    if (filtro?.torneoId) {
      condiciones.push("torneo_id = ?");
      params.push(filtro.torneoId);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
    const filas = this.conexion
      .prepare(`SELECT * FROM movimientos ${where} ORDER BY fecha DESC, id DESC`)
      .all(...params) as Array<{
      id: number;
      fecha: string;
      tipo: "ingreso" | "egreso";
      categoria: string;
      concepto: string;
      monto_centavos: number;
      torneo_id: number | null;
      medio: string | null;
      referencia: string | null;
    }>;
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

  borrarMovimiento(id: number): void {
    this.conexion.prepare(`DELETE FROM movimientos WHERE id = ?`).run(id);
  }

  /** ¿Ya se registró el pago del premio de este torneo? Sirve para no pagar dos veces. */
  premioPagado(torneoId: number): boolean {
    const fila = this.conexion
      .prepare(`SELECT 1 FROM movimientos WHERE torneo_id = ? AND categoria = 'premio' LIMIT 1`)
      .get(torneoId);
    return Boolean(fila);
  }
}
