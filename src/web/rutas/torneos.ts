import { Router } from "express";
import { z } from "zod";
import { hoyISO } from "../../db/index.js";
import { abrirRepo } from "../../db/repo.js";
import { llaveTerminada, nombreDeRonda } from "../../domain/bracket.js";
import { alertasDeTorneo } from "../../domain/caja.js";
import { validarInscripcion } from "../../domain/elegibilidad.js";
import { formatoARS, pesosACentavos } from "../../domain/money.js";
import { requiereAdmin, requiereLogin } from "../auth.js";
import {
  anuncioDeInscripcion,
  anuncioDeLlave,
  anuncioDeRanking,
  anuncioDeResultado,
  recordatorioDeCheckIn,
} from "../discord.js";
import { alerta, esc, etiquetaEstado, layout } from "../layout.js";

export const rutasTorneos = Router();
rutasTorneos.use(requiereLogin);

const esquemaTorneo = z.object({
  nombre: z.string().min(3).max(120),
  juego: z.enum(["valorant", "truco", "cs"]),
  formato: z.enum(["1v1", "2v2", "3v3"]),
  cupo: z.coerce.number().int().min(2).max(128),
  minimo_participantes: z.coerce.number().int().min(2).max(128),
  empieza_en: z.string().min(10),
  inscripcion: z.string().default("0"),
  premio: z.string().default("0"),
  premio_tipo: z.enum(["gift_card", "especie", "efectivo"]),
  premio_descripcion: z.string().max(200).optional(),
  best_of: z.coerce.number().int().min(1).max(9),
  best_of_final: z.coerce.number().int().min(1).max(9),
  siembra: z.enum(["sorteo", "ranking", "manual"]),
});

rutasTorneos.get("/", async (req, res) => {
  const repo = await abrirRepo();
  const temporada = await repo.temporadaActiva();
  const torneos = await repo.torneos(temporada ? { temporadaId: temporada.id } : undefined);

  const cantidades = new Map(
    await Promise.all(
      torneos.map(
        async (t) => [t.id, (await repo.participantes(t.id)).length] as [number, number],
      ),
    ),
  );

  const filas = torneos
    .map(
      (t) => `<tr>
        <td><a href="/torneos/${t.id}">${esc(t.nombre)}</a></td>
        <td>${esc(t.juego)} ${esc(t.formato)}</td>
        <td class="mono">${esc(t.empieza_en.replace("T", " "))}</td>
        <td>${cantidades.get(t.id) ?? 0}/${t.cupo}</td>
        <td>${formatoARS(t.inscripcion_centavos)}</td>
        <td>${formatoARS(t.premio_centavos)}</td>
        <td>${etiquetaEstado(t.estado)}</td>
      </tr>`,
    )
    .join("");

  res.send(
    layout(
      `<h1>Torneos</h1>
      <p class="sub">${temporada ? `Temporada ${esc(temporada.nombre)}` : "Sin temporada activa"}</p>
      <p><a class="boton" href="/torneos/nuevo">Crear torneo</a></p>
      <div class="tarjeta">
        ${
          filas
            ? `<table><thead><tr><th>Nombre</th><th>Juego</th><th>Arranca</th><th>Inscriptos</th><th>Inscripción</th><th>Premio</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table>`
            : `<p class="tenue">No hay torneos todavía.</p>`
        }
      </div>`,
      { titulo: "Torneos", rol: req.rol, activo: "torneos" },
    ),
  );
});

