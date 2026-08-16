import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const aca = path.dirname(fileURLToPath(import.meta.url));

/**
 * ¿Estamos corriendo en un entorno serverless de solo-lectura (Vercel)?
 * Vercel define VERCEL=1 tanto en el build como en runtime.
 */
const enVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);

/**
 * URL de la base remota. Aceptamos varios nombres porque cada proveedor pone el suyo:
 * la integración de Turso en Vercel inyecta TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
 */
const urlRemota =
  process.env.TURSO_DATABASE_URL ??
  process.env.LIBSQL_URL ??
  process.env.DATABASE_URL ??
  "";

const tokenRemoto = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN ?? "";

/** Ruta del archivo SQLite local. Sólo se usa cuando NO hay base remota configurada. */
const rutaDB = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(aca, "..", "data", "monsterland.db");

/**
 * La base puede ser un archivo local (desarrollo, o un server con disco propio) o
 * una base libSQL/Turso por red (obligatorio en Vercel: allá el disco es descartable).
 */
const dbEsRemota = urlRemota.length > 0;

export const config = {
  puerto: Number(process.env.PORT ?? 3000),
  rutaBase: path.resolve(aca, ".."),
  rutaDB,
  dbEsRemota,
  enVercel,
  /** URL que entiende @libsql/client: `libsql://...` / `https://...` o `file:///...`. */
  urlDB: dbEsRemota ? urlRemota : pathToFileURL(rutaDB).href,
  tokenDB: tokenRemoto,
  claveAdmin: process.env.ADMIN_PASSWORD ?? "",
  claveMod: process.env.MOD_PASSWORD ?? "",
  secretoSesion: process.env.SESSION_SECRET ?? "",
  /** Sólo para mostrar valores de referencia en USD. Actualizalo a mano cuando quieras. */
  tipoCambio: Number(process.env.TIPO_CAMBIO_ARS ?? 0),
  tipoCambioFecha: process.env.TIPO_CAMBIO_FECHA ?? "sin fecha",
  /** Porcentaje del saldo mensual que se lleva el moderador como beneficio. */
  porcentajeMod: Number(process.env.PORCENTAJE_MOD ?? 0.15),
  nombreComunidad: process.env.NOMBRE_COMUNIDAD ?? "Monsterland",
  urlPublica: process.env.URL_PUBLICA ?? "",
};

export function validarConfig(): string[] {
  const problemas: string[] = [];
  if (!config.claveAdmin) problemas.push("Falta ADMIN_PASSWORD");
  if (!config.claveMod) problemas.push("Falta MOD_PASSWORD");
  if (!config.secretoSesion || config.secretoSesion.length < 16) {
    problemas.push("Falta SESSION_SECRET (mínimo 16 caracteres)");
  }
  if (config.claveAdmin && config.claveAdmin === config.claveMod) {
    problemas.push("ADMIN_PASSWORD y MOD_PASSWORD tienen que ser distintas");
  }
  // En Vercel el disco es descartable: una base en archivo se borraría en cada deploy
  // (y ni siquiera se puede escribir fuera de /tmp). Mejor frenar acá que perder datos.
  if (config.enVercel && !config.dbEsRemota) {
    problemas.push(
      "Falta TURSO_DATABASE_URL: en Vercel no se puede usar una base SQLite en archivo porque el disco " +
        "se descarta en cada deploy. Creá una base en Turso y configurá TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.",
    );
  }
  if (config.dbEsRemota && !config.tokenDB && !/^(file|http):/.test(config.urlDB)) {
    problemas.push("Configuraste TURSO_DATABASE_URL pero falta TURSO_AUTH_TOKEN");
  }
  return problemas;
}
