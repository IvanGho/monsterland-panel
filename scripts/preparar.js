/**
 * Crea el archivo .env para correr el panel en tu máquina, con claves al azar.
 *
 *   npm run preparar
 *
 * Si el .env ya existe, no lo toca. Se puede correr todas las veces que quieras.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const rutaEnv = path.join(raiz, ".env");

if (fs.existsSync(rutaEnv)) {
  console.log("Ya existe el archivo .env, no lo toco.");
  console.log("Si querés regenerar las claves, borralo y volvé a correr: npm run preparar");
  process.exit(0);
}

// Palabras cortas y fáciles de dictar por voz, porque estas claves se comparten por Discord.
const palabras = [
  "kripta", "panteon", "guardian", "sombra", "cuervo", "abismo", "runa", "cripta",
  "eclipse", "ceniza", "faro", "lobo", "hierro", "niebla", "ambar", "espectro",
];

const clave = () => {
  const elegidas = Array.from({ length: 3 }, () => palabras[crypto.randomInt(palabras.length)]);
  return `${elegidas.join("-")}-${crypto.randomInt(1000, 9999)}`;
};

const claveAdmin = clave();
const claveMod = clave();
const secreto = crypto.randomBytes(32).toString("hex");

const contenido = `# Generado por: npm run preparar
# Este archivo NO se sube a GitHub. Guardá estas claves en algún lugar seguro.

ADMIN_PASSWORD=${claveAdmin}
MOD_PASSWORD=${claveMod}
SESSION_SECRET=${secreto}

PORT=3000
NOMBRE_COMUNIDAD=Monsterland

# Sin esto el panel arranca en modo demo (datos en memoria, se borran al cortar el proceso).
# Para guardar de verdad, poné acá la URL de un Postgres:
# DATABASE_URL=postgres://usuario:clave@host:5432/basededatos

# Sólo para mostrar equivalencias en dólares. Actualizalo cuando quieras.
TIPO_CAMBIO_ARS=1520
TIPO_CAMBIO_FECHA=07/08/2026

# Porcentaje del SALDO mensual que se lleva el moderador (0.15 = 15%).
PORCENTAJE_MOD=0.15
`;

fs.writeFileSync(rutaEnv, contenido, { mode: 0o600 });

console.log("Listo. Creé el archivo .env con estas claves:\n");
console.log(`  Clave de ADMIN (vos):        ${claveAdmin}`);
console.log(`  Clave de MOD (tu moderador): ${claveMod}`);
console.log("\nAnotalas ahora. Para arrancar el panel: npm start\n");