rutasTorneos.get("/nuevo", async (req, res) => {
  const repo = await abrirRepo();
  const temporada = await repo.temporadaActiva();
  if (!temporada) {
    res.send(
      layout(
        `<h1>Crear torneo</h1>${alerta("grave", "Primero creá una temporada activa en la sección Temporadas.")}`,
        { titulo: "Crear torneo", rol: req.rol, activo: "torneos" },
      ),
    );
    return;
  }

  res.send(
    layout(
      `<h1>Crear torneo</h1>
      <p class="sub">El premio se define acá, antes de abrir la inscripción. Después no se toca.</p>
      <form method="post" action="/torneos" class="tarjeta">
        <div class="fila">
          <div><label>Nombre</label><input name="nombre" required placeholder="Kripta Valorant 1v1 — Semana 1"></div>
          <div><label>Juego</label><select name="juego"><option value="valorant">Valorant</option><option value="truco">Truco</option><option value="cs">CS</option></select></div>
          <div><label>Formato</label><select name="formato"><option value="1v1">1v1</option><option value="2v2">2v2</option><option value="3v3">3v3</option></select></div>
        </div>
        <div class="fila">
          <div><label>Cupo</label><input name="cupo" type="number" value="8" min="2" max="128"></div>
          <div><label>Mínimo para jugarse</label><input name="minimo_participantes" type="number" value="6" min="2"></div>
          <div><label>Arranca (fecha y hora)</label><input name="empieza_en" type="datetime-local" required></div>
        </div>
        <div class="fila">
          <div><label>Inscripción ($ ARS, 0 = Pista Libre)</label><input name="inscripcion" value="0"></div>
          <div><label>Premio fijo ($ ARS)</label><input name="premio" value="0"></div>
          <div><label>Tipo de premio</label><select name="premio_tipo">
            <option value="gift_card">Gift card</option><option value="especie">En especie</option><option value="efectivo">Efectivo</option>
          </select></div>
        </div>
        <div class="fila">
          <div><label>Detalle del premio</label><input name="premio_descripcion" placeholder="Gift card Steam / VP"></div>
          <div><label>BO rondas</label><input name="best_of" type="number" value="1" min="1" max="9"></div>
          <div><label>BO final</label><input name="best_of_final" type="number" value="3" min="1" max="9"></div>
          <div><label>Siembra</label><select name="siembra">
            <option value="sorteo">Sorteo</option><option value="ranking">Por ranking</option><option value="manual">Manual</option>
          </select></div>
        </div>
        <div style="margin-top:16px"><button type="submit">Crear en borrador</button></div>
      </form>`,
      { titulo: "Crear torneo", rol: req.rol, activo: "torneos" },
    ),
  );
});

rutasTorneos.post("/", async (req, res) => {
  const repo = await abrirRepo();
  const temporada = await repo.temporadaActiva();
  if (!temporada) {
    res.status(400).send("No hay temporada activa.");
    return;
  }
  const parseo = esquemaTorneo.safeParse(req.body);
  if (!parseo.success) {
    res
      .status(400)
      .send(
        `Datos inválidos: ${parseo.error.issues.map((i) => i.path.join(".") + " " + i.message).join(", ")}`,
      );
    return;
  }
  const datos = parseo.data;
  const id = await repo.crearTorneo({
    temporada_id: temporada.id,
    nombre: datos.nombre,
    juego: datos.juego,
    formato: datos.formato,
    cupo: datos.cupo,
    minimo_participantes: datos.minimo_participantes,
    empieza_en: datos.empieza_en,
    inscripcion_centavos: pesosACentavos(datos.inscripcion),
    premio_centavos: pesosACentavos(datos.premio),
    premio_tipo: datos.premio_tipo,
    premio_descripcion: datos.premio_descripcion ?? null,
    best_of: datos.best_of,
    best_of_final: datos.best_of_final,
    siembra: datos.siembra,
  });
  await repo.registrar(req.rol ?? "?", "crear_torneo", `${datos.nombre} (#${id})`);
  res.redirect(`/torneos/${id}`);
});

rutasTorneos.post("/:id/estado", async (req, res) => {
  const repo = await abrirRepo();
  const id = Number(req.params.id);
  const estado = String(req.body?.estado ?? "");
  const permitidos = ["borrador", "inscripcion", "en_juego", "finalizado", "cancelado"];
  if (!permitidos.includes(estado)) {
    res.status(400).send("Estado inválido");
    return;
  }
  await repo.cambiarEstadoTorneo(id, estado);
  await repo.registrar(req.rol ?? "?", "cambiar_estado_torneo", `#${id} → ${estado}`);
  res.redirect(`/torneos/${id}`);
});

