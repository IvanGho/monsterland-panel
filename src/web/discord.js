/**
 * Textos listos para copiar y pegar en Discord.
 *
 * La razón de que esto exista: el trabajo real del mod no es armar la llave, es comunicar.
 * Si tiene que redactar cada anuncio a mano, lo va a hacer mal o tarde. Acá sale hecho, con
 * el aviso de premio fijo incluido en todos los anuncios que mencionan plata.
 */
import { formatoARS } from "../dominio/dinero.js";
import { nombreDeRonda } from "../dominio/llave.js";

const LEYENDA_PREMIO =
  "El premio es fijo, se anuncia antes de abrir la inscripción y lo paga la organización. " +
  "No se forma con las inscripciones: es el mismo con pocos o muchos participantes.";

function fechaLinda(iso) {
  const limpio = String(iso ?? "").replace("T", " ").slice(0, 16);
  const [fecha, hora = ""] = limpio.split(" ");
  const partes = (fecha ?? "").split("-");
  if (partes.length !== 3) return limpio;
  return `${partes[2]}/${partes[1]} ${hora}hs`;
}

export function anuncioDeInscripcion(torneo) {
  const lineas = [];
  lineas.push(`**${torneo.nombre}** — ${String(torneo.juego).toUpperCase()} ${torneo.formato}`);
  lineas.push(`🗓️ Arranca: ${fechaLinda(torneo.empiezaEn)}`);
  lineas.push(`👥 Cupo: ${torneo.cupo} (mínimo para que se juegue: ${torneo.minimoParticipantes})`);
  if (torneo.inscripcionCentavos > 0) {
    lineas.push(
      `🎟️ Inscripción: ${formatoARS(torneo.inscripcionCentavos)} (gratis con Pase de Temporada)`,
    );
  } else {
    lineas.push(`🎟️ Inscripción: **gratis** (Pista Libre)`);
  }
  if (torneo.premioCentavos > 0) {
    const tipo =
      torneo.premioTipo === "gift_card"
        ? "en gift card"
        : torneo.premioTipo === "especie"
          ? "en especie"
          : "en efectivo";
    lineas.push(
      `🏆 Premio: ${formatoARS(torneo.premioCentavos)} ${tipo}${torneo.premioDescripcion ? ` — ${torneo.premioDescripcion}` : ""}`,
    );
  } else {
    lineas.push(`🏆 Premio: rol + puntos de temporada (sin dinero)`);
  }
  lineas.push(`⚔️ Formato: eliminación simple, BO${torneo.bestOf} · Final BO${torneo.bestOfFinal}`);
  lineas.push("");
  lineas.push(`Para anotarte: reaccioná acá y esperá la confirmación del mod.`);
  if (torneo.inscripcionCentavos > 0 || torneo.premioCentavos > 0) {
    lineas.push(`> ⚠️ Torneo 18+. ${LEYENDA_PREMIO}`);
  }
  return lineas.join("\n");
}

export function anuncioDeLlave(torneo, partidos, nombrePor) {
  if (partidos.length === 0) return "";
  const rondas = Math.max(...partidos.map((p) => p.ronda));
  const lineas = [`**${torneo.nombre}** — llave sorteada`, ""];
  for (let ronda = 1; ronda <= rondas; ronda++) {
    const deRonda = partidos.filter((p) => p.ronda === ronda);
    if (deRonda.length === 0) continue;
    lineas.push(`__${nombreDeRonda(ronda, rondas)}__ (BO${deRonda[0]?.bestOf ?? torneo.bestOf})`);
    for (const partido of deRonda) {
      const a = partido.a ? (nombrePor.get(partido.a) ?? "?") : "—";
      const b = partido.b ? (nombrePor.get(partido.b) ?? "?") : "—";
      if (partido.estado === "walkover" && (partido.a === null || partido.b === null)) {
        lineas.push(`• ${a !== "—" ? a : b} pasa directo (BYE)`);
      } else if (partido.ganadorId) {
        lineas.push(
          `• ${a} ${partido.scoreA}-${partido.scoreB} ${b} → **${nombrePor.get(partido.ganadorId) ?? "?"}**`,
        );
      } else {
        lineas.push(`• ${a} vs ${b}`);
      }
    }
    lineas.push("");
  }
  return lineas.join("\n").trim();
}

export function anuncioDeResultado(torneo, listaPuestos, nombrePor) {
  const campeon = listaPuestos.find((p) => p.puesto === 1);
  const subcampeon = listaPuestos.find((p) => p.puesto === 2);
  const terceros = listaPuestos.filter((p) => p.puesto === 3);
  const lineas = [`**${torneo.nombre}** — resultado final`, ""];
  if (campeon) lineas.push(`🥇 Campeón: **${nombrePor.get(campeon.participanteId) ?? "?"}**`);
  if (subcampeon) lineas.push(`🥈 Finalista: ${nombrePor.get(subcampeon.participanteId) ?? "?"}`);
  if (terceros.length > 0) {
    lineas.push(
      `🥉 Semifinalistas: ${terceros.map((t) => nombrePor.get(t.participanteId) ?? "?").join(" y ")}`,
    );
  }
  if (torneo.premioCentavos > 0) {
    lineas.push("");
    lineas.push(
      `💰 Premio pagado: ${formatoARS(torneo.premioCentavos)}${torneo.premioDescripcion ? ` (${torneo.premioDescripcion})` : ""}`,
    );
  }
  lineas.push("");
  lineas.push(`Los puntos ya están cargados en el ranking de temporada.`);
  return lineas.join("\n");
}

export function anuncioDeRanking(nombreTemporada, ranking, nombrePor, limite = 10) {
  const lineas = [`**Ranking — ${nombreTemporada}**`, ""];
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

export function recordatorioDeCheckIn(torneo, faltantes) {
  const lineas = [
    `⏰ **${torneo.nombre}** arranca ${fechaLinda(torneo.empiezaEn)}.`,
    `Hacé check-in en el canal de torneos o quedás afuera de la llave.`,
  ];
  if (faltantes.length > 0) {
    lineas.push("");
    lineas.push(`Falta el check-in de: ${faltantes.join(", ")}`);
  }
  return lineas.join("\n");
}
