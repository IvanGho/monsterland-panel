/**
 * Configuración del panel.
 *
 * Regla número uno de este archivo: **no tira errores y no corta el proceso**.
 *
 * La versión anterior de este panel hacía `process.exit(1)` cuando faltaba una variable de
 * entorno. En tu PC eso está bien (ves el mensaje en la terminal), pero en Vercel el proceso
 * es compartido y matarlo se ve como un error genérico sin explicación: el deploy "no
 * funciona" y no hay forma de saber por qué. Acá, si falta algo, la app arranca igual y te
 * lo dice en la pantalla.
 */
import crypto from "node:crypto";
import path from "node:path";

/**
 * Carga el archivo .env de la raíz del repo, si existe.
 *
 * Por qué existe esto: `npm run preparar` escribe un .env con las claves, y el README te dice
 * `npm run preparar && npm start`. Pero Node no lee .env solo, y acá no hay `dotenv` (el stack
 * es chico a propósito). Sin esta función el .env se ignoraba **en silencio**: configurabas
 * todo, arrancabas, y el panel seguía en modo demo con las claves "demo" / "demo-mod" sin
 * decirte por qué. Era el bug más molesto del proyecto porque no daba ninguna señal.
 *
 * `process.loadEnvFile` (Node 20.12+) **no pisa** las variables que ya están en el entorno.
 * Eso es justo lo que queremos: en Vercel mandan las variables del proyecto, y el .env sólo
 * rellena lo que falta cuando corrés en tu máquina.
 *
 * Va envuelto en try/catch por la regla número uno de este archivo: si el .env no existe, o
 * tiene una línea mal escrita, o no se puede leer, la app arranca igual.
 */
function cargarArchivoEnv() {
  const ruta = path.resolve(import.meta.dirname, "..", ".env");
  try {
    process.loadEnvFile(ruta);
    return { cargado: true, ruta, error: "" };
  } catch (error) {
    // ENOENT es el caso normal y esperado: en Vercel no hay .env y no hace falta.
    if (error?.code === "ENOENT") return { cargado: false, ruta, error: "" };
    return { cargado: false, ruta, error: error?.message ?? String(error) };
  }
}

const archivoEnv = cargarArchivoEnv();

/** Devuelve la primera variable de entorno que tenga algo. */
function primera(...nombres) {
  for (const nombre of nombres) {
    const valor = process.env[nombre];
    if (typeof valor === "string" && valor.trim() !== "") return valor.trim();
  }
  return "";
}

const enVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);

/**
 * URL de Postgres. Aceptamos varios nombres porque cada proveedor pone el suyo:
 * la integración de Neon en Vercel inyecta DATABASE_URL, otras ponen POSTGRES_URL.
 * Preferimos las variantes "pooled" porque en serverless cada invocación abre conexión.
 */
const urlPostgres = primera(
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
);

/**
 * Sin base configurada entramos en modo demo: los datos viven en memoria.
 * Sirve para que el deploy ande y puedas ver el panel funcionando en el minuto uno,
 * pero no es para usar en serio (ver el aviso que muestra la interfaz).
 */
const modoDemo = urlPostgres === "";

const claveAdminConfigurada = primera("ADMIN_PASSWORD");
const claveModConfigurada = primera("MOD_PASSWORD");
const secretoConfigurado = primera("SESSION_SECRET");

/**
 * En modo demo no hay nada que proteger (los datos son inventados y se borran solos),
 * así que usamos claves conocidas y las mostramos en pantalla. Con una base de verdad
 * configurada esto NO pasa: ahí las claves son obligatorias.
 */
const claveAdmin = claveAdminConfigurada || (modoDemo ? "demo" : "");
const claveMod = claveModConfigurada || (modoDemo ? "demo-mod" : "");

/**
 * Si no hay secreto, generamos uno al azar para que las cookies funcionen igual.
 * El costo: cada instancia firma distinto, así que te desloguea seguido. Aceptable para
 * probar, no para usar. Por eso queda avisado en `avisos`.
 */
const secretoSesion = secretoConfigurado || crypto.randomBytes(32).toString("hex");

/** Lo que impide usar el panel. Si esto no está vacío, se muestra la página de configuración. */
const faltantes = [];
if (!modoDemo) {
  if (!claveAdminConfigurada) faltantes.push("ADMIN_PASSWORD");
  if (!claveModConfigurada) faltantes.push("MOD_PASSWORD");
}

/** Lo que conviene arreglar pero no impide usar el panel. */
const avisos = [];
if (modoDemo) {
  avisos.push(
    "Modo demo: los datos viven en memoria y se borran solos. Configurá DATABASE_URL para que queden guardados.",
  );
}
if (!secretoConfigurado && !modoDemo) {
  avisos.push(
    "Falta SESSION_SECRET, así que se generó uno al azar: te va a desloguear cada tanto. Configuralo para que las sesiones duren.",
  );
}
if (!modoDemo && claveAdminConfigurada && claveAdminConfigurada === claveModConfigurada) {
  avisos.push("ADMIN_PASSWORD y MOD_PASSWORD son iguales: el rol de moderador no está limitando nada.");
}
if (archivoEnv.error) {
  avisos.push(
    `Hay un archivo .env pero no se pudo leer, así que se está ignorando: ${archivoEnv.error}`,
  );
}

export const config = {
  puerto: Number(process.env.PORT ?? 3000),
  enVercel,
  modoDemo,
  /** ¿Se leyó un archivo .env? Sirve para explicar de dónde salió la configuración. */
  usaArchivoEnv: archivoEnv.cargado,
  urlPostgres,
  claveAdmin,
  claveMod,
  secretoSesion,
  faltantes,
  avisos,
  /** ¿Se puede entrar al panel? En demo sí; con base real, sólo si están las claves. */
  usable: faltantes.length === 0,
  nombreComunidad: primera("NOMBRE_COMUNIDAD") || "Monsterland",
  /** Sólo para mostrar equivalencias en dólares. Se actualiza a mano. */
  tipoCambio: Number(process.env.TIPO_CAMBIO_ARS ?? 0),
  tipoCambioFecha: primera("TIPO_CAMBIO_FECHA") || "sin fecha",
  /** Porcentaje del saldo mensual que se lleva el moderador (0.15 = 15%). */
  porcentajeMod: Number(process.env.PORCENTAJE_MOD ?? 0.15),
  /**
   * Cantidad de miembros del Discord, para mostrar en el sitio público.
   *
   * El panel no puede saberlo: sólo conoce a los jugadores que alguien cargó a mano, que son
   * los que compitieron. Hoy son 8 contra ~140 miembros reales, así que sin esto el sitio
   * pasaría a anunciar "8 miembros" el día que se conecte la API y se vería muerto.
   *
   * Se actualiza a mano, igual que el tipo de cambio. Cuando exista el bot de Discord, el
   * número sale de la API de Discord y esta variable se puede borrar.
   */
  miembrosDiscord: Number(process.env.MIEMBROS_DISCORD ?? 0),
};
