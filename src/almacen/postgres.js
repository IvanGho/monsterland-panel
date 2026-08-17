/**
 * Almacén sobre Postgres.
 *
 * Diseño: **una sola tabla** de documentos JSONB en vez de nueve tablas relacionales.
 *
 * Por qué. Para 140 miembros y 8 torneos por mes estamos hablando de cientos de filas, no
 * de millones. A esa escala traer una colección entera y filtrar en JavaScript es más rápido
 * que hacer diez consultas con joins, porque lo que domina el tiempo no es el trabajo de la
 * base sino la ida y vuelta por red (en serverless, cada consulta es un viaje). Además evita
 * lo que más ensucia estos proyectos: mantener migraciones y dos dialectos de SQL. Si algún
 * día esto crece a miles de torneos, se reescribe este archivo y nada más.
 *
 * Las funciones de acceso se reciben por parámetro en vez de importar `pg` acá. Eso permite
 * testear con un Postgres de verdad (PGlite, que es Postgres compilado a WASM) sin levantar
 * ningún servidor.
 */

/**
 * Van como sentencias separadas y no en un solo string con punto y coma: el protocolo
 * extendido de Postgres (el que usan las consultas con parámetros) rechaza varios comandos
 * en una misma sentencia preparada.
 */
const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS documentos (
     id SERIAL PRIMARY KEY,
     coleccion TEXT NOT NULL,
     datos JSONB NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS documentos_coleccion_idx ON documentos (coleccion)`,
];

/**
 * `id` es SERIAL (int4) y no BIGSERIAL a propósito: el driver `pg` devuelve los int8 como
 * string para no perder precisión, y eso rompería las comparaciones con ===. Igual pasamos
 * todo por Number(), porque depender de ese detalle del driver sería frágil.
 */
const aDoc = (fila) => ({ id: Number(fila.id), ...fila.datos });

/**
 * @param {object} opciones
 * @param {(sql: string, params?: unknown[]) => Promise<{rows: any[], rowCount?: number}>} opciones.consultar
 * @param {((fn: (consultar: any) => Promise<any>) => Promise<any>)} [opciones.transaccion]
 *        Corre `fn` con una conexión dedicada envuelta en BEGIN/COMMIT.
 * @param {boolean} [opciones.yaMigrado] true cuando ya corrió el esquema (dentro de una transacción).
 */
export function almacenPostgres(opciones) {
  const { consultar, transaccion, descripcion, cerrar } = opciones;
  let migrado = Boolean(opciones.yaMigrado);

  /** Crea el esquema la primera vez. Es idempotente, así que no hace falta versionar nada. */
  async function migrar() {
    if (migrado) return;
    for (const sentencia of ESQUEMA) await consultar(sentencia);
    migrado = true;
  }

  const almacen = {
    descripcion: descripcion ?? "Postgres",
    persistente: true,

    async listar(coleccion) {
      await migrar();
      const { rows } = await consultar(
        `SELECT id, datos FROM documentos WHERE coleccion = $1 ORDER BY id`,
        [coleccion],
      );
      return rows.map(aDoc);
    },

    async listarDonde(coleccion, campo, valor) {
      await migrar();
      const { rows } = await consultar(
        `SELECT id, datos FROM documentos
         WHERE coleccion = $1 AND datos->>$2 = $3
         ORDER BY id`,
        [coleccion, campo, String(valor)],
      );
      return rows.map(aDoc);
    },

    async obtener(coleccion, id) {
      await migrar();
      const { rows } = await consultar(
        `SELECT id, datos FROM documentos WHERE coleccion = $1 AND id = $2`,
        [coleccion, Number(id)],
      );
      return rows[0] ? aDoc(rows[0]) : undefined;
    },

    async crear(coleccion, datos) {
      await migrar();
      const { rows } = await consultar(
        `INSERT INTO documentos (coleccion, datos) VALUES ($1, $2) RETURNING id`,
        [coleccion, JSON.stringify(datos)],
      );
      return { id: Number(rows[0].id), ...datos };
    },

    async actualizar(coleccion, id, cambios) {
      await migrar();
      // El merge lo hace la base (`||` sobre jsonb) en vez de leer-modificar-escribir:
      // así dos cambios sobre campos distintos del mismo documento no se pisan.
      const { rows } = await consultar(
        `UPDATE documentos SET datos = datos || $3::jsonb
         WHERE coleccion = $1 AND id = $2
         RETURNING id, datos`,
        [coleccion, Number(id), JSON.stringify(cambios)],
      );
      return rows[0] ? aDoc(rows[0]) : undefined;
    },

    // Los borrados cuentan filas con RETURNING en vez de leer el contador del driver:
    // `pg` lo llama `rowCount` y otros clientes `affectedRows`, así que contar las filas
    // devueltas es lo único que se comporta igual en todos.
    async borrar(coleccion, id) {
      await migrar();
      const { rows } = await consultar(
        `DELETE FROM documentos WHERE coleccion = $1 AND id = $2 RETURNING id`,
        [coleccion, Number(id)],
      );
      return rows.length > 0;
    },

    async borrarDonde(coleccion, campo, valor) {
      await migrar();
      const { rows } = await consultar(
        `DELETE FROM documentos WHERE coleccion = $1 AND datos->>$2 = $3 RETURNING id`,
        [coleccion, campo, String(valor)],
      );
      return rows.length;
    },

    /**
     * Borra e inserta de una sola vez. Lo usa la llave del torneo, que se reescribe completa
     * cada vez que se carga un resultado: sin atomicidad, un error en el medio dejaría el
     * cuadro a medio armar.
     */
    async reemplazarDonde(coleccion, campo, valor, documentos) {
      await migrar();
      return almacen.enTransaccion(async (tx) => {
        await tx.borrarDonde(coleccion, campo, valor);
        const creados = [];
        for (const datos of documentos) creados.push(await tx.crear(coleccion, datos));
        return creados;
      });
    },

    /**
     * Corre varias escrituras como una sola unidad. La transacción usa su propia conexión:
     * si usáramos el pool compartido, las consultas de otro request podrían caer entre el
     * BEGIN y el COMMIT y terminar deshaciéndose junto con la nuestra.
     */
    async enTransaccion(fn) {
      await migrar();
      if (!transaccion) return fn(almacen); // sin soporte: mejor hacerlo sin atomicidad que fallar
      return transaccion((consultarTx) =>
        fn(almacenPostgres({ consultar: consultarTx, yaMigrado: true, descripcion })),
      );
    },

    async cerrar() {
      await cerrar?.();
    },
  };

  return almacen;
}
