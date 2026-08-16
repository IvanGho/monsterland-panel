/**
 * Datos de prueba para poder ver el panel funcionando sin cargar nada a mano.
 * Corré: npm run seed
 *
 * Ojo: agrega datos sobre la base configurada en DB_PATH. Para probar, usá una base aparte:
 *   DB_PATH=./data/prueba.db npm run seed
 */
import { db, hoyISO } from "./db/index.js";
import { Repo } from "./db/repo.js";
import { pesosACentavos } from "./domain/money.js";

const repo = new Repo(db());

// Guarda de seguridad: si ya hay datos, no los ensucio con datos de prueba.
if (repo.temporadas().length > 0) {
  console.log("La base ya tiene datos: no cargo nada de prueba.");
  console.log("Si querés una base limpia de demo, borrá el archivo de la base o usá DB_PATH=./data/prueba.db");
  process.exit(0);
}

const hoy = hoyISO();
const enDias = (dias: number): string => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
};

const temporadaId = repo.crearTemporada({
  nombre: "Temporada I — Kripta",
  desde_fecha: hoy,
  hasta_fecha: enDias(42),
  premio_final_centavos: pesosACentavos("30000"),
});

const nombres = [
  "Nahuel",
  "Brenda",
  "Tomi",
  "Sofi",
  "Lucho",
  "Cami",
  "Fede",
  "Juli",
  "Mati",
  "Ale",
];

const jugadorIds = nombres.map((nombre, indice) =>
  repo.crearJugador({
    discord_id: `10000000000000000${indice}`,
    discord_tag: `@${nombre.toLowerCase()}`,
    nombre,
    riot_id: `${nombre}#ARG`,
    alias_pago: `${nombre.toLowerCase()}.kripta`,
    mayor_edad: true,
    notas: "dato de prueba",
  }),
);

// Dos pases vendidos
for (const jugadorId of jugadorIds.slice(0, 2)) {
  repo.crearPase({
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

const torneoId = repo.crearTorneo({
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

for (const jugadorId of jugadorIds.slice(0, 8)) {
  const jugador = repo.jugador(jugadorId)!;
  const tienePase = repo.tienePaseActivo(jugadorId);
  const participanteId = repo.inscribir({
    torneo_id: torneoId,
    nombre: jugador.nombre,
    jugadorIds: [jugadorId],
    pago_ok: true,
    cubierto_por_pase: tienePase,
    medio_pago: tienePase ? null : "mercadopago",
    referencia_pago: tienePase ? null : `insc-${jugadorId}`,
    inscripcion_centavos: pesosACentavos("2500"),
  });
  repo.marcarPresente(participanteId, true);
}

// Gasto fijo del mes, para que la caja no quede irrealmente linda
repo.crearMovimiento({
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
repo.generarLlave(torneoId, () => {
  contador += 1;
  return (contador * 0.37) % 1;
});

console.log("Datos de prueba cargados:");
console.log(` - Temporada #${temporadaId}`);
console.log(` - Torneo #${torneoId} con 8 inscriptos y llave sorteada`);
console.log(` - ${jugadorIds.length} jugadores, 2 con pase activo`);
console.log("\nEntrá a http://localhost:3000 con la clave de ADMIN_PASSWORD.");
