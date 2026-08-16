/**
 * Textos listos para copiar y pegar en Discord.
 *
 * La razón de que esto exista: el trabajo real del mod no es armar la llave, es comunicar.
 * Si tiene que redactar cada anuncio a mano, lo va a hacer mal o tarde. Acá sale hecho,
 * con el aviso de premio fijo incluido en todos los anuncios que mencionan plata.
 */

import { formatoARS } from "../domain/money.js";
import { nombreDeRonda, type Partido } from "../domain/bracket.js";
import type { Participante, Torneo } from "../db/repo.js";
import type { FilaRanking } from "../domain/ranking.js";

const LEYENDA_PREMIO =
  "El premio es fijo, se anuncia antes de abrir la inscripción y lo paga la organización. " +
  "No se forma con las inscripciones: es el mismo con pocos o muchos participantes.";

function fechaLinda(iso: string): string {
  // Espera 'YYYY-MM-DD HH:MM' o ISO. Devuelve algo legible en criollo.
  const limpio = iso.replace("T", " ").slice(0, 16);
  const [fecha, hora = ""] = limpio.split(" ");
  const partes = (fecha ?? "").split("-");
  if (partes.length !== 3) return limpio;
  return `${partes[2]}/${partes[1]} ${hora}hs`;
}

export function anuncioDeInscripcion(torneo: Torneo): string {
  const lineas: string[] = [];
  lineas.push(`**${torneo.nombre}** — ${torneo.juego.toUpperCase()} ${torneo.formato}`);
  lineas.push(`🗓️ Arranca: ${fechaLinda(torneo.empieza_en)}`);
  lineas.push(`👥 Cupo: ${torneo.cupo} (mínimo para que se juegue: ${torneo.minimo_participantes})`);
  if (torneo.inscripcion_centavos > 0) {
    lineas.push(`🎟️ Inscripción: ${formatoARS(torneo.inscripcion_centavos)} (gratis con Pase de Temporada)`);
  } else {
    lineas.push(`🎟️ Inscripción: **gratis** (Pista Libre)`);
  }
  if (torneo.premio_centavos > 0) {
    const tipo =
      torneo.premio_tipo === "gift_card" ? "en gift card" : torneo.premio_tipo === "especie" ? "en especie" : "en efectivo";
    lineas.push(`🏆 Premio: ${formatoARS(torneo.premio_centavos)} ${tipo}${torneo.premio_descripcion ? ` — ${torneo.premio_descripcion}` : ""}`);
  } else {
    lineas.push(`🏆 Premio: rol + puntos de temporada (sin dinero)`);
  }
  lineas.push(`⚔️ Formato: eliminación simple, BO${torneo.best_of} · Final BO${torneo.best_of_final}`);
  lineas.push("");
  lineas.push(`Para anotarte: reaccioná acá y esperá la confirmación del mod.`);
  if (torneo.inscripcion_centavos > 0 || torneo.premio_centavos > 0) {
    lineas.push(`> ⚠️ Torneo 18+. ${LEYENDA_PREMIO}`);
  }
  return lineas.join("\n");
}

export function anuncioDeLlave(
  torneo: Torneo,
  partidos: Partido[],
  nombrePor: Map<number, string>,
): string {
  const rondas = Math.max(...partidos.map((p) => p.ronda));
  const lineas: string[] = [`**${torneo.nombre}** — llave sorteada`, ""];
  for (let ronda = 1; ronda <= rondas; ronda++) {
    const deRonda = partidos.filter((p) => p.ronda === ronda);
    if (deRonda.length === 0) continue;
    lineas.push(`__${nombreDeRonda(ronda, rondas)}__ (BO${deRonda[0]?.bestOf ?? torneo.best_of})`);
    for (const partido of deRonda) {
      const a = partido.a ? (nombrePor.get(partido.a) ?? "?") : "—";
      const b = partido.b ? (nombrePor.get(partido.b) ?? "?") : "—";
      if (partido.estado === "walkover" && (partido.a === null || partido.b === null)) {
        lineas.push(`• ${a !== "—" ? a : b} pasa directo (BYE)`);
      } else if (partido.ganadorId) {
        const ganador = nombrePor.get(partido.ganadorId) ?? "?";
        lineas.push(`• ${a} ${partido.scoreA}-${partido.scoreB} ${b} → **${ganador}**`);
      } else {
        lineas.push(`• ${a} vs ${b}`);
      }
    }
    lineas.push("");
  }
  return lineas.join("\n").trim();
}

export function anuncioDeResultado(
  torneo: Torneo,
  puestos: Array<{ participanteId: number; puesto: number }>,
  nombrePor: Map<number, string>,
): string {
  const campeon = puestos.find((p) => p.puesto === 1);
  const subcampeon = puestos.find((p) => p.puesto === 2);
  const terceros = puestos.filter((p) => p.puesto === 3);
  const lineas: string[] = [`**${torneo.nombre}** — resultado final`, ""];
  if (campeon) lineas.push(`🥇 Campeón: **${nombrePor.get(campeon.participanteId) ?? "?"}**`);
  if (subcampeon) lineas.push(`🥈 Finalista: ${nombrePor.get(subcampeon.participanteId) ?? "?"}`);
  if (terceros.length > 0) {
    lineas.push(`🥉 Semifinalistas: ${terceros.map((t) => nombrePor.get(t.participanteId) ?? "?").join(" y ")}`);
  }
  if (torneo.premio_centavos > 0) {
    lineas.push("");
    lineas.push(`💰 Premio pagado: ${formatoARS(torneo.premio_centavos)}${torneo.premio_descripcion ? ` (${torneo.premio_descripcion})` : ""}`);
  }
  lineas.push("");
  lineas.push(`Los puntos ya están cargados en el ranking de temporada.`);
  return lineas.join("\n");
}

export function anuncioDeRanking(
  nombreTemporada: string,
  ranking: FilaRanking[],
  nombrePor: Map<number, string>,
  limite = 10,
): string {
  const lineas: string[] = [`**Ranking — ${nombreTemporada}**`, ""];
  const medallas = ["🥇", "🥈", "🥉"];
  ranking.slice(0, limite).forEach((fila, indice) => {
    const marca = medallas[indice] ?? `${indice + 1}.`;
    lineas.push(
      `${marca} ${nombrePor.get(fila.jugadorId) ?? "?"} — **${fila.puntos} pts** (${fila.torneos} torneos, ${fila.primeros} títulos)`,
    );
  });
  if (ranking.length === 0) lineas.push("_Todavía no hay resultados cargados._");
  return lineas.join("\n");
}

export function recordatorioDeCheckIn(torneo: Torneo, faltantes: string[]): string {
  const lineas = [
    `⏰ **${torneo.nombre}** arranca ${fechaLinda(torneo.empieza_en)}.`,
    `Hacé check-in en el canal de torneos o quedás afuera de la llave.`,
  ];
  if (faltantes.length > 0) {
    lineas.push("");
    lineas.push(`Falta el check-in de: ${faltantes.join(", ")}`);
  }
  return lineas.join("\n");
}
