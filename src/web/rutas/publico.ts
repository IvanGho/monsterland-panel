import { Router } from "express";
import { db } from "../../db/index.js";
import { Repo } from "../../db/repo.js";
import { formatoARS } from "../../domain/money.js";
import { esc, layout } from "../layout.js";

/**
 * Vista pública, sin login: para pegar el link en el canal de torneos.
 * No muestra plata de la caja, ni datos personales, ni el estado de pago de nadie.
 * Sólo ranking y próximos torneos, que es lo que la comunidad necesita ver.
 */
export const rutasPublicas = Router();

rutasPublicas.get("/publico/ranking", (_req, res) => {
  const repo = new Repo(db());
  const temporada = repo.temporadaActiva();
  if (!temporada) {
    res.send(layout(`<h1>Ranking</h1><p class="tenue">No hay temporada activa.</p>`, { titulo: "Ranking", publico: true }));
    return;
  }
  const ranking = repo.rankingDeTemporada(temporada.id);
  const nombres = new Map(repo.jugadores().map((j) => [j.id, j.nombre]));

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

  const proximos = repo
    .torneos({ temporadaId: temporada.id })
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

rutasPublicas.get("/salud", (_req, res) => {
  res.json({ ok: true, hora: new Date().toISOString() });
});
