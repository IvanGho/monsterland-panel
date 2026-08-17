/**
 * Repositorio: la única capa que conoce la forma de los datos.
 *
 * Trabaja sobre el almacén de documentos, así que funciona igual con Postgres o con el
 * almacén en memoria del modo demo. Las rutas nunca tocan el almacén directamente.
 *
 * Criterio de rendimiento: se traen colecciones completas y se cruzan en memoria en vez de
 * hacer una consulta por fila. A esta escala (cientos de documentos) son 3-4 viajes a la
 * base por página en total, en lugar de decenas.
 */
import { almacen } from "../almacen/index.js";
import { armarLlave, cargarResultado, mezclar, normalizar, puestos } from "../dominio/llave.js";
import { calcularRanking, reglasDesde, REGLAS_POR_DEFECTO } from "../dominio/ranking.js";

export const COLECCIONES = {
  jugadores: "jugadores",
  temporadas: "temporadas",
  pases: "pases",
  torneos: "torneos",
  participantes: "participantes",
  partidos: "partidos",
  movimientos: "movimientos",
  auditoria: "auditoria",
};

export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ahoraISO() {
  return new Date().toISOString();
}

/** Abre el repositorio sobre el almacén configurado. */
export async function abrirRepo() {
  return crearRepo(await almacen());
}

