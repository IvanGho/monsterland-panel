import { Router } from "express";
import { config } from "../../config.js";
import { abrirRepo, hoyISO } from "../../datos/repo.js";
import {
  alertaRatioPremios,
  alertasDeTorneo,
  beneficioModerador,
  resumirCaja,
} from "../../dominio/caja.js";
import { aUSD, formatoARS } from "../../dominio/dinero.js";
import { requiereLogin } from "../auth.js";
import { alerta, esc, etiquetaEstado, layout, metrica } from "../plantilla.js";

export const rutasPanel = Router();

rutasPanel.get("/", requiereLogin, async (req, res) => {
  const repo = await abrirRepo();
  const hoy = hoyISO();
  const inicioMes = `${hoy.slice(0, 7)}-01`;

  const [temporada, movimientosMes, jugadores] = await Promise.all([
    repo.temporadaActiva(),
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
  const participantesPorTorneo = new Map(
    await Promise.all(
      torneosAbiertos.map(async (t) => [t.id, await repo.participantes(t.id)]),
    ),
  );

  const alertas = [];
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
  for (const aviso of config.avisos) alertas.push(alerta("atencion", aviso));

  for (const torneo of torneosAbiertos) {
    const participantes = participantesPorTorneo.get(torneo.id) ?? [];
    const pagos = participantes.filter((p) => p.pagoOk || p.cubiertoPorPase).length;
    for (const a of alertasDeTorneo({
      inscripcionCentavos: torneo.inscripcionCentavos,
      premioCentavos: torneo.premioCentavos,
      participantesPagos: pagos,
      participantesTotales: participantes.length,
      minimoParticipantes: torneo.minimoParticipantes,
      estado: torneo.estado,
    })) {
      alertas.push(alerta(a.nivel, `${torneo.nombre}: ${a.mensaje}`));
    }
  }

  const filasTorneos = torneosAbiertos
    .map((t) => {
      const participantes = participantesPorTorneo.get(t.id) ?? [];
      const presentes = participantes.filter((p) => p.presente).length;
      return `<tr>
        <td><a href="/torneos/${t.id}">${esc(t.nombre)}</a>
          <div class="tenue" style="font-size:12px">${esc(t.juego)} ${esc(t.formato)}</div></td>
        <td class="mono">${esc(String(t.empiezaEn).replace("T", " "))}</td>
        <td>${participantes.length}/${t.cupo} <span class="tenue">(${presentes} presentes)</span></td>
        <td>${formatoARS(t.premioCentavos)}</td>
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

  // Panel vacío: en vez de mostrar tablas en blanco, ofrecemos el atajo para llenarlo.
  const vacio =
    !temporada && jugadores.length === 0
      ? `<div class="tarjeta">
          <h3>Está todo vacío</h3>
          <p class="tenue">Podés empezar cargando datos de ejemplo para ver cómo funciona, y borrarlos después.
          O arrancar en serio creando una temporada.</p>
          <form method="post" action="/sembrar" class="inline">
            <button type="submit">Cargar datos de ejemplo</button>
          </form>
          <a class="boton secundario" href="/temporadas">Crear una temporada</a>
        </div>`
      : "";

  const contenido = `
    <h1>Hoy</h1>
    <p class="sub">${
      temporada
        ? `Temporada activa: <strong>${esc(temporada.nombre)}</strong> (${esc(temporada.desdeFecha)} a ${esc(temporada.hastaFecha)})`
        : "Sin temporada activa"
    }</p>

    ${alertas.join("")}
    ${vacio}

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
