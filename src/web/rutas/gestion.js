import { Router } from "express";
import { config } from "../../config.js";
import { abrirRepo, hoyISO } from "../../datos/repo.js";
import { alertaRatioPremios, beneficioModerador, resumirCaja } from "../../dominio/caja.js";
import { aUSD, formatoARS, pesosACentavos } from "../../dominio/dinero.js";
import { REGLAS_POR_DEFECTO } from "../../dominio/ranking.js";
import { requiereAdmin, requiereLogin } from "../auth.js";
import { anuncioDeRanking } from "../discord.js";
import { alerta, esc, layout, metrica } from "../plantilla.js";

export const rutasGestion = Router();
rutasGestion.use(requiereLogin);

const CATEGORIAS = [
  ["inscripcion", "Inscripción"],
  ["pase", "Pase"],
  ["sponsor", "Sponsor"],
  ["stream", "Stream"],
  ["premio", "Premio"],
  ["comision", "Comisión de cobro"],
  ["beneficio_mod", "Beneficio del mod"],
  ["infra", "Infra (Nitro, hosting)"],
  ["otro", "Otro"],
];

// ---------------- jugadores ----------------

rutasGestion.get("/jugadores", async (req, res) => {
  const repo = await abrirRepo();
  const [jugadores, conPase] = await Promise.all([repo.jugadores(), repo.jugadoresConPaseActivo()]);

  const filas = jugadores
    .map(
      (j) => `<tr>
        <td>${esc(j.nombre)}${j.baneado ? ' <span class="pill" style="color:var(--grave)">baneado</span>' : ""}</td>
        <td class="tenue">${esc(j.discordTag)}</td>
        <td class="mono tenue">${esc(j.riotId ?? "—")}</td>
        <td class="mono tenue">${esc(j.aliasPago ?? "—")}</td>
        <td>${j.mayorEdad ? '<span class="pill" style="color:var(--ok)">18+</span>' : '<span style="color:var(--alerta)">sin confirmar</span>'}</td>
        <td>${conPase.has(j.id) ? '<span class="pill">Pase activo</span>' : "—"}</td>
        <td>
          <form class="inline" method="post" action="/jugadores/${j.id}/mayoria">
            <input type="hidden" name="valor" value="${j.mayorEdad ? "0" : "1"}">
            <button class="secundario chico" type="submit">${j.mayorEdad ? "Quitar 18+" : "Confirmar 18+"}</button>
          </form>
          <form class="inline" method="post" action="/jugadores/${j.id}/baneo">
            <input type="hidden" name="valor" value="${j.baneado ? "0" : "1"}">
            <button class="secundario chico" type="submit">${j.baneado ? "Desbanear" : "Banear"}</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");

  res.send(
    layout(
      `<h1>Jugadores</h1>
      <p class="sub">${jugadores.length} cargados · ${jugadores.filter((j) => j.mayorEdad).length} con 18+ confirmado</p>
      ${alerta("info", "El check de 18+ es obligatorio para torneos con inscripción o premio. Sin ese check, el panel no deja inscribir en instancias con plata.")}
      <div class="tarjeta">
        ${
          filas
            ? `<table><thead><tr><th>Nombre</th><th>Discord</th><th>Riot ID</th><th>Alias de pago</th><th>Edad</th><th>Pase</th><th></th></tr></thead><tbody>${filas}</tbody></table>`
            : `<p class="tenue">No hay jugadores cargados.</p>`
        }
      </div>
      <h3>Agregar jugador</h3>
      <form method="post" action="/jugadores" class="tarjeta">
        <div class="fila">
          <div><label>ID de Discord</label><input name="discordId" required placeholder="123456789012345678"></div>
          <div><label>Usuario de Discord</label><input name="discordTag" required placeholder="@usuario"></div>
          <div><label>Nombre para mostrar</label><input name="nombre" required></div>
        </div>
        <div class="fila">
          <div><label>Riot ID</label><input name="riotId" placeholder="Nombre#ARG"></div>
          <div><label>Alias / CVU para cobrar</label><input name="aliasPago"></div>
          <div><label style="text-transform:none;letter-spacing:0">
            <input type="checkbox" name="mayorEdad" style="width:auto"> Confirmé que es 18+</label></div>
        </div>
        <div><label>Notas</label><input name="notas" placeholder="cómo lo verifiqué, de dónde vino, etc."></div>
        <div style="margin-top:14px"><button type="submit">Agregar</button></div>
      </form>`,
      { titulo: "Jugadores", rol: req.rol, activo: "jugadores" },
    ),
  );
});

rutasGestion.post("/jugadores", async (req, res) => {
  const repo = await abrirRepo();
  const nombre = String(req.body?.nombre ?? "").trim();
  const discordId = String(req.body?.discordId ?? "").trim();
  if (nombre.length < 2 || discordId.length < 2) {
    res.status(400).send(
      layout(
        `<h1>Datos incompletos</h1>${alerta("grave", "Hacen falta al menos el nombre y el ID de Discord.")}
         <p><a class="boton secundario" href="/jugadores">Volver</a></p>`,
        { titulo: "Error", rol: req.rol, activo: "jugadores" },
      ),
    );
    return;
  }

  try {
    await repo.crearJugador({
      discordId,
      discordTag: String(req.body?.discordTag ?? "").trim(),
      nombre,
      riotId: String(req.body?.riotId ?? "").trim() || null,
      aliasPago: String(req.body?.aliasPago ?? "").trim() || null,
      mayorEdad: req.body?.mayorEdad === "on",
      notas: String(req.body?.notas ?? "").slice(0, 300) || null,
    });
    await repo.registrar(req.rol, "crear_jugador", nombre);
  } catch (error) {
    const duplicado = error instanceof Error && error.message === "DISCORD_ID_DUPLICADO";
    res.status(400).send(
      layout(
        `<h1>No se pudo agregar</h1>${alerta(
          "grave",
          duplicado
            ? "Ese ID de Discord ya está cargado. Si querés editar a esa persona, buscala en la lista."
            : "Error al guardar.",
        )}<p><a class="boton secundario" href="/jugadores">Volver</a></p>`,
        { titulo: "Error", rol: req.rol, activo: "jugadores" },
      ),
    );
    return;
  }
  res.redirect("/jugadores");
});

rutasGestion.post("/jugadores/:id/mayoria", async (req, res) => {
  const repo = await abrirRepo();
  await repo.actualizarJugador(req.params.id, { mayorEdad: req.body?.valor === "1" });
  await repo.registrar(req.rol, "cambiar_mayoria_edad", `jugador ${req.params.id} → ${req.body?.valor}`);
  res.redirect("/jugadores");
});

rutasGestion.post("/jugadores/:id/baneo", async (req, res) => {
  const repo = await abrirRepo();
  await repo.actualizarJugador(req.params.id, { baneado: req.body?.valor === "1" });
  await repo.registrar(req.rol, "cambiar_baneo", `jugador ${req.params.id} → ${req.body?.valor}`);
  res.redirect("/jugadores");
});

// ---------------- temporadas ----------------

rutasGestion.get("/temporadas", async (req, res) => {
  const repo = await abrirRepo();
  const temporadas = await repo.temporadas();
  const cantidades = new Map(
    await Promise.all(
      temporadas.map(async (t) => [t.id, (await repo.torneos({ temporadaId: t.id })).length]),
    ),
  );

  const filas = temporadas
    .map(
      (t) => `<tr>
        <td>${esc(t.nombre)}</td>
        <td class="mono">${esc(t.desdeFecha)} a ${esc(t.hastaFecha)}</td>
        <td>${esc(t.estado)}</td>
        <td>${cantidades.get(t.id) ?? 0}</td>
        <td>${formatoARS(t.premioFinalCentavos)}</td>
        <td>${
          t.estado === "activa" && req.rol === "admin"
            ? `<form class="inline" method="post" action="/temporadas/${t.id}/cerrar"
                     onsubmit="return confirm('Cerrar la temporada congela el ranking. ¿Seguir?')">
                 <button class="secundario chico">Cerrar</button></form>`
            : ""
        }</td>
      </tr>`,
    )
    .join("");

  res.send(
    layout(
      `<h1>Temporadas</h1>
      <p class="sub">Una temporada = un ciclo de ranking con reset. Recomendado: 6 semanas.</p>
      <div class="tarjeta">
        ${
          filas
            ? `<table><thead><tr><th>Nombre</th><th>Período</th><th>Estado</th><th>Torneos</th><th>Premio final</th><th></th></tr></thead><tbody>${filas}</tbody></table>`
            : `<p class="tenue">No hay temporadas.</p>`
        }
      </div>
      ${
        req.rol === "admin"
          ? `<h3>Crear temporada</h3>
        <form method="post" action="/temporadas" class="tarjeta">
          <div class="fila">
            <div><label>Nombre</label><input name="nombre" required placeholder="Temporada I"></div>
            <div><label>Desde</label><input name="desdeFecha" type="date" value="${hoyISO()}" required></div>
            <div><label>Hasta</label><input name="hastaFecha" type="date" required></div>
            <div><label>Premio final ($ ARS)</label><input name="premioFinal" value="0"></div>
          </div>
          <div class="fila">
            <div><label>Puntos por participar</label><input name="participacion" type="number" value="${REGLAS_POR_DEFECTO.participacion}"></div>
            <div><label>Puntos por victoria</label><input name="porVictoria" type="number" value="${REGLAS_POR_DEFECTO.porVictoria}"></div>
            <div><label>Bonus campeón</label><input name="bonus1" type="number" value="${REGLAS_POR_DEFECTO.bonusPuesto[1]}"></div>
            <div><label>Bonus finalista</label><input name="bonus2" type="number" value="${REGLAS_POR_DEFECTO.bonusPuesto[2]}"></div>
            <div><label>Bonus semifinalista</label><input name="bonus3" type="number" value="${REGLAS_POR_DEFECTO.bonusPuesto[3]}"></div>
            <div><label>Bonus por check-in</label><input name="bonusPresentarse" type="number" value="${REGLAS_POR_DEFECTO.bonusPresentarse}"></div>
          </div>
          <div style="margin-top:14px"><button type="submit">Crear</button></div>
        </form>`
          : alerta("info", "Sólo el admin puede crear o cerrar temporadas.")
      }`,
      { titulo: "Temporadas", rol: req.rol, activo: "temporadas" },
    ),
  );
});

rutasGestion.post("/temporadas", requiereAdmin, async (req, res) => {
  const repo = await abrirRepo();
  const nombre = String(req.body?.nombre ?? "").trim();
  if (nombre.length < 3) {
    res.status(400).send("El nombre es demasiado corto.");
    return;
  }
  const numero = (valor, porDefecto) => {
    const n = Number(valor);
    return Number.isFinite(n) ? n : porDefecto;
  };
  const temporada = await repo.crearTemporada({
    nombre,
    desdeFecha: String(req.body?.desdeFecha ?? hoyISO()),
    hastaFecha: String(req.body?.hastaFecha ?? hoyISO()),
    premioFinalCentavos: pesosACentavos(String(req.body?.premioFinal ?? "0")),
    reglas: {
      participacion: numero(req.body?.participacion, REGLAS_POR_DEFECTO.participacion),
      porVictoria: numero(req.body?.porVictoria, REGLAS_POR_DEFECTO.porVictoria),
      bonusPresentarse: numero(req.body?.bonusPresentarse, REGLAS_POR_DEFECTO.bonusPresentarse),
      bonusPuesto: {
        1: numero(req.body?.bonus1, 15),
        2: numero(req.body?.bonus2, 9),
        3: numero(req.body?.bonus3, 5),
      },
    },
  });
  await repo.registrar(req.rol, "crear_temporada", `${nombre} (#${temporada.id})`);
  res.redirect("/temporadas");
});

rutasGestion.post("/temporadas/:id/cerrar", requiereAdmin, async (req, res) => {
  const repo = await abrirRepo();
  await repo.cerrarTemporada(req.params.id);
  await repo.registrar(req.rol, "cerrar_temporada", `#${req.params.id}`);
  res.redirect("/temporadas");
});

// ---------------- ranking ----------------

rutasGestion.get("/ranking", async (req, res) => {
  const repo = await abrirRepo();
  const [temporadas, activa] = await Promise.all([repo.temporadas(), repo.temporadaActiva()]);
  const pedida = Number(req.query.temporada);
  const temporada =
    temporadas.find((t) => t.id === pedida) ?? activa ?? temporadas[0];

  if (!temporada) {
    res.send(
      layout(`<h1>Ranking</h1>${alerta("atencion", "No hay temporadas creadas.")}`, {
        titulo: "Ranking",
        rol: req.rol,
        activo: "ranking",
      }),
    );
    return;
  }

  const [ranking, jugadores] = await Promise.all([
    repo.rankingDeTemporada(temporada.id),
    repo.jugadores(),
  ]);
  const nombres = new Map(jugadores.map((j) => [j.id, j.nombre]));

  const filas = ranking
    .map(
      (f, i) => `<tr>
        <td>${i + 1}</td><td>${esc(nombres.get(f.jugadorId) ?? "?")}</td>
        <td><strong>${f.puntos}</strong></td><td>${f.torneos}</td><td>${f.victorias}</td>
        <td>${f.primeros}</td><td>${f.segundos}</td><td>${f.terceros}</td>
      </tr>`,
    )
    .join("");

  res.send(
    layout(
      `<h1>Ranking</h1>
      <form method="get" action="/ranking" class="tarjeta">
        <div class="fila"><div><label>Temporada</label>
          <select name="temporada" onchange="this.form.submit()">
            ${temporadas.map((t) => `<option value="${t.id}"${t.id === temporada.id ? " selected" : ""}>${esc(t.nombre)}</option>`).join("")}
          </select></div></div>
      </form>
      <div class="tarjeta">
        ${
          filas
            ? `<table><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Torneos</th><th>Victorias</th><th>1°</th><th>2°</th><th>3°</th></tr></thead><tbody>${filas}</tbody></table>`
            : `<p class="tenue">Sin resultados cargados.</p>`
        }
      </div>
      <h3>Texto para Discord</h3>
      <pre class="copiable">${esc(anuncioDeRanking(temporada.nombre, ranking, nombres))}</pre>
      <p class="tenue">Vista pública para los miembros: <a href="/publico/ranking">/publico/ranking</a></p>`,
      { titulo: "Ranking", rol: req.rol, activo: "ranking" },
    ),
  );
});

// ---------------- pases ----------------

rutasGestion.get("/pases", async (req, res) => {
  const repo = await abrirRepo();
  const temporada = await repo.temporadaActiva();
  if (!temporada) {
    res.send(
      layout(`<h1>Pases</h1>${alerta("atencion", "Creá una temporada activa primero.")}`, {
        titulo: "Pases",
        rol: req.rol,
        activo: "pases",
      }),
    );
    return;
  }

  const [pases, jugadores] = await Promise.all([
    repo.pasesDeTemporada(temporada.id),
    repo.jugadores(),
  ]);
  const hoy = hoyISO();
  const vigente = (p) => p.desdeFecha <= hoy && hoy <= p.hastaFecha;

  const filas = pases
    .map(
      (p) => `<tr>
        <td>${esc(p.nombre)}</td><td>${esc(p.nivel)}</td>
        <td>${formatoARS(p.precioCentavos)}</td>
        <td class="mono">${esc(p.desdeFecha)} a ${esc(p.hastaFecha)}</td>
        <td>${vigente(p) ? '<span class="pill">vigente</span>' : '<span class="tenue">vencido</span>'}</td>
      </tr>`,
    )
    .join("");

  const activos = pases.filter(vigente);
  const recaudado = activos.reduce((suma, p) => suma + p.precioCentavos, 0);

  res.send(
    layout(
      `<h1>Pases de temporada</h1>
      <p class="sub">Temporada ${esc(temporada.nombre)}</p>
      <div class="grid g3">
        ${metrica("Pases vigentes", String(activos.length))}
        ${metrica("Ingreso recurrente", formatoARS(recaudado), config.tipoCambio ? aUSD(recaudado, config.tipoCambio) : "")}
        ${metrica("Pases históricos", String(pases.length))}
      </div>
      <div class="tarjeta">
        ${
          filas
            ? `<table><thead><tr><th>Jugador</th><th>Nivel</th><th>Precio</th><th>Vigencia</th><th></th></tr></thead><tbody>${filas}</tbody></table>`
            : `<p class="tenue">Todavía no se vendió ningún pase.</p>`
        }
      </div>
      <h3>Registrar pase</h3>
      ${alerta("info", "El pase entra solo a la caja como ingreso: no hace falta cargarlo dos veces.")}
      ${
        jugadores.length === 0
          ? `<div class="tarjeta"><p class="tenue">No hay jugadores cargados. <a href="/jugadores">Cargá uno primero</a>.</p></div>`
          : `<form method="post" action="/pases" class="tarjeta">
        <div class="fila">
          <div><label>Jugador</label><select name="jugadorId" required>
            ${jugadores.filter((j) => !j.baneado).map((j) => `<option value="${j.id}">${esc(j.nombre)}${j.mayorEdad ? "" : " (sin 18+)"}</option>`).join("")}
          </select></div>
          <div><label>Nivel</label><select name="nivel">
            <option value="combatiente">Combatiente (mensual)</option>
            <option value="guardian">Guardián (trimestral)</option>
          </select></div>
          <div><label>Precio ($ ARS)</label><input name="precio" required></div>
        </div>
        <div class="fila">
          <div><label>Desde</label><input name="desdeFecha" type="date" value="${hoy}" required></div>
          <div><label>Hasta</label><input name="hastaFecha" type="date" required></div>
          <div><label>Medio</label><select name="medioPago">
            <option value="mercadopago">Mercado Pago</option>
            <option value="transferencia">Transferencia / alias</option>
            <option value="efectivo">Efectivo</option>
          </select></div>
          <div><label>Referencia</label><input name="referenciaPago"></div>
        </div>
        <div style="margin-top:14px"><button type="submit">Registrar pase e ingresar a caja</button></div>
      </form>`
      }`,
      { titulo: "Pases", rol: req.rol, activo: "pases" },
    ),
  );
});

rutasGestion.post("/pases", async (req, res) => {
  const repo = await abrirRepo();
  const temporada = await repo.temporadaActiva();
  if (!temporada) {
    res.status(400).send("Sin temporada activa.");
    return;
  }
  const jugador = await repo.jugador(req.body?.jugadorId);
  if (!jugador) {
    res.status(400).send("Ese jugador no existe.");
    return;
  }
  await repo.crearPase({
    jugadorId: jugador.id,
    temporadaId: temporada.id,
    nivel: String(req.body?.nivel ?? "combatiente"),
    precioCentavos: pesosACentavos(String(req.body?.precio ?? "0")),
    desdeFecha: String(req.body?.desdeFecha ?? hoyISO()),
    hastaFecha: String(req.body?.hastaFecha ?? hoyISO()),
    medioPago: String(req.body?.medioPago ?? "") || null,
    referenciaPago: String(req.body?.referenciaPago ?? "") || null,
  });
  await repo.registrar(req.rol, "crear_pase", jugador.nombre);
  res.redirect("/pases");
});

// ---------------- caja ----------------

rutasGestion.get("/caja", async (req, res) => {
  const repo = await abrirRepo();
  const hoy = hoyISO();
  const desde =
    typeof req.query.desde === "string" && req.query.desde ? req.query.desde : `${hoy.slice(0, 7)}-01`;
  const hasta = typeof req.query.hasta === "string" && req.query.hasta ? req.query.hasta : hoy;

  const movimientos = await repo.movimientos({ desde, hasta });
  const resumen = resumirCaja(movimientos);
  const beneficio = beneficioModerador(resumen, config.porcentajeMod);
  const alertaRatio = alertaRatioPremios(resumen);

  const filas = movimientos
    .map(
      (m) => `<tr>
        <td class="mono">${esc(m.fecha)}</td>
        <td style="color:${m.tipo === "ingreso" ? "var(--ok)" : "var(--alerta)"}">${m.tipo === "ingreso" ? "+" : "−"} ${esc(m.tipo)}</td>
        <td>${esc(m.categoria)}</td>
        <td>${esc(m.concepto)}</td>
        <td class="mono">${formatoARS(m.montoCentavos)}</td>
        <td class="tenue">${esc(m.medio ?? "—")}</td>
        <td>${
          req.rol === "admin"
            ? `<form class="inline" method="post" action="/caja/${m.id}/borrar"
                     onsubmit="return confirm('¿Borrar el movimiento?')">
                 <button class="peligro chico">Borrar</button></form>`
            : ""
        }</td>
      </tr>`,
    )
    .join("");

  res.send(
    layout(
      `<h1>Caja</h1>
      <p class="sub">Período ${esc(desde)} a ${esc(hasta)}</p>
      ${alertaRatio ? alerta(alertaRatio.nivel, alertaRatio.mensaje) : ""}
      <form method="get" action="/caja" class="tarjeta">
        <div class="fila">
          <div><label>Desde</label><input type="date" name="desde" value="${esc(desde)}"></div>
          <div><label>Hasta</label><input type="date" name="hasta" value="${esc(hasta)}"></div>
          <div><button type="submit">Filtrar</button></div>
        </div>
      </form>
      <div class="grid g3">
        ${metrica("Ingresos", formatoARS(resumen.ingresosCentavos), config.tipoCambio ? aUSD(resumen.ingresosCentavos, config.tipoCambio) : "")}
        ${metrica("Egresos", formatoARS(resumen.egresosCentavos))}
        ${metrica("Saldo", formatoARS(resumen.saldoCentavos))}
        ${metrica("Premios", formatoARS(resumen.premiosCentavos), resumen.ingresosCentavos ? `${Math.round(resumen.ratioPremios * 100)}% de los ingresos` : "")}
        ${metrica("Beneficio del mod", formatoARS(beneficio), `${Math.round(config.porcentajeMod * 100)}% del saldo`)}
      </div>
      <h2>Movimientos</h2>
      <div class="tarjeta">
        ${
          filas
            ? `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Concepto</th><th>Monto</th><th>Medio</th><th></th></tr></thead><tbody>${filas}</tbody></table>`
            : `<p class="tenue">Sin movimientos en el período.</p>`
        }
      </div>
      <h2>Por categoría</h2>
      <div class="tarjeta">
        ${
          resumen.porCategoria.length
            ? `<table><thead><tr><th>Tipo</th><th>Categoría</th><th>Total</th></tr></thead><tbody>${resumen.porCategoria
                .map(
                  (c) =>
                    `<tr><td>${esc(c.tipo)}</td><td>${esc(c.categoria)}</td><td class="mono">${formatoARS(c.totalCentavos)}</td></tr>`,
                )
                .join("")}</tbody></table>`
            : `<p class="tenue">Sin datos.</p>`
        }
      </div>
      <h3>Cargar movimiento</h3>
      <form method="post" action="/caja" class="tarjeta">
        <div class="fila">
          <div><label>Fecha</label><input type="date" name="fecha" value="${hoy}" required></div>
          <div><label>Tipo</label><select name="tipo">
            <option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select></div>
          <div><label>Categoría</label><select name="categoria">
            ${CATEGORIAS.map(([valor, texto]) => `<option value="${valor}">${esc(texto)}</option>`).join("")}
          </select></div>
          <div><label>Monto ($ ARS)</label><input name="monto" required></div>
        </div>
        <div class="fila">
          <div><label>Concepto</label><input name="concepto" required placeholder="Nitro del mes"></div>
          <div><label>Medio</label><select name="medio">
            <option value="mercadopago">Mercado Pago</option>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="otro">Otro</option></select></div>
          <div><label>Referencia</label><input name="referencia"></div>
        </div>
        <div style="margin-top:14px"><button type="submit">Cargar</button></div>
      </form>`,
      { titulo: "Caja", rol: req.rol, activo: "caja" },
    ),
  );
});

rutasGestion.post("/caja", async (req, res) => {
  const repo = await abrirRepo();
  const tipo = req.body?.tipo === "egreso" ? "egreso" : "ingreso";
  let montoCentavos = 0;
  try {
    montoCentavos = pesosACentavos(String(req.body?.monto ?? "0"));
  } catch {
    res.status(400).send("El monto tiene que ser un número.");
    return;
  }
  await repo.crearMovimiento({
    fecha: String(req.body?.fecha ?? hoyISO()),
    tipo,
    categoria: String(req.body?.categoria ?? "otro"),
    concepto: String(req.body?.concepto ?? "").slice(0, 200),
    montoCentavos,
    medio: String(req.body?.medio ?? "") || null,
    referencia: String(req.body?.referencia ?? "") || null,
    creadoPor: req.rol,
  });
  await repo.registrar(req.rol, "cargar_movimiento", `${tipo} ${req.body?.categoria}`);
  res.redirect("/caja");
});

rutasGestion.post("/caja/:id/borrar", requiereAdmin, async (req, res) => {
  const repo = await abrirRepo();
  await repo.borrarMovimiento(req.params.id);
  await repo.registrar(req.rol, "borrar_movimiento", `#${req.params.id}`);
  res.redirect("/caja");
});
