import { Router } from "express";
import { abrirRepo, hoyISO } from "../../datos/repo.js";
import { alertasDeTorneo } from "../../dominio/caja.js";
import { formatoARS, pesosACentavos } from "../../dominio/dinero.js";
import { validarInscripcion } from "../../dominio/elegibilidad.js";
import { llaveTerminada, nombreDeRonda } from "../../dominio/llave.js";
import { requiereAdmin, requiereLogin } from "../auth.js";
import {
  anuncioDeInscripcion,
  anuncioDeLlave,
  anuncioDeRanking,
  anuncioDeResultado,
  recordatorioDeCheckIn,
} from "../discord.js";
import { alerta, esc, etiquetaEstado, layout } from "../plantilla.js";

export const rutasTorneos = Router();
rutasTorneos.use(requiereLogin);

const JUEGOS = ["valorant", "truco", "cs", "otro"];
const FORMATOS = ["1v1", "2v2", "3v3"];
const ESTADOS = ["borrador", "inscripcion", "en_juego", "finalizado", "cancelado"];

/** Valida el formulario de torneo a mano: son seis reglas, no vale traer una librería. */
function leerFormularioTorneo(cuerpo) {
  const errores = [];
  const nombre = String(cuerpo?.nombre ?? "").trim();
  if (nombre.length < 3) errores.push("El nombre tiene que tener al menos 3 caracteres.");

  const juego = JUEGOS.includes(cuerpo?.juego) ? cuerpo.juego : null;
  if (!juego) errores.push("Juego inválido.");

  const formato = FORMATOS.includes(cuerpo?.formato) ? cuerpo.formato : null;
  if (!formato) errores.push("Formato inválido.");

  const entero = (valor, minimo, maximo, etiqueta) => {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < minimo || n > maximo) {
      errores.push(`${etiqueta} tiene que ser un número entre ${minimo} y ${maximo}.`);
      return minimo;
    }
    return n;
  };

  const cupo = entero(cuerpo?.cupo, 2, 128, "El cupo");
  const minimoParticipantes = entero(cuerpo?.minimoParticipantes, 2, 128, "El mínimo");
  const bestOf = entero(cuerpo?.bestOf, 1, 9, "El BO de rondas");
  const bestOfFinal = entero(cuerpo?.bestOfFinal, 1, 9, "El BO de la final");

  const empiezaEn = String(cuerpo?.empiezaEn ?? "").trim();
  if (empiezaEn.length < 10) errores.push("Falta la fecha y hora de inicio.");

  if (minimoParticipantes > cupo) errores.push("El mínimo no puede ser mayor que el cupo.");

  let inscripcionCentavos = 0;
  let premioCentavos = 0;
  try {
    inscripcionCentavos = pesosACentavos(cuerpo?.inscripcion ?? "0");
    premioCentavos = pesosACentavos(cuerpo?.premio ?? "0");
  } catch {
    errores.push("Los montos tienen que ser números.");
  }

  return {
    errores,
    datos: {
      nombre,
      juego,
      formato,
      cupo,
      minimoParticipantes,
      empiezaEn,
      inscripcionCentavos,
      premioCentavos,
      premioTipo: ["gift_card", "especie", "efectivo"].includes(cuerpo?.premioTipo)
        ? cuerpo.premioTipo
        : "gift_card",
      premioDescripcion: String(cuerpo?.premioDescripcion ?? "").slice(0, 200) || null,
      bestOf,
      bestOfFinal,
      siembra: ["sorteo", "ranking", "manual"].includes(cuerpo?.siembra) ? cuerpo.siembra : "sorteo",
    },
  };
}

function paginaDeError(titulo, mensajes, volverA, rol) {
  return layout(
    `<h1>${esc(titulo)}</h1>
     ${mensajes.map((m) => alerta("grave", m)).join("")}
     <p><a class="boton secundario" href="${esc(volverA)}">Volver</a></p>`,
    { titulo, rol, activo: "torneos" },
  );
}

// ---------------- listado ----------------

