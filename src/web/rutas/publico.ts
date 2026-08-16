import { Router } from "express";
import { abrirRepo } from "../../db/repo.js";
import { formatoARS } from "../../domain/money.js";
import { esc, layout } from "../layout.js";

/**
 * Vista pública, sin login: para pegar el link en el canal de torneos.
 * No muestra plata de la caja, ni datos personales, ni el estado de pago de nadie.
 * Sólo ranking y próximos torneos, que es lo que la comunidad necesita ver.
 */
export const rutasPublicas = Router();

rutasPublicas.get("/publico/ranking", async (_req, res) => {
  const repo = await abrirRepo();
  const temporada = await repo.temporadaActiva();
  if (!temporada) {
    res.send(
      layout(`<h1>Ranking</h1><p class="tenue">No hay temporada activa.</p>`, {
        titulo: "Ranking",
        publico: true,
      }),
    );
    return;
  }
  const [ranking, jugadores, torneos] = await Promise.all([
    repo.rankingDeTemporada(temporada.id),
    repo.jugadores(),
    repo.torneos({ temporadaId: temporada.id }),
  ]);
  const nombres = new Map(jugadores.map((j) => [j.id, j.nombre]));

  const filas = ranking
    .map(
      (f, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(nombres.get(f.jugadorId) ?? "?")}</td>
        <td><strong>${f.puntos}</strong></td>
        <td>${f.torneos}</td>
        <td>${f.primeros}</td>
      </tr>`,
    )
    .join("");

  const proximos = torneos
    .filter((t) => ["inscripcion", "en_juego"].includes(t.estado))
    .map(
      (t) => `<tr>
        <td>${esc(t.nombre)}</td>
        <td>${esc(t.juego)} ${esc(t.formato)}</td>
        <td class="mono">${esc(t.empieza_en.replace("T", " "))}</td>
        <td>${t.inscripcion_centavos > 0 ? formatoARS(t.inscripcion_centavos) : "gratis"}</td>
        <td>${t.premio_centavos > 0 ? formatoARS(t.premio_centavos) : "rol + puntos"}</td>
      </tr>`,
    )
    .join("");

  res.send(
    layout(
      `<h1>${esc(temporada.nombre)}</h1>
      <p class="sub">Ranking en vivo · ${esc(temporada.desde_fecha)} a ${esc(temporada.hasta_fecha)}${temporada.premio_final_centavos > 0 ? ` · premio final ${formatoARS(temporada.premio_final_centavos)}` : ""}</p>
      <div class="tarjeta">
        ${filas ? `<table><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Torneos</th><th>Títulos</th></tr></thead><tbody>${filas}</tbody></table>` : `<p class="tenue">Todavía no se jugó nada de esta temporada.</p>`}
      </div>
      <h2>Próximos torneos</h2>
      <div class="tarjeta">
        ${proximos ? `<table><thead><tr><th>Torneo</th><th>Juego</th><th>Arranca</th><th>Inscripción</th><th>Premio fijo</th></tr></thead><tbody>${proximos}</tbody></table>` : `<p class="tenue">No hay torneos abiertos ahora.</p>`}
      </div>
      <p class="tenue" style="font-size:12px">
        El premio de cada torneo es fijo, se anuncia antes de abrir la inscripción y lo paga la organización:
        no se forma con las inscripciones y no cambia según cuánta gente se anote.
        Los torneos con inscripción o premio son sólo para mayores de 18.
      </p>`,
      { titulo: `Ranking ${temporada.nombre}`, publico: true },
    ),
  );
});

/**
 * Chequeo de salud. Toca la base a propósito: si la conexión con Turso está mal,
 * queremos que este endpoint lo diga en vez de devolver ok sin haber probado nada.
 */
rutasPublicas.get("/salud", async (_req, res) => {
  try {
    const repo = await abrirRepo();
    await repo.temporadas();
    res.json({ ok: true, base: "conectada", hora: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({
      ok: false,
      base: "sin conexión",
      detalle: error instanceof Error ? error.message : String(error),
      hora: new Date().toISOString(),
    });
  }
});
