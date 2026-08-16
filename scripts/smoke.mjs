/**
 * Prueba de humo end-to-end contra un panel ya levantado.
 *
 * Uso:
 *   1) Levantá el panel con datos de prueba:
 *        DB_PATH=./data/smoke.db npm run build && DB_PATH=./data/smoke.db node dist/seed.js
 *        DB_PATH=./data/smoke.db PORT=3111 ADMIN_PASSWORD=... MOD_PASSWORD=... SESSION_SECRET=... node dist/server.js
 *   2) En otra terminal:
 *        BASE=http://localhost:3111 ADMIN=... MOD=... node scripts/smoke.mjs
 *
 * Recorre: permisos por rol, carga de resultados, validación de BO3, regla 18+,
 * pista libre, caja, escapado de HTML y cookie falsificada.
 * NO lo corras contra la base de producción: crea torneos y jugadores de prueba.
 */

const base = process.env.BASE ?? "http://localhost:3111";
const claveAdmin = process.env.ADMIN ?? "admin-prueba-1234";
const claveMod = process.env.MOD ?? "mod-prueba-1234";

async function login(clave) {
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ clave, volver: "/" }),
    redirect: "manual",
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error(`no llegó cookie de sesión para la clave dada (status ${res.status})`);
  return cookie;
}

const get = async (path, cookie) => {
  const res = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  return { status: res.status, html: await res.text() };
};

const post = async (path, cookie, datos) => {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(datos),
    redirect: "manual",
  });
  return { status: res.status, body: res.status >= 400 ? await res.text() : "" };
};

const fallas = [];
const chequear = (nombre, condicion, detalle = "") => {
  if (condicion) console.log(`  ok    ${nombre}`);
  else {
    console.log(`  FALLA ${nombre} ${detalle}`);
    fallas.push(nombre);
  }
};

const admin = await login(claveAdmin);
const mod = await login(claveMod);
console.log("sesiones creadas\n");

console.log("permisos por rol");
chequear(
  "el mod no puede registrar el pago del premio",
  (await post("/torneos/1/pagar-premio", mod, { medio: "gift_card" })).status === 403,
);
chequear(
  "el mod no puede crear temporadas",
  (await post("/temporadas", mod, { nombre: "Trucha", desde_fecha: "2026-01-01", hasta_fecha: "2026-02-01" })).status === 403,
);
chequear("el mod no puede borrar movimientos de caja", (await post("/caja/1/borrar", mod, {})).status === 403);

console.log("\noperación del torneo por el mod");
const torneo = await get("/torneos/1", mod);
chequear("el mod ve el torneo con su llave", torneo.status === 200 && torneo.html.includes("Llave"));

/**
 * Parsea las tarjetas de partido del HTML.
 * Ojo: el panel muestra el formulario también en los partidos ya jugados (para poder corregirlos),
 * así que hay que distinguir los resueltos por la clase "gana" que marca al ganador.
 */
const partidosDelHTML = (html) =>
  html
    .split('<form method="post" action="/torneos/1/resultado"')
    .slice(1)
    .map((bloque) => ({
      ronda: Number(/name="ronda" value="(\d+)"/.exec(bloque)?.[1]),
      posicion: Number(/name="posicion" value="(\d+)"/.exec(bloque)?.[1]),
      a: Number([...bloque.matchAll(/<option value="(\d+)"/g)][0]?.[1]),
      b: Number([...bloque.matchAll(/<option value="(\d+)"/g)][1]?.[1]),
      yaJugado: bloque.slice(0, bloque.indexOf("<form")).includes("lado gana"),
    }));

let jugados = 0;
let finalDelTorneo = null;
for (let vuelta = 0; vuelta < 6; vuelta++) {
  const pagina = await get("/torneos/1", mod);
  // El HTML de la tarjeta viene ANTES del form, así que reviso el bloque previo de cada uno.
  const bloques = pagina.html.split('<div class="partido">').slice(1);
  const pendientes = bloques
    .filter((bloque) => bloque.includes('action="/torneos/1/resultado"') && !bloque.includes("lado gana"))
    .map((bloque) => ({
      ronda: Number(/name="ronda" value="(\d+)"/.exec(bloque)?.[1]),
      posicion: Number(/name="posicion" value="(\d+)"/.exec(bloque)?.[1]),
      a: Number([...bloque.matchAll(/<option value="(\d+)"/g)][0]?.[1]),
      b: Number([...bloque.matchAll(/<option value="(\d+)"/g)][1]?.[1]),
    }));
  if (pendientes.length === 0) break;
  for (const partido of pendientes) {
    const esFinal = partido.ronda === 3;
    if (esFinal) finalDelTorneo = partido;
    const res = await post("/torneos/1/resultado", mod, {
      ronda: partido.ronda,
      posicion: partido.posicion,
      ganador_id: partido.a,
      score_a: esFinal ? 2 : 1,
      score_b: esFinal ? 1 : 0,
    });
    if (res.status === 302) jugados += 1;
  }
}
chequear("se cargaron los 7 partidos del cuadro de 8", jugados === 7, `cargados=${jugados}`);
chequear("el parser encontró la final", finalDelTorneo !== null);

const finalizado = await get("/torneos/1", mod);
chequear("el torneo quedó finalizado", finalizado.html.includes("estado-finalizado"));
chequear("aparece el podio", finalizado.html.includes("Podio"));
chequear("aparece el texto de resultado para Discord", finalizado.html.includes("Campeón:"));

