/**
 * Conexión a la base.
 *
 * Usamos @libsql/client en vez de better-sqlite3 por una razón concreta: el mismo código
 * habla con un archivo SQLite local (desarrollo, o un server con disco propio) y con una
 * base libSQL/Turso por red (Vercel y cualquier otro hosting serverless, donde el disco
 * se descarta en cada deploy). El dialecto SQL es idéntico, así que el esquema no cambia.
 *
 * Consecuencia inevitable: toda consulta es asíncrona. No hay forma de hacer I/O de red
 * sincrónico en Node, así que el repositorio y las rutas devuelven promesas.
 */
import { createClient, type Client, type InStatement, type ResultSet } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { SCHEMA_SQL, TABLAS } from "./schema.js";

/**
 * Lo mínimo que necesita el repositorio para ejecutar SQL. Lo cumplen tanto `Client`
 * como `Transaction`, así que un mismo método sirve dentro y fuera de una transacción.
 */
export interface Ejecutor {
  execute(stmt: InStatement): Promise<ResultSet>;
}

/**
 * Cachear el arranque a nivel de módulo es lo que hace esto viable en serverless:
 * una función de Vercel reutiliza el proceso entre requests, así que la conexión y la
 * migración se pagan una sola vez por instancia, no una vez por request.
 */
let arranque: Promise<Client> | null = null;

export function crearCliente(url: string, token = ""): Client {
  const esArchivo = url.startsWith("file:");
  if (esArchivo) {
    // El directorio de la base tiene que existir antes de abrirla.
    fs.mkdirSync(path.dirname(new URL(url).pathname), { recursive: true });
  }
  return createClient({
    url,
    ...(token ? { authToken: token } : {}),
    // Sólo aplica a bases en archivo: si otra conexión tiene el lock, esperá en vez de
    // fallar al instante. Hace falta porque transaction() abre su propia conexión.
    ...(esArchivo ? { timeout: 5000 } : {}),
  });
}

/** ¿Ya está el esquema? Una sola consulta en vez de replicar las 13 sentencias del schema. */
async function esquemaCompleto(cliente: Ejecutor): Promise<boolean> {
  const marcadores = TABLAS.map(() => "?").join(", ");
  const resultado = await cliente.execute({
    sql: `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN (${marcadores})`,
    args: [...TABLAS],
  });
  return Number(resultado.rows[0]?.n ?? 0) === TABLAS.length;
}

export async function migrar(cliente: Client): Promise<void> {
  if (await esquemaCompleto(cliente)) return;
  await cliente.executeMultiple(SCHEMA_SQL);
}

async function iniciar(): Promise<Client> {
  const cliente = crearCliente(config.urlDB, config.tokenDB);
  if (!config.dbEsRemota) {
    // WAL deja leer mientras se escribe. En remoto lo maneja el servidor.
    await cliente.execute("PRAGMA journal_mode = WAL");
  }
  await migrar(cliente);
  return cliente;
}

/**
 * Devuelve la conexión ya migrada. Si el arranque falla (por ejemplo, un error de red
 * transitorio contra Turso) limpiamos el cache para que el próximo request reintente:
 * si no, una instancia tibia quedaría envenenada para siempre.
 */
export function db(): Promise<Client> {
  if (!arranque) {
    arranque = iniciar().catch((error: unknown) => {
      arranque = null;
      throw error;
    });
  }
  return arranque;
}

/** Base temporal en archivo, para tests.
 *
 * Ojo: NO usamos `:memory:`. En @libsql/client, `batch()` y `transaction()` abren su
 * propia conexión, y con `:memory:` esa conexión ve una base vacía distinta ("no such
 * table"). Un archivo temporal es la única opción que se comporta como la base real.
 */
export async function dbDePrueba(): Promise<{ cliente: Client; borrar: () => void }> {
  const ruta = path.join(
    fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "monsterland-test-")),
    "prueba.db",
  );
  const cliente = crearCliente(`file://${ruta}`);
  await migrar(cliente);
  return {
    cliente,
    borrar: () => {
      cliente.close();
      for (const sufijo of ["", "-wal", "-shm"]) {
        fs.rmSync(`${ruta}${sufijo}`, { force: true });
      }
      fs.rmSync(path.dirname(ruta), { recursive: true, force: true });
    },
  };
}

export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ahoraISO(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}
