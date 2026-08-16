import { Router } from "express";
import { config } from "../../config.js";
import { hoyISO } from "../../db/index.js";
import { abrirRepo, type Participante } from "../../db/repo.js";
import { alertaRatioPremios, alertasDeTorneo, beneficioModerador, resumirCaja } from "../../domain/caja.js";
import { aUSD, formatoARS } from "../../domain/money.js";
import { claveCoincide, limpiarCookieSesion, requiereLogin, setCookieSesion } from "../auth.js";
import { alerta, esc, etiquetaEstado, layout, metrica } from "../layout.js";

export const rutasPanel = Router();

rutasPanel.get("/login", (req, res) => {
  const volver = typeof req.query.volver === "string" ? req.query.volver : "/";
  const error = req.query.error === "1";
  res.send(
    layout(
      `<div class="tarjeta" style="max-width:420px;margin:60px auto">
        <h1>Entrar a la Kripta</h1>
        <p class="sub">Panel de torneos de ${esc(config.nombreComunidad)}.</p>
        ${error ? alerta("grave", "Clave incorrecta.") : ""}
        <form method="post" action="/login">
          <input type="hidden" name="volver" value="${esc(volver)}">
          <label>Clave</label>
          <input type="password" name="clave" autofocus required>
          <div style="margin-top:14px"><button type="submit">Entrar</button></div>
        </form>
        <p class="tenue" style="margin-top:14px;font-size:12px">
          Hay dos claves: la del dueño (admin) y la del moderador (mod). El mod puede operar torneos y cargar cobros;
          crear temporadas, tocar precios y borrar movimientos de caja es sólo del admin.
        </p>
      </div>`,
      { titulo: "Entrar", publico: true },
    ),
  );
});

rutasPanel.post("/login", (req, res) => {
  const clave = String(req.body?.clave ?? "");
  const volver = String(req.body?.volver ?? "/");
  const destino = volver.startsWith("/") ? volver : "/";
  if (claveCoincide(clave, config.claveAdmin)) {
    setCookieSesion(res, "admin");
    res.redirect(destino);
    return;
  }
  if (claveCoincide(clave, config.claveMod)) {
    setCookieSesion(res, "mod");
    res.redirect(destino);
    return;
  }
  res.redirect(`/login?error=1&volver=${encodeURIComponent(destino)}`);
});

rutasPanel.get("/salir", (_req, res) => {
  limpiarCookieSesion(res);
  res.redirect("/login");
});