rutasTorneos.post("/:id/inscribir", async (req, res) => {
  const repo = await abrirRepo();
  const torneoId = Number(req.params.id);
  const torneo = await repo.torneo(torneoId);
  if (!torneo) {
    res.status(404).send("Torneo inexistente");
    return;
  }

  const jugadorIds: number[] = (
    Array.isArray(req.body?.jugador_id) ? req.body.jugador_id : [req.body?.jugador_id]
  )
    .filter(Boolean)
    .map((v: unknown) => Number(v))
    .filter((n: number) => Number.isInteger(n) && n > 0);

  if (jugadorIds.length === 0) {
    res.status(400).send("Elegí al menos un jugador");
    return;
  }

  const [participantesActuales, todosLosJugadores, conPase] = await Promise.all([
    repo.participantes(torneoId),
    repo.jugadores(),
    repo.jugadoresConPaseActivo(),
  ]);
  const jugadoresPorId = new Map(todosLosJugadores.map((j) => [j.id, j]));

  const motivos: string[] = [];
  let algunoConPase = false;

  for (const jugadorId of jugadorIds) {
    const jugador = jugadoresPorId.get(jugadorId);
    if (!jugador) {
      motivos.push(`Jugador ${jugadorId} inexistente`);
      continue;
    }
    const tienePase = conPase.has(jugadorId);
    if (tienePase) algunoConPase = true;
    const veredicto = validarInscripcion(
      {
        id: jugador.id,
        nombre: jugador.nombre,
        mayorEdad: jugador.mayor_edad === 1,
        baneado: jugador.baneado === 1,
      },
      {
        inscripcionCentavos: torneo.inscripcion_centavos,
        premioCentavos: torneo.premio_centavos,
        premioTipo: torneo.premio_tipo,
        cupo: torneo.cupo,
        estado: torneo.estado,
      },
      {
        participantesActuales: participantesActuales.length,
        tienePaseActivo: tienePase,
        pagoConfirmado: req.body?.pago_ok === "on",
      },
    );
    if (!veredicto.puede) motivos.push(`${jugador.nombre}: ${veredicto.motivos.join(" ")}`);
  }

  if (motivos.length > 0) {
    res.status(400).send(
      layout(
        `<h1>No se pudo inscribir</h1>${motivos.map((m) => alerta("grave", m)).join("")}
         <p><a class="boton secundario" href="/torneos/${torneoId}">Volver</a></p>`,
        { titulo: "Inscripción rechazada", rol: req.rol, activo: "torneos" },
      ),
    );
    return;
  }

  const nombres = jugadorIds.map((id) => jugadoresPorId.get(id)?.nombre ?? "?");
  const nombreEquipo = String(req.body?.nombre_equipo ?? "").trim() || nombres.join(" + ");

  await repo.inscribir({
    torneo_id: torneoId,
    nombre: nombreEquipo,
    jugadorIds,
    pago_ok: req.body?.pago_ok === "on" || algunoConPase,
    cubierto_por_pase: algunoConPase,
    medio_pago: String(req.body?.medio_pago ?? "") || null,
    referencia_pago: String(req.body?.referencia_pago ?? "") || null,
    inscripcion_centavos: torneo.inscripcion_centavos,
  });
  await repo.registrar(req.rol ?? "?", "inscribir", `${nombreEquipo} en #${torneoId}`);
  res.redirect(`/torneos/${torneoId}`);
});

rutasTorneos.post("/:id/participante/:pid/pago", async (req, res) => {
  const repo = await abrirRepo();
  await repo.marcarPago(
    Number(req.params.pid),
    req.body?.pago === "1",
    String(req.body?.medio_pago ?? "") || undefined,
    String(req.body?.referencia ?? "") || undefined,
  );
  await repo.registrar(req.rol ?? "?", "marcar_pago", `participante ${req.params.pid}`);
  res.redirect(`/torneos/${req.params.id}`);
});

rutasTorneos.post("/:id/participante/:pid/checkin", async (req, res) => {
  const repo = await abrirRepo();
  await repo.marcarPresente(Number(req.params.pid), req.body?.presente === "1");
  res.redirect(`/torneos/${req.params.id}`);
});

