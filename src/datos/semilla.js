/**
 * Datos de ejemplo.
 *
 * Sirve para dos cosas: que puedas ver el panel con contenido al minuto de desplegarlo, y
 * que se pueda probar el flujo completo sin cargar veinte formularios a mano.
 *
 * Es idempotente por diseño: si ya hay una temporada, no toca nada. Así el botón "cargar
 * datos de ejemplo" no puede duplicar información ni ensuciar datos reales.
 */
import { pesosACentavos } from "../dominio/dinero.js";
import { hoyISO } from "./repo.js";

const enDias = (dias) => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
};

export async function sembrar(repo) {
  if ((await repo.temporadas()).length > 0) {
    return { ok: false, motivo: "La base ya tiene datos: no cargo nada de ejemplo." };
  }

  const hoy = hoyISO();
  const temporada = await repo.crearTemporada({
    nombre: "Temporada I",
    desdeFecha: hoy,
    hastaFecha: enDias(42),
    premioFinalCentavos: pesosACentavos("30000"),
  });

  const nombres = ["Nahuel", "Brenda", "Tomi", "Sofi", "Lucho", "Cami", "Fede", "Juli"];
  const jugadores = [];
  for (const [indice, nombre] of nombres.entries()) {
    jugadores.push(
      await repo.crearJugador({
        discordId: `10000000000000000${indice}`,
        discordTag: `@${nombre.toLowerCase()}`,
        nombre,
        riotId: `${nombre}#ARG`,
        aliasPago: `${nombre.toLowerCase()}.panel`,
        mayorEdad: true,
        notas: "dato de ejemplo",
      }),
    );
  }

  // Dos pases vendidos, que además entran solos a la caja.
  for (const jugador of jugadores.slice(0, 2)) {
    await repo.crearPase({
      jugadorId: jugador.id,
      temporadaId: temporada.id,
      nivel: "combatiente",
      precioCentavos: pesosACentavos("7000"),
      desdeFecha: hoy,
      hastaFecha: enDias(30),
      medioPago: "mercadopago",
      referenciaPago: "ejemplo-001",
    });
  }

  const torneo = await repo.crearTorneo({
    temporadaId: temporada.id,
    nombre: "Valorant 1v1 — Semana 1",
    juego: "valorant",
    formato: "1v1",
    cupo: 8,
    minimoParticipantes: 6,
    empiezaEn: `${hoy}T22:00`,
    inscripcionCentavos: pesosACentavos("2500"),
    premioCentavos: pesosACentavos("6000"),
    premioTipo: "gift_card",
    premioDescripcion: "Gift card Steam",
    bestOf: 1,
    bestOfFinal: 3,
    siembra: "sorteo",
    estado: "inscripcion",
  });

  const conPase = await repo.jugadoresConPaseActivo();
  for (const jugador of jugadores) {
    const tienePase = conPase.has(jugador.id);
    const participante = await repo.inscribir({
      torneoId: torneo.id,
      nombre: jugador.nombre,
      jugadorIds: [jugador.id],
      pagoOk: true,
      cubiertoPorPase: tienePase,
      medioPago: tienePase ? null : "mercadopago",
      referenciaPago: tienePase ? null : `insc-${jugador.id}`,
      inscripcionCentavos: pesosACentavos("2500"),
    });
    await repo.marcarPresente(participante.id, true);
  }

  // Un gasto fijo, para que la caja no quede irrealmente linda.
  await repo.crearMovimiento({
    fecha: hoy,
    tipo: "egreso",
    categoria: "infra",
    concepto: "Nitro + boosts",
    montoCentavos: pesosACentavos("9120"),
    medio: "mercadopago",
    creadoPor: "ejemplo",
  });

  // Semilla fija para que la llave de ejemplo salga siempre igual.
  let contador = 0;
  await repo.generarLlave(torneo.id, () => {
    contador += 1;
    return (contador * 0.37) % 1;
  });

  return { ok: true, torneoId: torneo.id, temporadaId: temporada.id };
}
