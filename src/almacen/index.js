/**
 * Elige el almacén según lo que haya configurado, y lo cachea.
 *
 * El cache es a nivel de módulo, no por request: una función de Vercel reutiliza el proceso
 * entre invocaciones, así que la conexión y la migración se pagan una vez por instancia.
 * Si el arranque falla limpiamos el cache para que el próximo request reintente; si no, un
 * error de red pasajero dejaría esa instancia rota hasta que Vercel la recicle.
 */
import { config } from "../config.js";
import { almacenEnMemoria } from "./memoria.js";
import { almacenPostgres } from "./postgres.js";

let cache = null;

async function crear() {
  if (config.modoDemo) return almacenEnMemoria();

  // Import dinámico: si estás en modo demo, `pg` nunca se carga.
  const { default: pg } = await import("pg");

  const pool = new pg.Pool({
    connectionString: config.urlPostgres,
    // Pool chico a propósito: en serverless cada instancia tiene el suyo, así que un pool
    // grande multiplicado por muchas instancias agota el límite de conexiones del Postgres.
    // Con 2 alcanza para que una transacción tome su conexión sin bloquear al resto.
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Los Postgres administrados (Neon, Supabase, Railway) exigen TLS, y sus certificados
    // no siempre validan contra la cadena del runtime. Se puede endurecer con PGSSL_ESTRICTO=1.
    ssl: usaTls(config.urlPostgres)
      ? { rejectUnauthorized: process.env.PGSSL_ESTRICTO === "1" }
      : false,
  });

  // Si una conexión inactiva se muere (los Postgres serverless las cierran solos), que no
  // tumbe el proceso: el pool abre otra en el próximo uso.
  pool.on("error", (error) => {
    console.error("Conexión de Postgres caída (el pool va a reconectar):", error.message);
  });

  return almacenPostgres({
    consultar: (sql, params) => pool.query(sql, params),
    async transaccion(fn) {
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        const resultado = await fn((sql, params) => cliente.query(sql, params));
        await cliente.query("COMMIT");
        return resultado;
      } catch (error) {
        await cliente.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        cliente.release();
      }
    },
    descripcion: `Postgres (${describirHost(config.urlPostgres)})`,
    cerrar: () => pool.end(),
  });
}

/** localhost normalmente no tiene TLS; los proveedores administrados sí. */
function usaTls(url) {
  if (process.env.PGSSL === "0") return false;
  if (/sslmode=disable/.test(url)) return false;
  return !/@(localhost|127\.0\.0\.1|\[::1\])/.test(url);
}

/** Muestra sólo el host, para no filtrar usuario y contraseña en los logs. */
function describirHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "host desconocido";
  }
}

export function almacen() {
  if (!cache) {
    cache = crear().catch((error) => {
      cache = null;
      throw error;
    });
  }
  return cache;
}

/** Para los tests: inyectar un almacén cualquiera. */
export function usarAlmacen(instancia) {
  cache = Promise.resolve(instancia);
}

export function reiniciarAlmacen() {
  cache = null;
}
