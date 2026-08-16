/**
 * Prueba de humo end-to-end: levanta la app y la usa por HTTP como lo haría una persona.
 *
 *   node scripts/humo.js
 *
 * Cubre lo que los tests unitarios no pueden: que las rutas respondan, que los formularios
 * lleguen parseados, que la cookie de sesión funcione, que los permisos por rol se respeten
 * y que el HTML escape lo que carga el usuario.
 *
 * Por defecto corre en modo demo (datos en memoria), así que no toca ninguna base real.
 * Para probarlo contra un Postgres: DATABASE_URL=... node scripts/humo.js
 */
import http from "node:http";

// La configuración se lee al importar, así que las variables van antes del import.
process.env.ADMIN_PASSWORD ??= "admin-de-prueba-1234";
process.env.MOD_PASSWORD ??= "mod-de-prueba-1234";
process.env.SESSION_SECRET ??= "0123456789abcdef0123456789abcdef";
process.env.NOMBRE_COMUNIDAD ??= "Monsterland";

const { crearApp } = await import("../src/web/app.js");

const app = crearApp();
const servidor = http.createServer(app);
await new Promise((listo) => servidor.listen(0, listo));
const base = `http://127.0.0.1:${servidor.address().port}`;

const fallas = [];
function chequear(nombre, condicion, detalle = "") {
  if (condicion) {
    console.log(`  ok    ${nombre}`);
  } else {
    console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ""}`);
    fallas.push(nombre);
  }
}

const pedir = async (ruta, opciones = {}) => {
  const res = await fetch(base + ruta, { redirect: "manual", ...opciones });
  return { status: res.status, cabeceras: res.headers, cuerpo: await res.text() };
};

const form = (cookie, datos) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) },
  body: new URLSearchParams(datos),
});

async function entrar(clave) {
  const res = await pedir("/login", form(null, { clave, volver: "/" }));
  const cookie = res.cabeceras
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error(`no llegó cookie de sesión (status ${res.status})`);
  return cookie;
}

console.log(`\nPrueba de humo contra ${base}\n`);

// ---------------- arranque y salud ----------------
console.log("arranque");
const salud = await pedir("/salud");
chequear("/salud responde 200", salud.status === 200, `status ${salud.status}`);
chequear("/salud dice que la base está viva", JSON.parse(salud.cuerpo).ok === true, salud.cuerpo);
const config = await pedir("/configuracion");
chequear("/configuracion abre sin login", config.status === 200);
const raiz = await pedir("/");
chequear(
  "el panel exige login",
  raiz.status === 302 && raiz.cabeceras.get("location").startsWith("/login"),
  `status ${raiz.status}`,
);

// ---------------- sesión ----------------
console.log("\nsesión");
const admin = await entrar(process.env.ADMIN_PASSWORD);
const mod = await entrar(process.env.MOD_PASSWORD);
chequear("entra el admin", Boolean(admin));
chequear("entra el mod", Boolean(mod));
const claveMala = await pedir("/login", form(null, { clave: "no-es-la-clave", volver: "/" }));
chequear(
  "rechaza una clave incorrecta",
  claveMala.status === 302 && claveMala.cabeceras.get("location").includes("error=1"),
);
const falsificada = await pedir("/", { headers: { cookie: "panel_sesion=inventado.firmafalsa" } });
chequear("rechaza una cookie falsificada", falsificada.status === 302);

// ---------------- datos de ejemplo ----------------
console.log("\ndatos de ejemplo");
const sembrado = await pedir("/sembrar", form(admin, {}));
chequear("el admin carga datos de ejemplo", sembrado.status === 302, `status ${sembrado.status}`);
const sembradoDeNuevo = await pedir("/sembrar", form(admin, {}));
chequear("sembrar dos veces no duplica", sembradoDeNuevo.status === 400);
const sembradoMod = await pedir("/sembrar", form(mod, {}));
chequear("el mod no puede sembrar", sembradoMod.status === 403);

// ---------------- el panel con datos ----------------
console.log("\npanel");
const hoy = await pedir("/", { headers: { cookie: admin } });
chequear("el panel abre", hoy.status === 200 && hoy.cuerpo.includes("<h1>Hoy</h1>"));
chequear("muestra la temporada activa", hoy.cuerpo.includes("Temporada I"));
const listado = await pedir("/torneos", { headers: { cookie: admin } });
chequear("lista los torneos", listado.cuerpo.includes("Valorant 1v1"));

const idTorneo = Number(listado.cuerpo.match(/\/torneos\/(\d+)/)?.[1]);
chequear("encuentra el id del torneo", Number.isInteger(idTorneo), String(idTorneo));

const ficha = await pedir(`/torneos/${idTorneo}`, { headers: { cookie: admin } });
chequear("la ficha del torneo abre", ficha.status === 200);
chequear("tiene los 8 inscriptos", (ficha.cuerpo.match(/\/checkin/g) ?? []).length === 8);
chequear("la llave está sorteada", ficha.cuerpo.includes("Cuartos"));
chequear("trae los textos para Discord", ficha.cuerpo.includes("Textos para Discord"));

// ---------------- jugar el torneo ----------------
console.log("\njugar el torneo de 8");
// Cuartos: 4 partidos BO1. Se gana con 1-0.
for (let posicion = 0; posicion < 4; posicion++) {
  const pagina = await pedir(`/torneos/${idTorneo}`, { headers: { cookie: admin } });
  const bloque = pagina.cuerpo.split(`name="posicion" value="${posicion}"`)[1] ?? "";
  const ganador = bloque.match(/name="ganadorId"[^>]*>\s*<option value="(\d+)"/)?.[1];
  const res = await pedir(
    `/torneos/${idTorneo}/resultado`,
    form(mod, { ronda: 1, posicion, ganadorId: ganador, scoreA: 1, scoreB: 0 }),
  );
  if (res.status !== 302) console.log(`     (cuartos ${posicion} devolvió ${res.status})`);
}
const trasCuartos = await pedir(`/torneos/${idTorneo}`, { headers: { cookie: admin } });
chequear("se cargaron los cuartos", trasCuartos.cuerpo.includes("Semifinal"));

for (let posicion = 0; posicion < 2; posicion++) {
  const pagina = await pedir(`/torneos/${idTorneo}`, { headers: { cookie: admin } });
  const bloque = pagina.cuerpo.split(`name="posicion" value="${posicion}"`)[2] ?? "";
  const ganador = bloque.match(/name="ganadorId"[^>]*>\s*<option value="(\d+)"/)?.[1];
  await pedir(
    `/torneos/${idTorneo}/resultado`,
    form(mod, { ronda: 2, posicion, ganadorId: ganador, scoreA: 1, scoreB: 0 }),
  );
}

// Final: es BO3, así que 1-0 tiene que ser rechazado.
const paginaFinal = await pedir(`/torneos/${idTorneo}`, { headers: { cookie: admin } });
const bloqueFinal = paginaFinal.cuerpo.split(`name="ronda" value="3"`)[1] ?? "";
const finalista = bloqueFinal.match(/name="ganadorId"[^>]*>\s*<option value="(\d+)"/)?.[1];
const bo3Mal = await pedir(
  `/torneos/${idTorneo}/resultado`,
  form(mod, { ronda: 3, posicion: 0, ganadorId: finalista, scoreA: 1, scoreB: 0 }),
);
chequear("rechaza una final BO3 cargada 1-0", bo3Mal.status === 400 && /BO3/.test(bo3Mal.cuerpo));

const bo3Bien = await pedir(
  `/torneos/${idTorneo}/resultado`,
  form(mod, { ronda: 3, posicion: 0, ganadorId: finalista, scoreA: 2, scoreB: 1 }),
);
chequear("acepta la final 2-1", bo3Bien.status === 302, `status ${bo3Bien.status}`);

const terminado = await pedir(`/torneos/${idTorneo}`, { headers: { cookie: admin } });
chequear("el torneo quedó finalizado", terminado.cuerpo.includes("finalizado"));
chequear("aparece el podio", terminado.cuerpo.includes("Podio"));
chequear("aparece el resultado para Discord", terminado.cuerpo.includes("Resultado final"));

const ganadorInvalido = await pedir(
  `/torneos/${idTorneo}/resultado`,
  form(mod, { ronda: 3, posicion: 0, ganadorId: 999999, scoreA: 2, scoreB: 0 }),
);
chequear("rechaza un ganador que no jugó el partido", ganadorInvalido.status === 400);

// ---------------- ranking ----------------
console.log("\nranking");
const ranking = await pedir("/ranking", { headers: { cookie: admin } });
chequear("el ranking muestra puntos", /<strong>\d+<\/strong>/.test(ranking.cuerpo));
const publico = await pedir("/publico/ranking");
chequear("la vista pública abre sin login", publico.status === 200);
chequear(
  "la vista pública no filtra datos de caja",
  !publico.cuerpo.includes("Beneficio del mod") && !publico.cuerpo.includes("Egresos"),
);

// ---------------- permisos ----------------
console.log("\npermisos por rol");
const premioMod = await pedir(`/torneos/${idTorneo}/pagar-premio`, form(mod, { medio: "gift_card" }));
chequear("el mod no puede pagar el premio", premioMod.status === 403);
const temporadaMod = await pedir("/temporadas", form(mod, { nombre: "Temporada pirata" }));
chequear("el mod no puede crear temporadas", temporadaMod.status === 403);

const premioAdmin = await pedir(
  `/torneos/${idTorneo}/pagar-premio`,
  form(admin, { medio: "gift_card", referencia: "ABC-123" }),
);
chequear("el admin sí puede pagar el premio", premioAdmin.status === 302);
const premioDoble = await pedir(
  `/torneos/${idTorneo}/pagar-premio`,
  form(admin, { medio: "gift_card" }),
);
chequear("no se puede pagar dos veces el mismo premio", premioDoble.status === 400);

// ---------------- caja ----------------
console.log("\ncaja");
const caja = await pedir("/caja", { headers: { cookie: admin } });
chequear("la caja registra el premio como egreso", caja.cuerpo.includes("premio"));
chequear("la caja calcula el beneficio del mod", caja.cuerpo.includes("Beneficio del mod"));
const cajaMod = await pedir("/caja", { headers: { cookie: mod } });
chequear("el mod ve la caja pero sin botón de borrar", !cajaMod.cuerpo.includes("Borrar"));

// ---------------- regla 18+ ----------------
console.log("\nregla 18+");
await pedir(
  "/jugadores",
  form(admin, {
    discordId: "555000111222333",
    discordTag: "@menor",
    nombre: "Sin Edad Confirmada",
    // sin mayorEdad
  }),
);
const jugadores = await pedir("/jugadores", { headers: { cookie: admin } });
chequear("carga un jugador sin 18+", jugadores.cuerpo.includes("Sin Edad Confirmada"));
const duplicado = await pedir(
  "/jugadores",
  form(admin, { discordId: "555000111222333", discordTag: "@otro", nombre: "Repetido" }),
);
chequear("no permite duplicar el ID de Discord", duplicado.status === 400);

// Hay que sacar el id de ESE jugador, no el último de la tabla: la lista está ordenada por
// nombre, así que el último es otro y encima tiene el 18+ confirmado.
const filaMenor = jugadores.cuerpo.split("Sin Edad Confirmada")[1] ?? "";
const idMenor = filaMenor.match(/\/jugadores\/(\d+)\/mayoria/)?.[1];
chequear("encuentra el id del jugador sin 18+", Boolean(idMenor), String(idMenor));
const conPremio = await pedir(
  "/torneos",
  form(admin, {
    nombre: "Torneo con premio",
    juego: "valorant",
    formato: "1v1",
    cupo: 8,
    minimoParticipantes: 2,
    empiezaEn: "2026-09-01T22:00",
    inscripcion: "0",
    premio: "5000",
    premioTipo: "gift_card",
    bestOf: 1,
    bestOfFinal: 1,
    siembra: "sorteo",
  }),
);
const idConPremio = Number(conPremio.cabeceras.get("location")?.match(/(\d+)/)?.[1]);
await pedir(`/torneos/${idConPremio}/estado`, form(admin, { estado: "inscripcion" }));
const rechazado = await pedir(
  `/torneos/${idConPremio}/inscribir`,
  form(admin, { jugadorId: idMenor, pagoOk: "on" }),
);
chequear(
  "bloquea inscribir sin 18+ en un torneo con premio",
  rechazado.status === 400 && /18\+/.test(rechazado.cuerpo),
);

const pistaLibre = await pedir(
  "/torneos",
  form(admin, {
    nombre: "Pista Libre",
    juego: "truco",
    formato: "1v1",
    cupo: 8,
    minimoParticipantes: 2,
    empiezaEn: "2026-09-02T22:00",
    inscripcion: "0",
    premio: "0",
    premioTipo: "especie",
    bestOf: 1,
    bestOfFinal: 1,
    siembra: "sorteo",
  }),
);
const idLibre = Number(pistaLibre.cabeceras.get("location")?.match(/(\d+)/)?.[1]);
await pedir(`/torneos/${idLibre}/estado`, form(admin, { estado: "inscripcion" }));
const aceptado = await pedir(`/torneos/${idLibre}/inscribir`, form(admin, { jugadorId: idMenor }));
chequear("permite inscribir a ese mismo jugador en la Pista Libre", aceptado.status === 302);

const repetido = await pedir(`/torneos/${idLibre}/inscribir`, form(admin, { jugadorId: idMenor }));
chequear("no permite inscribir dos veces al mismo jugador", repetido.status === 400);

// ---------------- validaciones y seguridad ----------------
console.log("\nvalidaciones y seguridad");
const torneoInvalido = await pedir("/torneos", form(admin, { nombre: "x", juego: "no-existe" }));
chequear("rechaza un torneo con datos inválidos", torneoInvalido.status === 400);

await pedir(
  "/jugadores",
  form(admin, {
    discordId: "777",
    discordTag: "@xss",
    nombre: `<script>alert('xss')</script>`,
  }),
);
const conXss = await pedir("/jugadores", { headers: { cookie: admin } });
chequear(
  "escapa el HTML que carga el usuario",
  conXss.cuerpo.includes("&lt;script&gt;") && !conXss.cuerpo.includes("<script>alert("),
);

const inexistente = await pedir("/no/existe", { headers: { cookie: admin } });
chequear("404 en una ruta que no existe", inexistente.status === 404);

const redirectAbierto = await pedir("/login", form(null, { clave: process.env.ADMIN_PASSWORD, volver: "http://malicioso.com" }));
chequear(
  "no permite redirigir a un sitio externo",
  redirectAbierto.cabeceras.get("location") === "/",
  redirectAbierto.cabeceras.get("location"),
);

// ---------------- cierre ----------------
servidor.close();
console.log("");
if (fallas.length > 0) {
  console.log(`FALLARON ${fallas.length} chequeos:\n  - ${fallas.join("\n  - ")}\n`);
  process.exit(1);
}
console.log("TODO OK\n");
process.exit(0);