export function crearRepo(base) {
  const repo = {
    base,

    // ---------------- auditoría ----------------

    async registrar(actor, accion, detalle = "") {
      await base.crear(COLECCIONES.auditoria, {
        actor,
        accion,
        detalle,
        creadoEn: ahoraISO(),
      });
    },

    async ultimaAuditoria(limite = 20) {
      const todo = await base.listar(COLECCIONES.auditoria);
      return todo.reverse().slice(0, limite);
    },

    // ---------------- jugadores ----------------

    async jugadores() {
      const lista = await base.listar(COLECCIONES.jugadores);
      return lista.sort((a, b) => {
        if (a.baneado !== b.baneado) return a.baneado ? 1 : -1;
        return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      });
    },

    jugador(id) {
      return base.obtener(COLECCIONES.jugadores, id);
    },

    async crearJugador(datos) {
      const existentes = await base.listar(COLECCIONES.jugadores);
      // El id de Discord es la identidad real de la persona: si se duplica, terminás con
      // dos fichas de la misma persona y el ranking se parte en dos.
      if (datos.discordId && existentes.some((j) => j.discordId === datos.discordId)) {
        throw new Error("DISCORD_ID_DUPLICADO");
      }
      return base.crear(COLECCIONES.jugadores, {
        discordId: datos.discordId ?? "",
        discordTag: datos.discordTag ?? "",
        nombre: datos.nombre,
        riotId: datos.riotId ?? null,
        aliasPago: datos.aliasPago ?? null,
        mayorEdad: Boolean(datos.mayorEdad),
        notas: datos.notas ?? null,
        baneado: Boolean(datos.baneado),
        creadoEn: ahoraISO(),
      });
    },

    actualizarJugador(id, cambios) {
      return base.actualizar(COLECCIONES.jugadores, id, cambios);
    },

    // ---------------- temporadas ----------------

    async temporadas() {
      const lista = await base.listar(COLECCIONES.temporadas);
      return lista.sort((a, b) => String(b.desdeFecha).localeCompare(String(a.desdeFecha)));
    },

    temporada(id) {
      return base.obtener(COLECCIONES.temporadas, id);
    },

    async temporadaActiva() {
      return (await repo.temporadas()).find((t) => t.estado === "activa");
    },

    crearTemporada(datos) {
      return base.crear(COLECCIONES.temporadas, {
        nombre: datos.nombre,
        desdeFecha: datos.desdeFecha,
        hastaFecha: datos.hastaFecha,
        estado: datos.estado ?? "activa",
        premioFinalCentavos: datos.premioFinalCentavos ?? 0,
        reglas: reglasDesde(datos.reglas),
        creadoEn: ahoraISO(),
      });
    },

    cerrarTemporada(id) {
      return base.actualizar(COLECCIONES.temporadas, id, { estado: "cerrada" });
    },

    async reglasDeTemporada(id) {
      const temporada = await repo.temporada(id);
      return temporada ? reglasDesde(temporada.reglas) : REGLAS_POR_DEFECTO;
    },

    // ---------------- pases ----------------

    pases() {
      return base.listar(COLECCIONES.pases);
    },

    async pasesDeTemporada(temporadaId) {
      const [pases, jugadores] = await Promise.all([repo.pases(), repo.jugadores()]);
      const nombres = new Map(jugadores.map((j) => [j.id, j.nombre]));
      return pases
        .filter((p) => p.temporadaId === Number(temporadaId))
        .map((p) => ({ ...p, nombre: nombres.get(p.jugadorId) ?? "?" }))
        .sort((a, b) => String(b.hastaFecha).localeCompare(String(a.hastaFecha)));
    },

    /** Todos los jugadores con pase vigente hoy, en una sola pasada. */
    async jugadoresConPaseActivo(fecha = hoyISO()) {
      const pases = await repo.pases();
      return new Set(
        pases.filter((p) => p.desdeFecha <= fecha && fecha <= p.hastaFecha).map((p) => p.jugadorId),
      );
    },

    async crearPase(datos) {
      const pase = await base.crear(COLECCIONES.pases, {
        jugadorId: Number(datos.jugadorId),
        temporadaId: Number(datos.temporadaId),
        nivel: datos.nivel,
        precioCentavos: datos.precioCentavos,
        desdeFecha: datos.desdeFecha,
        hastaFecha: datos.hastaFecha,
        medioPago: datos.medioPago ?? null,
        referenciaPago: datos.referenciaPago ?? null,
        creadoEn: ahoraISO(),
      });
      // El pase entra a la caja automáticamente: si no, la caja miente.
      await repo.crearMovimiento({
        fecha: hoyISO(),
        tipo: "ingreso",
        categoria: "pase",
        concepto: `Pase ${datos.nivel}`,
        montoCentavos: datos.precioCentavos,
        jugadorId: Number(datos.jugadorId),
        medio: datos.medioPago ?? null,
        referencia: datos.referenciaPago ?? null,
        creadoPor: "panel",
      });
      return pase;
    },

    // ---------------- torneos ----------------

    async torneos(filtro = {}) {
      let lista = await base.listar(COLECCIONES.torneos);
      if (filtro.temporadaId) lista = lista.filter((t) => t.temporadaId === Number(filtro.temporadaId));
      if (filtro.estado) lista = lista.filter((t) => t.estado === filtro.estado);
      return lista.sort((a, b) => String(b.empiezaEn).localeCompare(String(a.empiezaEn)));
    },

    torneo(id) {
      return base.obtener(COLECCIONES.torneos, id);
    },

    crearTorneo(datos) {
      return base.crear(COLECCIONES.torneos, {
        temporadaId: Number(datos.temporadaId),
        nombre: datos.nombre,
        juego: datos.juego,
        formato: datos.formato,
        cupo: datos.cupo,
        minimoParticipantes: datos.minimoParticipantes,
        empiezaEn: datos.empiezaEn,
        inscripcionCentavos: datos.inscripcionCentavos ?? 0,
        premioCentavos: datos.premioCentavos ?? 0,
        premioTipo: datos.premioTipo ?? "gift_card",
        premioDescripcion: datos.premioDescripcion ?? null,
        bestOf: datos.bestOf ?? 1,
        bestOfFinal: datos.bestOfFinal ?? 3,
        siembra: datos.siembra ?? "sorteo",
        estado: datos.estado ?? "borrador",
        creadoEn: ahoraISO(),
      });
    },

    cambiarEstadoTorneo(id, estado) {
      return base.actualizar(COLECCIONES.torneos, id, { estado });
    },

    // ---------------- participantes ----------------

    async participantes(torneoId) {
      const lista = await base.listarDonde(COLECCIONES.participantes, "torneoId", Number(torneoId));
      return lista.sort((a, b) => a.id - b.id);
    },

    participante(id) {
      return base.obtener(COLECCIONES.participantes, id);
    },

    /**
     * Los jugadores de cada participante. Los ids vienen embebidos en el participante, así
     * que alcanza con traer la colección de jugadores una vez y cruzar en memoria.
     */
    async jugadoresPorParticipante(torneoId) {
      const [participantes, jugadores] = await Promise.all([
        repo.participantes(torneoId),
        repo.jugadores(),
      ]);
      const porId = new Map(jugadores.map((j) => [j.id, j]));
      const mapa = new Map();
      for (const p of participantes) {
        mapa.set(
          p.id,
          (p.jugadorIds ?? []).map((id) => porId.get(id)).filter(Boolean),
        );
      }
      return mapa;
    },

    async inscribir(datos) {
      const jugadorIds = (datos.jugadorIds ?? []).map(Number).filter(Number.isInteger);
      return base.enTransaccion(async (tx) => {
        const repoTx = crearRepo(tx);
        const participante = await tx.crear(COLECCIONES.participantes, {
          torneoId: Number(datos.torneoId),
          nombre: datos.nombre,
          jugadorIds,
          pagoOk: Boolean(datos.pagoOk),
          medioPago: datos.medioPago ?? null,
          referenciaPago: datos.referenciaPago ?? null,
          cubiertoPorPase: Boolean(datos.cubiertoPorPase),
          presente: false,
          siembra: datos.siembra ?? null,
          creadoEn: ahoraISO(),
        });

        if (datos.pagoOk && !datos.cubiertoPorPase && datos.inscripcionCentavos > 0) {
          await repoTx.crearMovimiento({
            fecha: hoyISO(),
            tipo: "ingreso",
            categoria: "inscripcion",
            concepto: `Inscripción ${datos.nombre}`,
            montoCentavos: datos.inscripcionCentavos,
            torneoId: Number(datos.torneoId),
            jugadorId: jugadorIds[0] ?? null,
            medio: datos.medioPago ?? null,
            referencia: datos.referenciaPago ?? null,
            creadoPor: "panel",
          });
        }
        return participante;
      });
    },

    /**
     * Marca (o desmarca) el pago. Sólo registra el ingreso en la caja cuando el participante
     * pasa de impago a pago: si no, volver a apretar el botón duplicaría la plata.
     */
    async marcarPago(participanteId, pago, medio, referencia) {
      const participante = await repo.participante(participanteId);
      if (!participante) return;

      const eraImpago = !participante.pagoOk;
      await base.actualizar(COLECCIONES.participantes, participanteId, {
        pagoOk: Boolean(pago),
        medioPago: medio ?? participante.medioPago ?? null,
        referenciaPago: referencia ?? participante.referenciaPago ?? null,
      });

      if (!pago || !eraImpago || participante.cubiertoPorPase) return;

      const torneo = await repo.torneo(participante.torneoId);
      if (!torneo || torneo.inscripcionCentavos <= 0) return;
      await repo.crearMovimiento({
        fecha: hoyISO(),
        tipo: "ingreso",
        categoria: "inscripcion",
        concepto: `Inscripción ${participante.nombre}`,
        montoCentavos: torneo.inscripcionCentavos,
        torneoId: torneo.id,
        jugadorId: participante.jugadorIds?.[0] ?? null,
        medio: medio ?? null,
        referencia: referencia ?? null,
        creadoPor: "panel",
      });
    },

    marcarPresente(participanteId, presente) {
      return base.actualizar(COLECCIONES.participantes, participanteId, {
        presente: Boolean(presente),
      });
    },

    /**
     * Borra un participante y lo saca de la llave si ya estaba sorteada. Sin esto quedarían
     * partidos apuntando a un participante que no existe, y el cuadro mostraría "?".
     */
    async eliminarParticipante(participanteId) {
      const participante = await repo.participante(participanteId);
      if (!participante) return;
      await base.borrar(COLECCIONES.participantes, participanteId);

      const partidos = await repo.partidos(participante.torneoId);
      const afectados = partidos.filter(
        (p) =>
          p.a === participante.id || p.b === participante.id || p.ganadorId === participante.id,
      );
      if (afectados.length === 0) return;

      const limpios = partidos.map((p) => ({
        ...p,
        a: p.a === participante.id ? null : p.a,
        b: p.b === participante.id ? null : p.b,
        ganadorId: p.ganadorId === participante.id ? null : p.ganadorId,
        estado: p.ganadorId === participante.id ? "pendiente" : p.estado,
      }));
      await repo.guardarLlave(participante.torneoId, limpios);
    },

    // ---------------- llave ----------------

    async partidos(torneoId) {
      const lista = await base.listarDonde(COLECCIONES.partidos, "torneoId", Number(torneoId));
      return lista.sort((a, b) => a.ronda - b.ronda || a.posicion - b.posicion);
    },

    /** Reescribe la llave completa de forma atómica. */
    async guardarLlave(torneoId, partidos) {
      const documentos = partidos.map((p) => ({
        torneoId: Number(torneoId),
        ronda: p.ronda,
        posicion: p.posicion,
        a: p.a ?? null,
        b: p.b ?? null,
        ganadorId: p.ganadorId ?? null,
        scoreA: p.scoreA ?? 0,
        scoreB: p.scoreB ?? 0,
        bestOf: p.bestOf,
        estado: p.estado,
        jugadoEn: p.estado === "jugado" || p.estado === "walkover" ? ahoraISO() : null,
      }));
      await base.reemplazarDonde(COLECCIONES.partidos, "torneoId", Number(torneoId), documentos);
    },

    /**
     * Genera la llave con los participantes presentes (check-in hecho).
     * Los que no se presentaron quedan afuera: el walkover automático es peor que no armar
     * la llave, porque premia al que no avisó que no venía.
     */
    async generarLlave(torneoId, random = Math.random) {
      const torneo = await repo.torneo(torneoId);
      if (!torneo) return { ok: false, error: "El torneo no existe" };

      const todos = await repo.participantes(torneoId);
      const presentes = todos.filter((p) => p.presente);
      const base_ = presentes.length >= 2 ? presentes : todos;
      if (base_.length < 2) return { ok: false, error: "Hacen falta al menos 2 participantes" };

      let ordenados = base_;
      if (torneo.siembra === "sorteo") {
        ordenados = mezclar(base_, random);
      } else if (torneo.siembra === "manual") {
        ordenados = [...base_].sort((a, b) => (a.siembra ?? 999) - (b.siembra ?? 999));
      } else if (torneo.siembra === "ranking") {
        const ranking = await repo.rankingDeTemporada(torneo.temporadaId);
        const posicion = new Map(ranking.map((f, i) => [f.jugadorId, i]));
        ordenados = [...base_].sort((a, b) => {
          const ja = a.jugadorIds?.[0] ?? -1;
          const jb = b.jugadorIds?.[0] ?? -1;
          return (posicion.get(ja) ?? 999) - (posicion.get(jb) ?? 999);
        });
      }

      const llave = armarLlave(
        ordenados.map((p) => p.id),
        { bestOf: torneo.bestOf, bestOfFinal: torneo.bestOfFinal },
      );
      await repo.guardarLlave(torneoId, llave);
      await repo.cambiarEstadoTorneo(torneoId, "en_juego");
      return { ok: true };
    },

    async cargarResultadoPartido(torneoId, ronda, posicion, ganadorId, scoreA, scoreB, walkover = false) {
      const filas = await repo.partidos(torneoId);
      if (filas.length === 0) return { ok: false, error: "El torneo no tiene llave generada" };

      let nueva;
      try {
        // Sólo el cálculo va en el try: si fallara una escritura, no queremos reportarla
        // como "resultado rechazado", que mandaría al mod a corregir un score que estaba bien.
        nueva = cargarResultado(filas, { ronda, posicion, ganadorId, scoreA, scoreB, walkover });
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Error desconocido" };
      }

      await repo.guardarLlave(torneoId, nueva);
      const total = Math.max(...nueva.map((p) => p.ronda));
      const final = nueva.find((p) => p.ronda === total && p.posicion === 0);
      const terminado = Boolean(final?.ganadorId);
      if (terminado) await repo.cambiarEstadoTorneo(torneoId, "finalizado");
      return { ok: true, terminado };
    },

    async llaveNormalizada(torneoId) {
      const filas = await repo.partidos(torneoId);
      return filas.length === 0 ? [] : normalizar(filas);
    },

    async puestosDeTorneo(torneoId) {
      const filas = await repo.partidos(torneoId);
      if (filas.length === 0) return [];
      const participantes = (await repo.participantes(torneoId))
        .filter((p) => filas.some((f) => f.a === p.id || f.b === p.id))
        .map((p) => p.id);
      return puestos(filas, participantes);
    },

    // ---------------- ranking ----------------

    async resultadosDeTemporada(temporadaId) {
      const torneos = (await repo.torneos({ temporadaId })).filter(
        (t) => t.estado === "finalizado" || t.estado === "en_juego",
      );
      const salida = [];
      for (const torneo of torneos) {
        const [puestosTorneo, participantes] = await Promise.all([
          repo.puestosDeTorneo(torneo.id),
          repo.participantes(torneo.id),
        ]);
        const porId = new Map(participantes.map((p) => [p.id, p]));
        for (const puesto of puestosTorneo) {
          const participante = porId.get(puesto.participanteId);
          if (!participante) continue;
          // En 2v2/3v3 el resultado del equipo se acredita a cada integrante.
          for (const jugadorId of participante.jugadorIds ?? []) {
            salida.push({
              torneoId: torneo.id,
              jugadorId,
              puesto: puesto.puesto,
              victorias: puesto.victorias,
              partidosJugados: puesto.partidosJugados,
              sePresento: participante.presente || puesto.partidosJugados > 0,
            });
          }
        }
      }
      return salida;
    },

    async rankingDeTemporada(temporadaId) {
      const [reglas, resultados] = await Promise.all([
        repo.reglasDeTemporada(temporadaId),
        repo.resultadosDeTemporada(temporadaId),
      ]);
      return calcularRanking(resultados, reglas);
    },

    // ---------------- caja ----------------

    crearMovimiento(datos) {
      return base.crear(COLECCIONES.movimientos, {
        fecha: datos.fecha ?? hoyISO(),
        tipo: datos.tipo,
        categoria: datos.categoria ?? "otro",
        concepto: datos.concepto ?? "",
        montoCentavos: datos.montoCentavos ?? 0,
        torneoId: datos.torneoId ?? null,
        jugadorId: datos.jugadorId ?? null,
        medio: datos.medio ?? null,
        referencia: datos.referencia ?? null,
        creadoPor: datos.creadoPor ?? "panel",
        creadoEn: ahoraISO(),
      });
    },

    async movimientos(filtro = {}) {
      let lista = await base.listar(COLECCIONES.movimientos);
      if (filtro.desde) lista = lista.filter((m) => m.fecha >= filtro.desde);
      if (filtro.hasta) lista = lista.filter((m) => m.fecha <= filtro.hasta);
      if (filtro.torneoId) lista = lista.filter((m) => m.torneoId === Number(filtro.torneoId));
      return lista.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id);
    },

    borrarMovimiento(id) {
      return base.borrar(COLECCIONES.movimientos, id);
    },

    /** ¿Ya se registró el pago del premio de este torneo? Sirve para no pagar dos veces. */
    async premioPagado(torneoId) {
      const lista = await base.listarDonde(COLECCIONES.movimientos, "torneoId", Number(torneoId));
      return lista.some((m) => m.categoria === "premio");
    },
  };

  return repo;
}