// Intento corregir la final con un score que no alcanza para un BO3: debe rebotar.
const finalMal = await post("/torneos/1/resultado", mod, {
  ronda: 3,
  posicion: 0,
  ganador_id: finalDelTorneo?.a ?? 1,
  score_a: 1,
  score_b: 0,
});
chequear(
  "rechaza una final BO3 cargada 1-0",
  finalMal.status === 400 && finalMal.body.includes("BO3"),
  `status=${finalMal.status}`,
);

// Y un ganador que no jugó ese partido también debe rebotar.
const ganadorIntruso = await post("/torneos/1/resultado", mod, {
  ronda: 3,
  posicion: 0,
  ganador_id: 999999,
  score_a: 2,
  score_b: 0,
});
chequear(
  "rechaza un ganador que no jugó el partido",
  ganadorIntruso.status === 400 && ganadorIntruso.body.includes("uno de los dos"),
  `status=${ganadorIntruso.status}`,
);

console.log("\nranking y vista pública");
chequear(
  "el ranking muestra puntos",
  /<td><strong>\d+<\/strong><\/td>/.test((await get("/ranking", mod)).html),
);
const publico = await get("/publico/ranking", null);
chequear("la vista pública abre sin login", publico.status === 200 && publico.html.includes("Ranking en vivo"));
chequear("la vista pública no filtra datos de caja", !publico.html.includes("Beneficio del mod"));

console.log("\ncaja");
chequear(
  "el admin registra el pago del premio",
  (await post("/torneos/1/pagar-premio", admin, { medio: "gift_card", referencia: "ABC-123" })).status === 302,
);
chequear(
  "no se puede pagar dos veces el mismo premio",
  (await post("/torneos/1/pagar-premio", admin, { medio: "gift_card", referencia: "ABC-123" })).status === 400,
);
const caja = await get("/caja", admin);
chequear("la caja registra el premio como egreso", caja.html.includes("Premio Kripta Valorant"));
chequear("la caja calcula el beneficio del mod", caja.html.includes("Beneficio del mod"));

console.log("\nregla 18+");
await post("/jugadores", admin, {
  discord_id: `9998887776665${Math.floor(Math.random() * 100000)}`,
  discord_tag: "@pibito",
  nombre: "Sin Edad",
});
const listaJugadores = await get("/jugadores", admin);
const idSinEdad = Number(/\/jugadores\/(\d+)\/mayoria/.exec(listaJugadores.html.split("Sin Edad")[1] ?? "")?.[1]);

const crearTorneo = (nombre, inscripcion, premio, fecha) =>
  post("/torneos", admin, {
    nombre,
    juego: "truco",
    formato: "1v1",
    cupo: 8,
    minimo_participantes: 2,
    empieza_en: fecha,
    inscripcion,
    premio,
    premio_tipo: premio === "0" ? "especie" : "gift_card",
    best_of: 1,
    best_of_final: 3,
    siembra: "sorteo",
  });

const ultimoTorneoId = async () => {
  const listado = await get("/torneos", admin);
  return Math.max(...[...listado.html.matchAll(/href="\/torneos\/(\d+)"/g)].map((m) => Number(m[1])));
};

chequear("se creó un torneo con premio", (await crearTorneo("Test 18+", "2500", "5000", "2026-08-25T22:00")).status === 302);
const conPremioId = await ultimoTorneoId();
await post(`/torneos/${conPremioId}/estado`, mod, { estado: "inscripcion" });
const rechazo = await post(`/torneos/${conPremioId}/inscribir`, mod, { jugador_id: String(idSinEdad), pago_ok: "on" });
chequear("bloquea inscribir sin 18+ en torneo con premio", rechazo.status === 400 && rechazo.body.includes("18+"));

chequear("se creó la pista libre", (await crearTorneo("Pista Libre test", "0", "0", "2026-08-26T22:00")).status === 302);
const libreId = await ultimoTorneoId();
await post(`/torneos/${libreId}/estado`, mod, { estado: "inscripcion" });
chequear(
  "permite inscribir al mismo jugador en Pista Libre",
  (await post(`/torneos/${libreId}/inscribir`, mod, { jugador_id: String(idSinEdad) })).status === 302,
);

console.log("\nseguridad");
await post("/jugadores", admin, {
  discord_id: `1112223334445${Math.floor(Math.random() * 100000)}`,
  discord_tag: "@xss",
  nombre: "<script>alert(1)</script>",
  mayor_edad: "on",
});
const conXSS = await get("/jugadores", admin);
chequear(
  "escapa HTML en los nombres",
  conXSS.html.includes("&lt;script&gt;") && !conXSS.html.includes("<script>alert(1)</script>"),
);
const cookieFalsa = "kripta_sesion=eyJyb2wiOiJhZG1pbiIsImV4cGlyYSI6OTk5OTk5OTk5OTk5OX0.firmafalsa";
chequear(
  "rechaza una cookie de sesión falsificada",
  (await fetch(`${base}/caja`, { headers: { cookie: cookieFalsa }, redirect: "manual" })).status === 302,
);

console.log(`\n${fallas.length === 0 ? "TODO OK" : `FALLARON ${fallas.length}: ${fallas.join(", ")}`}`);
process.exit(fallas.length === 0 ? 0 : 1);
