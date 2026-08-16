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

export const config = {
  puerto: Number(process.env.PORT ?? 3000),
  enVercel,
  modoDemo,
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
};
