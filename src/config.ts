import { fileURLToPath } from "node:url";
import path from "node:path";

const aca = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  puerto: Number(process.env.PORT ?? 3000),
  rutaBase: path.resolve(aca, ".."),
  rutaDB: process.env.DB_PATH ?? path.resolve(aca, "..", "data", "monsterland.db"),
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
  if (!config.claveAdmin) problemas.push("Falta ADMIN_PASSWORD en el archivo .env");
  if (!config.claveMod) problemas.push("Falta MOD_PASSWORD en el archivo .env");
  if (!config.secretoSesion || config.secretoSesion.length < 16) {
    problemas.push("Falta SESSION_SECRET en el .env (mínimo 16 caracteres)");
  }
  if (config.claveAdmin && config.claveAdmin === config.claveMod) {
    problemas.push("ADMIN_PASSWORD y MOD_PASSWORD tienen que ser distintas");
  }
  return problemas;
}