rutasTorneos.get("/", async (req, res) => {
  const repo = await abrirRepo();
  const temporada = await repo.temporadaActiva();
  const torneos = await repo.torneos(temporada ? { temporadaId: temporada.id } : {});

  const cantidades = new Map(
    await Promise.all(torneos.map(async (t) => [t.id, (await repo.participantes(t.id)).length])),
  );

  const filas = torneos
    .map(
      (t) => `<tr>
        <td><a href="/torneos/${t.id}">${esc(t.nombre)}</a></td>
        <td>${esc(t.juego)} ${esc(t.formato)}</td>
        <td class="mono">${esc(String(t.empiezaEn).replace("T", " "))}</td>
        <td>${cantidades.get(t.id) ?? 0}/${t.cupo}</td>
        <td>${formatoARS(t.inscripcionCentavos)}</td>
        <td>${formatoARS(t.premioCentavos)}</td>
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

// ---------------- crear ----------------

rutasTorneos.get("/nuevo", async (req, res) => {
  const repo = await abrirRepo();
  const temporada = await repo.temporadaActiva();
  if (!temporada) {
    res.send(
      layout(
        `<h1>Crear torneo</h1>${alerta("grave", "Primero creá una temporada activa en la sección Temporadas.")}
         <p><a class="boton secundario" href="/temporadas">Ir a Temporadas</a></p>`,
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
          <div><label>Nombre</label><input name="nombre" required placeholder="Valorant 1v1 — Semana 1"></div>
          <div><label>Juego</label><select name="juego">
            <option value="valorant">Valorant</option><option value="truco">Truco</option>
            <option value="cs">CS</option><option value="otro">Otro</option>
          </select></div>
          <div><label>Formato</label><select name="formato">
            <option value="1v1">1v1</option><option value="2v2">2v2</option><option value="3v3">3v3</option>
          </select></div>
        </div>
        <div class="fila">
          <div><label>Cupo</label><input name="cupo" type="number" value="8" min="2" max="128"></div>
          <div><label>Mínimo para jugarse</label><input name="minimoParticipantes" type="number" value="6" min="2"></div>
          <div><label>Arranca (fecha y hora)</label><input name="empiezaEn" type="datetime-local" required></div>
        </div>
        <div class="fila">
          <div><label>Inscripción ($ ARS, 0 = Pista Libre)</label><input name="inscripcion" value="0"></div>
          <div><label>Premio fijo ($ ARS)</label><input name="premio" value="0"></div>
          <div><label>Tipo de premio</label><select name="premioTipo">
            <option value="gift_card">Gift card</option><option value="especie">En especie</option>
            <option value="efectivo">Efectivo</option>
          </select></div>
        </div>
        <div class="fila">
          <div><label>Detalle del premio</label><input name="premioDescripcion" placeholder="Gift card Steam"></div>
          <div><label>BO rondas</label><input name="bestOf" type="number" value="1" min="1" max="9"></div>
          <div><label>BO final</label><input name="bestOfFinal" type="number" value="3" min="1" max="9"></div>
          <div><label>Siembra</label><select name="siembra">
            <option value="sorteo">Sorteo</option><option value="ranking">Por ranking</option>
            <option value="manual">Manual</option>
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
    res.status(400).send(paginaDeError("No hay temporada activa", ["Creá una temporada primero."], "/temporadas", req.rol));
    return;
  }
  const { errores, datos } = leerFormularioTorneo(req.body);
  if (errores.length > 0) {
    res.status(400).send(paginaDeError("Datos inválidos", errores, "/torneos/nuevo", req.rol));
    return;
  }
  const torneo = await repo.crearTorneo({ ...datos, temporadaId: temporada.id });
  await repo.registrar(req.rol, "crear_torneo", `${datos.nombre} (#${torneo.id})`);
  res.redirect(`/torneos/${torneo.id}`);
});

// ---------------- acciones ----------------

rutasTorneos.post("/:id/estado", async (req, res) => {
  const repo = await abrirRepo();
  const estado = String(req.body?.estado ?? "");
  if (!ESTADOS.includes(estado)) {
    res.status(400).send("Estado inválido");
    return;
  }
  await repo.cambiarEstadoTorneo(req.params.id, estado);
  await repo.registrar(req.rol, "cambiar_estado_torneo", `#${req.params.id} → ${estado}`);
  res.redirect(`/torneos/${req.params.id}`);
});

rutasTorneos.post("/:id/inscribir", async (req, res) => {
  const repo = await abrirRepo();
  const torneoId = Number(req.params.id);
  const torneo = await repo.torneo(torneoId);
  if (!torneo) {
    res.status(404).send("Torneo inexistente");
    return;
  }

  const crudos = Array.isArray(req.body?.jugadorId) ? req.body.jugadorId : [req.body?.jugadorId];
  const jugadorIds = crudos
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  if (jugadorIds.length === 0) {
    res.status(400).send(paginaDeError("Falta el jugador", ["Elegí al menos un jugador."], `/torneos/${torneoId}`, req.rol));
    return;
  }

  const [participantesActuales, jugadores, conPase] = await Promise.all([
    repo.participantes(torneoId),
    repo.jugadores(),
    repo.jugadoresConPaseActivo(),
  ]);
  const porId = new Map(jugadores.map((j) => [j.id, j]));

  const motivos = [];
  let algunoConPase = false;

  for (const jugadorId of jugadorIds) {
    const jugador = porId.get(jugadorId);
    if (!jugador) {
      motivos.push(`El jugador ${jugadorId} no existe.`);
      continue;
    }
    const tienePase = conPase.has(jugadorId);
    if (tienePase) algunoConPase = true;
    const veredicto = validarInscripcion(jugador, torneo, {
      participantesActuales: participantesActuales.length,
      tienePaseActivo: tienePase,
      pagoConfirmado: req.body?.pagoOk === "on",
    });
    if (!veredicto.puede) motivos.push(`${jugador.nombre}: ${veredicto.motivos.join(" ")}`);
  }

  // Un jugador ya inscripto no puede volver a entrar: duplicaría su puntaje en el ranking.
  const yaInscriptos = new Set(participantesActuales.flatMap((p) => p.jugadorIds ?? []));
  for (const jugadorId of jugadorIds) {
    if (yaInscriptos.has(jugadorId)) {
      motivos.push(`${porId.get(jugadorId)?.nombre ?? jugadorId} ya está inscripto en este torneo.`);
    }
  }

  if (motivos.length > 0) {
    res.status(400).send(paginaDeError("No se pudo inscribir", motivos, `/torneos/${torneoId}`, req.rol));
    return;
  }

  const nombreEquipo =
    String(req.body?.nombreEquipo ?? "").trim() ||
    jugadorIds.map((id) => porId.get(id)?.nombre ?? "?").join(" + ");

  await repo.inscribir({
    torneoId,
    nombre: nombreEquipo,
    jugadorIds,
    pagoOk: req.body?.pagoOk === "on" || algunoConPase,
    cubiertoPorPase: algunoConPase,
    medioPago: String(req.body?.medioPago ?? "") || null,
    referenciaPago: String(req.body?.referenciaPago ?? "") || null,
    inscripcionCentavos: torneo.inscripcionCentavos,
  });
  await repo.registrar(req.rol, "inscribir", `${nombreEquipo} en #${torneoId}`);
  res.redirect(`/torneos/${torneoId}`);
});

rutasTorneos.post("/:id/participante/:pid/pago", async (req, res) => {
  const repo = await abrirRepo();
  await repo.marcarPago(
    req.params.pid,
    req.body?.pago === "1",
    String(req.body?.medioPago ?? "") || undefined,
    String(req.body?.referencia ?? "") || undefined,
  );
  await repo.registrar(req.rol, "marcar_pago", `participante ${req.params.pid}`);
  res.redirect(`/torneos/${req.params.id}`);
});

rutasTorneos.post("/:id/participante/:pid/checkin", async (req, res) => {
  const repo = await abrirRepo();
  await repo.marcarPresente(req.params.pid, req.body?.presente === "1");
  res.redirect(`/torneos/${req.params.id}`);
});

rutasTorneos.post("/:id/participante/:pid/borrar", async (req, res) => {
  const repo = await abrirRepo();
  await repo.eliminarParticipante(req.params.pid);
  await repo.registrar(req.rol, "borrar_participante", `participante ${req.params.pid}`);
  res.redirect(`/torneos/${req.params.id}`);
});

rutasTorneos.post("/:id/llave", async (req, res) => {
  const repo = await abrirRepo();
  const resultado = await repo.generarLlave(req.params.id);
  if (!resultado.ok) {
    res
      .status(400)
      .send(paginaDeError("No se pudo armar la llave", [resultado.error], `/torneos/${req.params.id}`, req.rol));
    return;
  }
  await repo.registrar(req.rol, "generar_llave", `#${req.params.id}`);
  res.redirect(`/torneos/${req.params.id}`);
});

rutasTorneos.post("/:id/resultado", async (req, res) => {
  const repo = await abrirRepo();
  const resultado = await repo.cargarResultadoPartido(
    req.params.id,
    Number(req.body?.ronda),
    Number(req.body?.posicion),
    Number(req.body?.ganadorId),
    Number(req.body?.scoreA ?? 0),
    Number(req.body?.scoreB ?? 0),
    req.body?.walkover === "on",
  );
  if (!resultado.ok) {
    res
      .status(400)
      .send(paginaDeError("Resultado rechazado", [resultado.error], `/torneos/${req.params.id}`, req.rol));
    return;
  }
  await repo.registrar(
    req.rol,
    "cargar_resultado",
    `#${req.params.id} R${req.body?.ronda}P${req.body?.posicion}`,
  );
  res.redirect(`/torneos/${req.params.id}`);
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
    res
      .status(400)
      .send(
        paginaDeError(
          "El premio ya estaba pagado",
          ["Ya hay un movimiento de premio para este torneo en la caja."],
          `/torneos/${torneoId}`,
          req.rol,
        ),
      );
    return;
  }
  await repo.crearMovimiento({
    fecha: hoyISO(),
    tipo: "egreso",
    categoria: "premio",
    concepto: `Premio ${torneo.nombre}`,
    montoCentavos: torneo.premioCentavos,
    torneoId,
    jugadorId: Number(req.body?.jugadorId) || null,
    medio: String(req.body?.medio ?? "") || null,
    referencia: String(req.body?.referencia ?? "") || null,
    creadoPor: req.rol,
  });
  await repo.registrar(req.rol, "pagar_premio", `#${torneoId}`);
  res.redirect(`/torneos/${torneoId}`);
});

// ---------------- ficha ----------------

rutasTorneos.get("/:id", async (req, res) => {
  const repo = await abrirRepo();
  const torneoId = Number(req.params.id);
  const torneo = await repo.torneo(torneoId);
  if (!torneo) {
    res.status(404).send("Torneo inexistente");
    return;
  }

  const [participantes, jugadores, llave, listaPuestos, jugadoresPor, conPase, premioYaPagado] =
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
  const pagos = participantes.filter((p) => p.pagoOk || p.cubiertoPorPase).length;

  const alertas = alertasDeTorneo({
    inscripcionCentavos: torneo.inscripcionCentavos,
    premioCentavos: torneo.premioCentavos,
    participantesPagos: pagos,
    participantesTotales: participantes.length,
    minimoParticipantes: torneo.minimoParticipantes,
    estado: torneo.estado,
  })
    .map((a) => alerta(a.nivel, a.mensaje))
    .join("");

  const filasParticipantes = participantes
    .map((p) => {
      const suyos = jugadoresPor.get(p.id) ?? [];
      const sinMayoria = suyos.some((j) => !j.mayorEdad);
      return `<tr>
        <td>${esc(p.nombre)}
          <div class="tenue" style="font-size:12px">${suyos.map((j) => esc(j.discordTag)).join(", ")}${
            sinMayoria ? ' <span style="color:var(--grave)">· sin 18+ confirmado</span>' : ""
          }</div>
        </td>
        <td>${
          p.cubiertoPorPase
            ? '<span class="pill">Pase</span>'
            : p.pagoOk
              ? '<span class="pill">Pagó</span>'
              : '<span class="pill" style="color:var(--alerta)">Impago</span>'
        }</td>
        <td>${p.presente ? '<span class="pill" style="color:var(--ok)">presente</span>' : '<span class="tenue">falta</span>'}</td>
        <td>
          <form class="inline" method="post" action="/torneos/${torneoId}/participante/${p.id}/checkin">
            <input type="hidden" name="presente" value="${p.presente ? "0" : "1"}">
            <button class="secundario chico" type="submit">${p.presente ? "Quitar check-in" : "Check-in"}</button>
          </form>
          ${
            p.cubiertoPorPase
              ? ""
              : `<form class="inline" method="post" action="/torneos/${torneoId}/participante/${p.id}/pago">
                  <input type="hidden" name="pago" value="${p.pagoOk ? "0" : "1"}">
                  <button class="secundario chico" type="submit">${p.pagoOk ? "Marcar impago" : "Marcar pago"}</button>
                </form>`
          }
          <form class="inline" method="post" action="/torneos/${torneoId}/participante/${p.id}/borrar"
                onsubmit="return confirm('¿Borrar a ${esc(p.nombre)}?')">
            <button class="peligro chico" type="submit">Borrar</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");

  const columnasLlave = Array.from({ length: rondas }, (_, indice) => {
    const ronda = indice + 1;
    const tarjetas = llave
      .filter((p) => p.ronda === ronda)
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
                    <input name="scoreA" type="number" min="0" max="9" value="${partido.scoreA}" style="width:52px" title="${esc(nombreA)}">
                    <input name="scoreB" type="number" min="0" max="9" value="${partido.scoreB}" style="width:52px" title="${esc(nombreB)}">
                    <select name="ganadorId" style="flex:1">
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

  const yaInscriptos = new Set(participantes.flatMap((p) => p.jugadorIds ?? []));
  const opcionesJugadores = jugadores
    .filter((j) => !j.baneado && !yaInscriptos.has(j.id))
    .map(
      (j) =>
        `<option value="${j.id}">${esc(j.nombre)}${j.mayorEdad ? "" : " (sin 18+)"}${conPase.has(j.id) ? " · PASE" : ""}</option>`,
    )
    .join("");

  const campeon = listaPuestos.find((p) => p.puesto === 1);
  const jugadorCampeon = campeon ? jugadoresPor.get(campeon.participanteId)?.[0] : undefined;
  const faltanCheckIn = participantes.filter((p) => !p.presente).map((p) => p.nombre);

  const textos = [
    { titulo: "Anuncio de inscripción", texto: anuncioDeInscripcion(torneo) },
    { titulo: "Recordatorio de check-in", texto: recordatorioDeCheckIn(torneo, faltanCheckIn) },
  ];
  if (llave.length > 0) {
    textos.push({ titulo: "Llave", texto: anuncioDeLlave(torneo, llave, nombrePor) });
  }
  if (llaveTerminada(llave)) {
    textos.push({ titulo: "Resultado final", texto: anuncioDeResultado(torneo, listaPuestos, nombrePor) });
    const temporada = await repo.temporada(torneo.temporadaId);
    if (temporada) {
      textos.push({
        titulo: "Ranking actualizado",
        texto: anuncioDeRanking(
          temporada.nombre,
          await repo.rankingDeTemporada(temporada.id),
          new Map(jugadores.map((j) => [j.id, j.nombre])),
        ),
      });
    }
  }

  const contenido = `
    <h1>${esc(torneo.nombre)} ${etiquetaEstado(torneo.estado)}</h1>
    <p class="sub">${esc(torneo.juego)} ${esc(torneo.formato)} · arranca ${esc(String(torneo.empiezaEn).replace("T", " "))} ·
      inscripción ${formatoARS(torneo.inscripcionCentavos)} · premio fijo ${formatoARS(torneo.premioCentavos)} (${esc(torneo.premioTipo)})</p>

    ${alertas}

    <div class="tarjeta">
      <div class="fila">
        ${ESTADOS.filter((e) => e !== torneo.estado)
          .map(
            (e) => `<form class="inline" method="post" action="/torneos/${torneoId}/estado">
              <input type="hidden" name="estado" value="${e}">
              <button class="secundario chico" type="submit">Pasar a ${e.replace("_", " ")}</button>
            </form>`,
          )
          .join(" ")}
        <form class="inline" method="post" action="/torneos/${torneoId}/llave"
              onsubmit="return confirm('Esto regenera la llave y borra los resultados cargados. ¿Seguir?')">
          <button type="submit">Sortear / regenerar llave</button>
        </form>
      </div>
      <p class="tenue" style="font-size:12px;margin-top:10px">La llave se arma con los que tienen check-in.
      Si nadie hizo check-in, entran todos los inscriptos.</p>
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
    ${
      jugadores.length === 0
        ? `<div class="tarjeta"><p class="tenue">No hay jugadores cargados. <a href="/jugadores">Cargá uno primero</a>.</p></div>`
        : `<form method="post" action="/torneos/${torneoId}/inscribir" class="tarjeta">
      <div class="fila">
        <div>
          <label>Jugador(es) — mantené Ctrl para elegir varios en 2v2/3v3</label>
          <select name="jugadorId" multiple size="6">${opcionesJugadores}</select>
        </div>
        <div>
          <label>Nombre del equipo (opcional)</label>
          <input name="nombreEquipo" placeholder="Los Guardianes">
          <label>Medio de pago</label>
          <select name="medioPago">
            <option value="">—</option>
            <option value="mercadopago">Mercado Pago</option>
            <option value="transferencia">Transferencia / alias</option>
            <option value="efectivo">Efectivo</option>
          </select>
          <label>Referencia del pago</label>
          <input name="referenciaPago" placeholder="ID de operación">
          <label style="text-transform:none;letter-spacing:0;display:flex;gap:8px;align-items:center;margin-top:10px">
            <input type="checkbox" name="pagoOk" style="width:auto"> Pago confirmado
          </label>
        </div>
      </div>
      <div style="margin-top:14px"><button type="submit">Inscribir</button></div>
    </form>`
    }

    ${llave.length > 0 ? `<h2>Llave</h2><div class="tarjeta"><div class="llave">${columnasLlave}</div></div>` : ""}

    ${
      listaPuestos.length > 0 && llaveTerminada(llave)
        ? `<h2>Podio</h2><div class="tarjeta">
            <table><thead><tr><th>Puesto</th><th>Participante</th><th>Victorias</th></tr></thead><tbody>
            ${listaPuestos
              .filter((p) => p.puesto <= 3)
              .map(
                (p) =>
                  `<tr><td>${p.puesto}</td><td>${esc(nombrePor.get(p.participanteId) ?? "?")}</td><td>${p.victorias}</td></tr>`,
              )
              .join("")}
            </tbody></table>
            ${
              torneo.premioCentavos > 0
                ? premioYaPagado
                  ? `<p class="tenue" style="margin-top:10px">Premio ya registrado como pagado en la caja.</p>`
                  : req.rol === "admin"
                    ? `<form method="post" action="/torneos/${torneoId}/pagar-premio" style="margin-top:14px">
                        <input type="hidden" name="jugadorId" value="${jugadorCampeon?.id ?? ""}">
                        <div class="fila">
                          <div><label>Medio</label><select name="medio">
                            <option value="gift_card">Gift card</option>
                            <option value="mercadopago">Mercado Pago</option>
                            <option value="transferencia">Transferencia</option>
                          </select></div>
                          <div><label>Referencia / código</label><input name="referencia" placeholder="código de la gift card"></div>
                          <div><button type="submit">Registrar pago de premio (${formatoARS(torneo.premioCentavos)})</button></div>
                        </div>
                        ${
                          jugadorCampeon?.aliasPago
                            ? `<p class="tenue" style="font-size:12px;margin-top:8px">Alias del campeón: <span class="mono">${esc(jugadorCampeon.aliasPago)}</span></p>`
                            : ""
                        }
                      </form>`
                    : `<p class="tenue" style="margin-top:10px">El pago del premio lo registra el admin.</p>`
                : ""
            }
          </div>`
        : ""
    }

    <h2>Textos para Discord</h2>
    <div class="tarjeta">
      ${textos.map((t) => `<h3>${esc(t.titulo)}</h3><pre class="copiable">${esc(t.texto)}</pre>`).join("")}
    </div>
  `;

  res.send(layout(contenido, { titulo: torneo.nombre, rol: req.rol, activo: "torneos" }));
});
