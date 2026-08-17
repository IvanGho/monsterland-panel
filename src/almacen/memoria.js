/**
 * Almacén en memoria. Es el que se usa en modo demo, cuando no hay DATABASE_URL.
 *
 * Existe por una razón de diseño: que el deploy **nunca** falle por falta de base.
 * Podés desplegar el panel sin configurar nada, verlo funcionando, y recién después
 * conectar Postgres. La contra es obvia y está avisada en toda la interfaz: los datos
 * se borran. En Vercel se borran todavía más rápido, porque cada instancia arranca
 * limpia y no comparte memoria con las demás.
 */

export function almacenEnMemoria() {
  /** @type {Map<string, Map<number, object>>} */
  const colecciones = new Map();
  let proximoId = 1;

  const tabla = (coleccion) => {
    let t = colecciones.get(coleccion);
    if (!t) {
      t = new Map();
      colecciones.set(coleccion, t);
    }
    return t;
  };

  // Copiamos al entrar y al salir para que nadie pueda mutar el "disco" por accidente
  // guardando una referencia a un objeto que devolvimos.
  const clonar = (valor) => structuredClone(valor);

  return {
    descripcion: "memoria (modo demo, los datos se borran)",
    persistente: false,

    async listar(coleccion) {
      return [...tabla(coleccion).entries()]
        .map(([id, datos]) => ({ id, ...clonar(datos) }))
        .sort((a, b) => a.id - b.id);
    },

    async listarDonde(coleccion, campo, valor) {
      return (await this.listar(coleccion)).filter((doc) => doc[campo] === valor);
    },

    async obtener(coleccion, id) {
      const datos = tabla(coleccion).get(Number(id));
      return datos ? { id: Number(id), ...clonar(datos) } : undefined;
    },

    async crear(coleccion, datos) {
      const id = proximoId++;
      tabla(coleccion).set(id, clonar(datos));
      return { id, ...clonar(datos) };
    },

    async actualizar(coleccion, id, cambios) {
      const clave = Number(id);
      const actual = tabla(coleccion).get(clave);
      if (!actual) return undefined;
      const nuevo = { ...actual, ...clonar(cambios) };
      tabla(coleccion).set(clave, nuevo);
      return { id: clave, ...clonar(nuevo) };
    },

    async borrar(coleccion, id) {
      return tabla(coleccion).delete(Number(id));
    },

    async borrarDonde(coleccion, campo, valor) {
      const t = tabla(coleccion);
      let borrados = 0;
      for (const [id, datos] of [...t.entries()]) {
        if (datos[campo] === valor) {
          t.delete(id);
          borrados++;
        }
      }
      return borrados;
    },

    /** Reemplaza de una sola vez todos los documentos que matchean. Acá es trivialmente atómico. */
    async reemplazarDonde(coleccion, campo, valor, documentos) {
      await this.borrarDonde(coleccion, campo, valor);
      const creados = [];
      for (const datos of documentos) creados.push(await this.crear(coleccion, datos));
      return creados;
    },

    /**
     * Existe para cumplir la misma interfaz que el backend de Postgres, pero sin rollback:
     * si `fn` falla a mitad de camino, lo que ya escribió queda escrito. No vale la pena
     * resolverlo porque este almacén es sólo para el modo demo, donde los datos son
     * descartables de todos modos.
     */
    async enTransaccion(fn) {
      return fn(this);
    },

    async cerrar() {},
  };
}
