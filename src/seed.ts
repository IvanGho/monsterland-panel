/**
 * Datos de prueba para poder ver el panel funcionando sin cargar nada a mano.
 * Corré: npm run seed
 *
 * Ojo: agrega datos sobre la base configurada (DB_PATH o TURSO_DATABASE_URL).
 * Para probar sin ensuciar la real, usá una base aparte:
 *   DB_PATH=./data/prueba.db npm run seed
 */
import { db, hoyISO } from "./db/index.js";
import { Repo } from "./db/repo.js";
import { pesosACentavos } from "./domain/money.js";

const enDias = (dias: number): string => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
};

async function main(): Promise<void> {
  const repo = new Repo(await db());

  // Guarda de seguridad: si ya hay datos, no los ensucio con datos de prueba.
  if ((await repo.temporadas()).length > 0) {
    console.log("La base ya tiene datos: no cargo nada de prueba.");
    console.log(
      "Si querés una base limpia de demo, borrá el archivo de la base o usá DB_PATH=./data/prueba.db",
    );
    return;
  }

  const hoy = hoyISO();

  const temporadaId = await repo.crearTemporada({
    nombre: "Temporada I — Kripta",
    desde_fecha: hoy,
    hasta_fecha: enDias(42),
    premio_final_centavos: pesosACentavos("30000"),
  });

  const nombres = ["Nahuel", "Brenda", "Tomi", "Sofi", "Lucho", "Cami", "Fede", "Juli", "Mati", "Ale"];

  const jugadorIds: number[] = [];
  for (const [indice, nombre] of nombres.entries()) {
    jugadorIds.push(
      await repo.crearJugador({
        discord_id: `10000000000000000${indice}`,
        discord_tag: `@${nombre.toLowerCase()}`,
        nombre,
        riot_id: `${nombre}#ARG`,
        alias_pago: `${nombre.toLowerCase()}.kripta`,
        mayor_edad: true,
        notas: "dato de prueba",
      }),
    );
  }

  // Dos pases vendidos
  for (const jugadorId of jugadorIds.slice(0, 2)) {
    await repo.crearPase({
      jugador_id: jugadorId,
      temporada_id: temporadaId,
      nivel: "combatiente",
      precio_centavos: pesosACentavos("7000"),
      desde_fecha: hoy,
      hasta_fecha: enDias(30),
      medio_pago: "mercadopago",
      referencia_pago: "prueba-001",
    });
  }

  const torneoId = await repo.crearTorneo({
    temporada_id: temporadaId,
    nombre: "Kripta Valorant 1v1 — Semana 1",
    juego: "valorant",
    formato: "1v1",
    cupo: 8,
    minimo_participantes: 6,
    empieza_en: `${hoy} 22:00`,
    inscripcion_centavos: pesosACentavos("2500"),
    premio_centavos: pesosACentavos("6000"),
    premio_tipo: "gift_card",
    premio_descripcion: "Gift card Steam",
    best_of: 1,
    best_of_final: 3,
    siembra: "sorteo",
    estado: "inscripcion",
  });

  const conPase = await repo.jugadoresConPaseActivo();
  for (const jugadorId of jugadorIds.slice(0, 8)) {
    const jugador = (await repo.jugador(jugadorId))!;
    const tienePase = conPase.has(jugadorId);
    const participanteId = await repo.inscribir({
      torneo_id: torneoId,
      nombre: jugador.nombre,
      jugadorIds: [jugadorId],
      pago_ok: true,
      cubierto_por_pase: tienePase,
      medio_pago: tienePase ? null : "mercadopago",
      referencia_pago: tienePase ? null : `insc-${jugadorId}`,
      inscripcion_centavos: pesosACentavos("2500"),
    });
    await repo.marcarPresente(participanteId, true);
  }

  // Gasto fijo del mes, para que la caja no quede irrealmente linda
  await repo.crearMovimiento({
    fecha: hoy,
    tipo: "egreso",
    categoria: "infra",
    concepto: "Nitro + boosts",
    monto_centavos: pesosACentavos("9120"),
    medio: "mercadopago",
    creado_por: "seed",
  });

  // Semilla fija para que la llave de prueba sea siempre la misma
  let contador = 0;
  await repo.generarLlave(torneoId, () => {
    contador += 1;
    return (contador * 0.37) % 1;
  });

  console.log("Datos de prueba cargados:");
  console.log(` - Temporada #${temporadaId}`);
  console.log(` - Torneo #${torneoId} con 8 inscriptos y llave sorteada`);
  console.log(` - ${jugadorIds.length} jugadores, 2 con pase activo`);
  console.log("\nEntrá a http://localhost:3000 con la clave de ADMIN_PASSWORD.");
}

main().catch((error: unknown) => {
  console.error("Falló la carga de datos de prueba:", error);
  process.exit(1);
});