rutasTorneos.post("/:id/participante/:pid/borrar", async (req, res) => {
  const repo = await abrirRepo();
  await repo.eliminarParticipante(Number(req.params.pid));
  await repo.registrar(req.rol ?? "?", "borrar_participante", `participante ${req.params.pid}`);
  res.redirect(`/torneos/${req.params.id}`);
});

rutasTorneos.post("/:id/llave", async (req, res) => {
  const repo = await abrirRepo();
  const torneoId = Number(req.params.id);
  const resultado = await repo.generarLlave(torneoId);
  if (!resultado.ok) {
    res.status(400).send(
      layout(
        `<h1>No se pudo armar la llave</h1>${alerta("grave", resultado.error ?? "")}<p><a class="boton secundario" href="/torneos/${torneoId}">Volver</a></p>`,
        { titulo: "Error", rol: req.rol, activo: "torneos" },
      ),
    );
    return;
  }
  await repo.registrar(req.rol ?? "?", "generar_llave", `#${torneoId}`);
  res.redirect(`/torneos/${torneoId}`);
});

rutasTorneos.post("/:id/resultado", async (req, res) => {
  const repo = await abrirRepo();
  const torneoId = Number(req.params.id);
  const ronda = Number(req.body?.ronda);
  const posicion = Number(req.body?.posicion);
  const ganadorId = Number(req.body?.ganador_id);
  const scoreA = Number(req.body?.score_a ?? 0);
  const scoreB = Number(req.body?.score_b ?? 0);
  const walkover = req.body?.walkover === "on";

  const resultado = await repo.cargarResultadoPartido(
    torneoId,
    ronda,
    posicion,
    ganadorId,
    scoreA,
    scoreB,
    walkover,
  );
  if (!resultado.ok) {
    res.status(400).send(
      layout(
        `<h1>Resultado rechazado</h1>${alerta("grave", resultado.error ?? "")}<p><a class="boton secundario" href="/torneos/${torneoId}">Volver</a></p>`,
        { titulo: "Error", rol: req.rol, activo: "torneos" },
      ),
    );
    return;
  }
  await repo.registrar(req.rol ?? "?", "cargar_resultado", `#${torneoId} R${ronda}P${posicion}`);
  res.redirect(`/torneos/${torneoId}`);
});

rutasTorneos.post("/:id/pagar-premio", requiereAdmin, async (req, res) => {
  const repo = await abrirRepo();
  const torneoId = Number(req.params.id);
  const torneo = await repo.torneo(torneoId);
  if (!torneo) {
    res.status(404).send("Torneo inexistente");
    return;
  }
  if (await repo.premioPagado(torneoId)) {
    res.status(400).send("El premio de este torneo ya figura pagado en la caja.");
    return;
  }
  const jugadorId = Number(req.body?.jugador_id) || null;
  await repo.crearMovimiento({
    fecha: hoyISO(),
    tipo: "egreso",
    categoria: "premio",
    concepto: `Premio ${torneo.nombre}`,
    monto_centavos: torneo.premio_centavos,
    torneo_id: torneoId,
    jugador_id: jugadorId,
    medio: String(req.body?.medio ?? "") || null,
    referencia: String(req.body?.referencia ?? "") || null,
    creado_por: req.rol ?? "admin",
  });
  await repo.registrar(req.rol ?? "?", "pagar_premio", `#${torneoId}`);
  res.redirect(`/torneos/${torneoId}`);
});