rutasPanel.get("/", requiereLogin, async (req, res) => {
  const repo = await abrirRepo();
  const temporada = await repo.temporadaActiva();
  const hoy = hoyISO();
  const inicioMes = `${hoy.slice(0, 7)}-01`;

  const [movimientosMes, jugadores] = await Promise.all([
    repo.movimientos({ desde: inicioMes, hasta: hoy }),
    repo.jugadores(),
  ]);
  const resumen = resumirCaja(movimientosMes);
  const beneficio = beneficioModerador(resumen, config.porcentajeMod);

  const torneosAbiertos = temporada
    ? (await repo.torneos({ temporadaId: temporada.id })).filter((t) =>
        ["borrador", "inscripcion", "en_juego"].includes(t.estado),
      )
    : [];

  // Los inscriptos de cada torneo se usan dos veces (alertas y tabla): una sola carga.
  const participantesPorTorneo = new Map<number, Participante[]>(
    await Promise.all(
      torneosAbiertos.map(
        async (t) => [t.id, await repo.participantes(t.id)] as [number, Participante[]],
      ),
    ),
  );

  const alertas: string[] = [];
  const alertaRatio = alertaRatioPremios(resumen);
  if (alertaRatio) alertas.push(alerta(alertaRatio.nivel, alertaRatio.mensaje));
  if (!temporada) {
    alertas.push(
      alerta(
        "atencion",
        "No hay temporada activa. Creá una en Temporadas: sin temporada no se pueden crear torneos ni acumular ranking.",
      ),
    );
  }

  for (const torneo of torneosAbiertos) {
    const participantes = participantesPorTorneo.get(torneo.id) ?? [];
    const pagos = participantes.filter((p) => p.pago_ok === 1 || p.cubierto_por_pase === 1).length;
    for (const a of alertasDeTorneo({
      inscripcionCentavos: torneo.inscripcion_centavos,
      premioCentavos: torneo.premio_centavos,
      participantesPagos: pagos,
      participantesTotales: participantes.length,
      minimoParticipantes: torneo.minimo_participantes,
      estado: torneo.estado,
    })) {
      alertas.push(alerta(a.nivel, `${torneo.nombre}: ${a.mensaje}`));
    }
  }

  const filasTorneos = torneosAbiertos
    .map((t) => {
      const participantes = participantesPorTorneo.get(t.id) ?? [];
      const presentes = participantes.filter((p) => p.presente === 1).length;
      return `<tr>
        <td><a href="/torneos/${t.id}">${esc(t.nombre)}</a><div class="tenue" style="font-size:12px">${esc(t.juego)} ${esc(t.formato)}</div></td>
        <td class="mono">${esc(t.empieza_en.replace("T", " "))}</td>
        <td>${participantes.length}/${t.cupo} <span class="tenue">(${presentes} presentes)</span></td>
        <td>${formatoARS(t.premio_centavos)}</td>
        <td>${etiquetaEstado(t.estado)}</td>
      </tr>`;
    })
    .join("");

  const ranking = temporada ? await repo.rankingDeTemporada(temporada.id) : [];
  const nombres = new Map(jugadores.map((j) => [j.id, j.nombre]));
  const filasRanking = ranking
    .slice(0, 5)
    .map(
      (f, i) =>
        `<tr><td>${i + 1}</td><td>${esc(nombres.get(f.jugadorId) ?? "?")}</td><td>${f.puntos}</td><td>${f.torneos}</td><td>${f.primeros}</td></tr>`,
    )
    .join("");

  const contenido = `
    <h1>Hoy</h1>
    <p class="sub">${temporada ? `Temporada activa: <strong>${esc(temporada.nombre)}</strong> (${esc(temporada.desde_fecha)} a ${esc(temporada.hasta_fecha)})` : "Sin temporada activa"}</p>

    ${alertas.join("")}

    <div class="grid g3">
      ${metrica("Ingresos del mes", formatoARS(resumen.ingresosCentavos), config.tipoCambio ? `${aUSD(resumen.ingresosCentavos, config.tipoCambio)} · TC ${config.tipoCambioFecha}` : "")}
      ${metrica("Egresos del mes", formatoARS(resumen.egresosCentavos))}
      ${metrica("Saldo", formatoARS(resumen.saldoCentavos))}
      ${metrica("Premios / ingresos", resumen.ingresosCentavos ? `${Math.round(resumen.ratioPremios * 100)}%` : "s/d", "límite sugerido 70%")}
      ${metrica("Beneficio del mod", formatoARS(beneficio), `${Math.round(config.porcentajeMod * 100)}% del saldo`)}
      ${metrica("Torneos abiertos", String(torneosAbiertos.length))}
    </div>

    <h2>Torneos en curso</h2>
    <div class="tarjeta">
      ${
        filasTorneos
          ? `<table><thead><tr><th>Torneo</th><th>Arranca</th><th>Inscriptos</th><th>Premio</th><th>Estado</th></tr></thead><tbody>${filasTorneos}</tbody></table>`
          : `<p class="tenue">No hay torneos abiertos. <a href="/torneos/nuevo">Crear uno</a>.</p>`
      }
    </div>

    <h2>Top 5 de la temporada</h2>
    <div class="tarjeta">
      ${
        filasRanking
          ? `<table><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Torneos</th><th>Títulos</th></tr></thead><tbody>${filasRanking}</tbody></table>`
          : `<p class="tenue">Todavía no hay resultados cargados.</p>`
      }
      <p style="margin-top:12px"><a class="boton secundario chico" href="/ranking">Ver ranking completo</a></p>
    </div>
  `;

  res.send(layout(contenido, { titulo: "Hoy", rol: req.rol, activo: "hoy" }));
});
