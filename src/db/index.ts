import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { SCHEMA_SQL } from "./schema.js";

let instancia: Database.Database | null = null;

export function db(): Database.Database {
  if (instancia) return instancia;
  fs.mkdirSync(path.dirname(config.rutaDB), { recursive: true });
  instancia = new Database(config.rutaDB);
  instancia.pragma("journal_mode = WAL");
  instancia.pragma("foreign_keys = ON");
  instancia.exec(SCHEMA_SQL);
  return instancia;
}

/** Base en memoria, para tests. */
export function dbEnMemoria(): Database.Database {
  const memoria = new Database(":memory:");
  memoria.pragma("foreign_keys = ON");
  memoria.exec(SCHEMA_SQL);
  return memoria;
}

export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ahoraISO(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}