rutasTorneos.get("/:id", async (req, res) => {
  const repo = await abrirRepo();
  const torneoId = Number(req.params.id);
  const torneo = await repo.torneo(torneoId);
  if (!torneo) {
    res.status(404).send("Torneo inexistente");
    return;
  }

  // Todo lo que hace falta para la ficha, en paralelo y sin una consulta por fila.
  const [participantes, jugadores, llave, puestos, jugadoresPorParticipante, conPase, premioYaPagado] =
    await Promise.all([
      repo.participantes(torneoId),
      repo.jugadores(),
      repo.llaveNormalizada(torneoId),
      repo.puestosDeTorneo(torneoId),
      repo.jugadoresPorParticipante(torneoId),
      repo.jugadoresConPaseActivo(),
      repo.premioPagado(torneoId),
    ]);

  const nombrePor = new Map(participantes.map((p) => [p.id, p.nombre]));
  const rondas = llave.length ? Math.max(...llave.map((p) => p.ronda)) : 0;
  const pagos = participantes.filter((p) => p.pago_ok === 1 || p.cubierto_por_pase === 1).length;

  const alertas = alertasDeTorneo({
    inscripcionCentavos: torneo.inscripcion_centavos,
    premioCentavos: torneo.premio_centavos,
    participantesPagos: pagos,
    participantesTotales: participantes.length,
    minimoParticipantes: torneo.minimo_participantes,
    estado: torneo.estado,
  })
    .map((a) => alerta(a.nivel, a.mensaje))
    .join("");

  const filasParticipantes = participantes
    .map((p) => {
      const jugadoresDe = jugadoresPorParticipante.get(p.id) ?? [];
      const sinMayoria = jugadoresDe.some((j) => j.mayor_edad !== 1);
      return `<tr>
        <td>${esc(p.nombre)}
          <div class="tenue" style="font-size:12px">${jugadoresDe.map((j) => esc(j.discord_tag)).join(", ")}${sinMayoria ? ' <span style="color:var(--grave)">· sin 18+ confirmado</span>' : ""}</div>
        </td>
        <td>${p.cubierto_por_pase ? '<span class="pill">Pase</span>' : p.pago_ok ? '<span class="pill">Pagó</span>' : '<span class="pill" style="color:var(--alerta)">Impago</span>'}</td>
        <td>${p.presente ? '<span class="pill" style="color:var(--ok)">presente</span>' : '<span class="tenue">falta</span>'}</td>
        <td>
          <form class="inline" method="post" action="/torneos/${torneoId}/participante/${p.id}/checkin">
            <input type="hidden" name="presente" value="${p.presente ? "0" : "1"}">
            <button class="secundario chico" type="submit">${p.presente ? "Quitar check-in" : "Check-in"}</button>
          </form>
          ${
            p.cubierto_por_pase
              ? ""
              : `<form class="inline" method="post" action="/torneos/${torneoId}/participante/${p.id}/pago">
                  <input type="hidden" name="pago" value="${p.pago_ok ? "0" : "1"}">
                  <button class="secundario chico" type="submit">${p.pago_ok ? "Marcar impago" : "Marcar pago"}</button>
                </form>`
          }
          <form class="inline" method="post" action="/torneos/${torneoId}/participante/${p.id}/borrar" onsubmit="return confirm('¿Borrar a ${esc(p.nombre)}?')">
            <button class="peligro chico" type="submit">Borrar</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  const columnasLlave = Array.from({ length: rondas }, (_, indice) => {
    const ronda = indice + 1;
    const partidosDeRonda = llave.filter((p) => p.ronda === ronda);
    const tarjetas = partidosDeRonda
      .map((partido) => {
        const nombreA = partido.a ? (nombrePor.get(partido.a) ?? "?") : "libre";
        const nombreB = partido.b ? (nombrePor.get(partido.b) ?? "?") : "libre";
        const ganaA = partido.ganadorId !== null && partido.ganadorId === partido.a;
        const ganaB = partido.ganadorId !== null && partido.ganadorId === partido.b;
        const cargable = partido.a !== null && partido.b !== null;
        return `<div class="partido">
          <div class="lado ${ganaA ? "gana" : ""} ${partido.a === null ? "vacio" : ""}"><span>${esc(nombreA)}</span><span class="mono">${partido.scoreA}</span></div>
          <div class="lado ${ganaB ? "gana" : ""} ${partido.b === null ? "vacio" : ""}"><span>${esc(nombreB)}</span><span class="mono">${partido.scoreB}</span></div>
          ${
            cargable
              ? `<form method="post" action="/torneos/${torneoId}/resultado" style="margin-top:8px">
                  <input type="hidden" name="ronda" value="${partido.ronda}">
                  <input type="hidden" name="posicion" value="${partido.posicion}">
                  <div style="display:flex;gap:6px;align-items:center">
                    <input name="score_a" type="number" min="0" max="9" value="${partido.scoreA}" style="width:52px" title="${esc(nombreA)}">
                    <input name="score_b" type="number" min="0" max="9" value="${partido.scoreB}" style="width:52px" title="${esc(nombreB)}">
                    <select name="ganador_id" style="flex:1">
                      <option value="${partido.a}"${ganaA ? " selected" : ""}>${esc(nombreA)}</option>
                      <option value="${partido.b}"${ganaB ? " selected" : ""}>${esc(nombreB)}</option>
                    </select>
                  </div>
                  <label style="display:flex;gap:6px;align-items:center;margin-top:6px;text-transform:none;letter-spacing:0">
                    <input type="checkbox" name="walkover" style="width:auto"> walkover (no se presentó)
                  </label>
                  <button class="chico" type="submit" style="margin-top:6px">Guardar BO${partido.bestOf}</button>
                </form>`
              : `<div class="tenue" style="font-size:12px;margin-top:6px">Esperando rivales</div>`
          }
        </div>`;
      })
      .join("");
    return `<div class="ronda"><h4>${esc(nombreDeRonda(ronda, rondas))}</h4>${tarjetas}</div>`;
  }).join("");

  const opcionesJugadores = jugadores
    .filter((j) => j.baneado !== 1)
    .map(
      (j) =>
        `<option value="${j.id}">${esc(j.nombre)}${j.mayor_edad === 1 ? "" : " (sin 18+)"}${conPase.has(j.id) ? " · PASE" : ""}</option>`,
    )
    .join("");

  const campeon = puestos.find((p) => p.puesto === 1);
  const jugadorCampeon = campeon ? jugadoresPorParticipante.get(campeon.participanteId)?.[0] : undefined;

  const faltanCheckIn = participantes.filter((p) => p.presente !== 1).map((p) => p.nombre);

  const textos = [
    { titulo: "Anuncio de inscripción", texto: anuncioDeInscripcion(torneo) },
    { titulo: "Recordatorio de check-in", texto: recordatorioDeCheckIn(torneo, faltanCheckIn) },
  ];
  if (llave.length > 0) textos.push({ titulo: "Llave", texto: anuncioDeLlave(torneo, llave, nombrePor) });
  if (llaveTerminada(llave)) {
    textos.push({ titulo: "Resultado final", texto: anuncioDeResultado(torneo, puestos, nombrePor) });
    const temporada = await repo.temporada(torneo.temporada_id);
    if (temporada) {
      const nombresJugadores = new Map(jugadores.map((j) => [j.id, j.nombre]));
      textos.push({
        titulo: "Ranking actualizado",
        texto: anuncioDeRanking(
          temporada.nombre,
          await repo.rankingDeTemporada(temporada.id),
          nombresJugadores,
        ),
      });
    }
  }

  const bloquesTexto = textos
    .map((t) => `<h3>${esc(t.titulo)}</h3><pre class="copiable">${esc(t.texto)}</pre>`)
    .join("");

  const contenido = `
    <h1>${esc(torneo.nombre)} ${etiquetaEstado(torneo.estado)}</h1>
    <p class="sub">${esc(torneo.juego)} ${esc(torneo.formato)} · arranca ${esc(torneo.empieza_en.replace("T", " "))} ·
      inscripción ${formatoARS(torneo.inscripcion_centavos)} · premio fijo ${formatoARS(torneo.premio_centavos)} (${esc(torneo.premio_tipo)})</p>

    ${alertas}

    <div class="tarjeta">
      <div class="fila">
        ${["borrador", "inscripcion", "en_juego", "finalizado", "cancelado"]
          .filter((e) => e !== torneo.estado)
          .map(
            (e) => `<form class="inline" method="post" action="/torneos/${torneoId}/estado">
              <input type="hidden" name="estado" value="${e}">
              <button class="secundario chico" type="submit">Pasar a ${e.replace("_", " ")}</button>
            </form>`,
          )
          .join(" ")}
        <form class="inline" method="post" action="/torneos/${torneoId}/llave" onsubmit="return confirm('Esto regenera la llave y borra los resultados cargados. ¿Seguir?')">
          <button type="submit">Sortear / regenerar llave</button>
        </form>
      </div>
      <p class="tenue" style="font-size:12px;margin-top:10px">La llave se arma con los que tienen check-in. Si nadie hizo check-in, entran todos los inscriptos.</p>
    </div>

    <h2>Inscriptos (${participantes.length}/${torneo.cupo})</h2>
    <div class="tarjeta">
      ${
        filasParticipantes
          ? `<table><thead><tr><th>Participante</th><th>Pago</th><th>Check-in</th><th></th></tr></thead><tbody>${filasParticipantes}</tbody></table>`
          : `<p class="tenue">Nadie inscripto todavía.</p>`
      }
    </div>

    <h3>Inscribir</h3>
    <form method="post" action="/torneos/${torneoId}/inscribir" class="tarjeta">
      <div class="fila">
        <div>
          <label>Jugador(es) — mantené Ctrl para elegir varios en 2v2/3v3</label>
          <select name="jugador_id" multiple size="6">${opcionesJugadores}</select>
        </div>
        <div>
          <label>Nombre del equipo (opcional)</label>
          <input name="nombre_equipo" placeholder="Los Guardianes">
          <label>Medio de pago</label>
          <select name="medio_pago">
            <option value="">—</option>
            <option value="mercadopago">Mercado Pago</option>
            <option value="transferencia">Transferencia / alias</option>
            <option value="lemon">Lemon</option>
            <option value="efectivo">Efectivo</option>
          </select>
          <label>Referencia del pago</label>
          <input name="referencia_pago" placeholder="ID de operación">
          <label style="text-transform:none;letter-spacing:0;display:flex;gap:8px;align-items:center;margin-top:10px">
            <input type="checkbox" name="pago_ok" style="width:auto"> Pago confirmado
          </label>
        </div>
      </div>
      <div style="margin-top:14px"><button type="submit">Inscribir</button></div>
    </form>

    ${
      llave.length > 0
        ? `<h2>Llave</h2><div class="tarjeta"><div class="llave">${columnasLlave}</div></div>`
        : ""
    }

    ${
      puestos.length > 0 && llaveTerminada(llave)
        ? `<h2>Podio</h2><div class="tarjeta">
            <table><thead><tr><th>Puesto</th><th>Participante</th><th>Victorias</th></tr></thead><tbody>
            ${puestos
              .filter((p) => p.puesto <= 3)
              .map(
                (p) =>
                  `<tr><td>${p.puesto}</td><td>${esc(nombrePor.get(p.participanteId) ?? "?")}</td><td>${p.victorias}</td></tr>`,
              )
              .join("")}
            </tbody></table>
            ${
              torneo.premio_centavos > 0
                ? premioYaPagado
                  ? `<p class="tenue" style="margin-top:10px">Premio ya registrado como pagado en la caja.</p>`
                  : req.rol === "admin"
                    ? `<form method="post" action="/torneos/${torneoId}/pagar-premio" style="margin-top:14px">
                        <input type="hidden" name="jugador_id" value="${jugadorCampeon?.id ?? ""}">
                        <div class="fila">
                          <div><label>Medio</label><select name="medio">
                            <option value="gift_card">Gift card</option>
                            <option value="mercadopago">Mercado Pago</option>
                            <option value="transferencia">Transferencia</option>
                            <option value="lemon">Lemon</option>
                          </select></div>
                          <div><label>Referencia / código</label><input name="referencia" placeholder="código de la gift card"></div>
                          <div><button type="submit">Registrar pago de premio (${formatoARS(torneo.premio_centavos)})</button></div>
                        </div>
                        ${jugadorCampeon?.alias_pago ? `<p class="tenue" style="font-size:12px;margin-top:8px">Alias del campeón: <span class="mono">${esc(jugadorCampeon.alias_pago)}</span></p>` : ""}
                      </form>`
                    : `<p class="tenue" style="margin-top:10px">El pago del premio lo registra el admin.</p>`
                : ""
            }
          </div>`
        : ""
    }

    <h2>Textos para Discord</h2>
    <div class="tarjeta">${bloquesTexto}</div>
  `;

  res.send(layout(contenido, { titulo: torneo.nombre, rol: req.rol, activo: "torneos" }));
});
