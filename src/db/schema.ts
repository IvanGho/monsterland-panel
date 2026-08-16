/**
 * Esquema de la base. Va inline en TypeScript (y no como .sql suelto) para que el build
 * con `tsc` no tenga que copiar archivos extra y no se rompa el deploy por un archivo faltante.
 *
 * Convenciones:
 * - Todo el dinero en CENTAVOS enteros.
 * - Fechas de día: TEXT 'YYYY-MM-DD'. Timestamps: TEXT ISO 8601.
 */
export const TABLAS = [
  "jugadores",
  "temporadas",
  "pases",
  "torneos",
  "participantes",
  "participante_jugadores",
  "partidos",
  "movimientos",
  "auditoria",
] as const;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS jugadores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id    TEXT    NOT NULL UNIQUE,
  discord_tag   TEXT    NOT NULL,
  nombre        TEXT    NOT NULL,
  riot_id       TEXT,
  alias_pago    TEXT,
  mayor_edad    INTEGER NOT NULL DEFAULT 0,
  notas         TEXT,
  baneado       INTEGER NOT NULL DEFAULT 0,
  creado_en     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS temporadas (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre                TEXT    NOT NULL,
  desde_fecha           TEXT    NOT NULL,
  hasta_fecha           TEXT    NOT NULL,
  estado                TEXT    NOT NULL DEFAULT 'activa',
  premio_final_centavos INTEGER NOT NULL DEFAULT 0,
  reglas_puntos         TEXT    NOT NULL,
  creado_en             TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  jugador_id      INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  temporada_id    INTEGER NOT NULL REFERENCES temporadas(id) ON DELETE CASCADE,
  nivel           TEXT    NOT NULL,
  precio_centavos INTEGER NOT NULL,
  desde_fecha     TEXT    NOT NULL,
  hasta_fecha     TEXT    NOT NULL,
  medio_pago      TEXT,
  referencia_pago TEXT,
  creado_en       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS torneos (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  temporada_id         INTEGER NOT NULL REFERENCES temporadas(id) ON DELETE CASCADE,
  nombre               TEXT    NOT NULL,
  juego                TEXT    NOT NULL,
  formato              TEXT    NOT NULL,
  cupo                 INTEGER NOT NULL DEFAULT 8,
  minimo_participantes INTEGER NOT NULL DEFAULT 4,
  empieza_en           TEXT    NOT NULL,
  inscripcion_centavos INTEGER NOT NULL DEFAULT 0,
  premio_centavos      INTEGER NOT NULL DEFAULT 0,
  premio_tipo          TEXT    NOT NULL DEFAULT 'gift_card',
  premio_descripcion   TEXT,
  best_of              INTEGER NOT NULL DEFAULT 1,
  best_of_final        INTEGER NOT NULL DEFAULT 3,
  siembra              TEXT    NOT NULL DEFAULT 'sorteo',
  estado               TEXT    NOT NULL DEFAULT 'borrador',
  creado_en            TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS participantes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  torneo_id         INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  nombre            TEXT    NOT NULL,
  pago_ok           INTEGER NOT NULL DEFAULT 0,
  medio_pago        TEXT,
  referencia_pago   TEXT,
  cubierto_por_pase INTEGER NOT NULL DEFAULT 0,
  presente          INTEGER NOT NULL DEFAULT 0,
  siembra           INTEGER,
  creado_en         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS participante_jugadores (
  participante_id INTEGER NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  jugador_id      INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  capitan         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (participante_id, jugador_id)
);

CREATE TABLE IF NOT EXISTS partidos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  torneo_id         INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  ronda             INTEGER NOT NULL,
  posicion          INTEGER NOT NULL,
  participante_a_id INTEGER REFERENCES participantes(id) ON DELETE SET NULL,
  participante_b_id INTEGER REFERENCES participantes(id) ON DELETE SET NULL,
  ganador_id        INTEGER REFERENCES participantes(id) ON DELETE SET NULL,
  score_a           INTEGER NOT NULL DEFAULT 0,
  score_b           INTEGER NOT NULL DEFAULT 0,
  best_of           INTEGER NOT NULL DEFAULT 1,
  estado            TEXT    NOT NULL DEFAULT 'pendiente',
  jugado_en         TEXT,
  UNIQUE (torneo_id, ronda, posicion)
);

CREATE TABLE IF NOT EXISTS movimientos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha          TEXT    NOT NULL DEFAULT (date('now')),
  tipo           TEXT    NOT NULL,
  categoria      TEXT    NOT NULL,
  concepto       TEXT    NOT NULL,
  monto_centavos INTEGER NOT NULL CHECK (monto_centavos >= 0),
  torneo_id      INTEGER REFERENCES torneos(id) ON DELETE SET NULL,
  jugador_id     INTEGER REFERENCES jugadores(id) ON DELETE SET NULL,
  medio          TEXT,
  referencia     TEXT,
  creado_por     TEXT,
  creado_en      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auditoria (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  actor     TEXT NOT NULL,
  accion    TEXT NOT NULL,
  detalle   TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_participantes_torneo ON participantes(torneo_id);
CREATE INDEX IF NOT EXISTS idx_partidos_torneo ON partidos(torneo_id, ronda, posicion);
CREATE INDEX IF NOT EXISTS idx_torneos_temporada ON torneos(temporada_id, empieza_en);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_pases_jugador ON pases(jugador_id, temporada_id);
`;
