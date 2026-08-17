/**
 * Punto de entrada, tanto en Vercel como en tu máquina.
 *
 * Vercel detecta este archivo solo: busca un archivo de entrada (`server.js`, `app.js`,
 * `index.js` o los mismos dentro de `src/`) que **importe express**, y usa su `export
 * default`. Por eso el `import express` de acá abajo es obligatorio, y por eso la app se
 * arma con `configurar(express())` en vez de importarla ya hecha: si este archivo no
 * importara express, el build falla con "No entrypoint found which imports express".
 *
 * En local, además, levanta el puerto:
 *
 *   npm start
 */
import express from "express";
import { configurar } from "./src/web/app.js";
import { config } from "./src/config.js";
import { almacen } from "./src/almacen/index.js";

const app = configurar(express());

/**
 * Todo lo de abajo corre SÓLO fuera de Vercel.
 *
 * En serverless no hay puerto que escuchar, y sobre todo no se puede llamar a
 * `process.exit()`: el proceso se comparte entre invocaciones y matarlo se ve como un error
 * genérico, sin ninguna pista de la causa. Allá los problemas de configuración los reporta
 * la app por HTTP (ver /configuracion y /salud).
 */
if (!config.enVercel) {
  arrancarLocal();
}

/**
 * A propósito sin `await` de nivel superior: algunos empaquetadores lo convierten a
 * CommonJS, donde no existe, y el build se cae. Una función async llamada y encadenada
 * funciona igual y no depende de eso.
 */
function arrancarLocal() {
  // Abrir la base antes de escuchar: si algo está mal, que se vea en la terminal y no en el
  // primer click.
  almacen()
    .then((base) => {
      console.log(`Base de datos: ${base.descripcion}`);
      app.listen(config.puerto, () => {
        console.log(
          `\nPanel de ${config.nombreComunidad} escuchando en http://localhost:${config.puerto}`,
        );
        if (config.modoDemo) {
          console.log("\n  MODO DEMO: los datos viven en memoria y se borran cuando cortás el proceso.");
          console.log(`  Entrá con la clave: ${config.claveAdmin}  (admin)`);
          console.log(`                      ${config.claveMod}  (moderador)`);
          console.log("  Para datos de verdad, configurá DATABASE_URL. Ver README.\n");
        } else {
          for (const aviso of config.avisos) console.log(`  Aviso: ${aviso}`);
        }
      });
    })
    .catch((error) => {
      console.error("\nNo se pudo conectar a la base de datos:");
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
      console.error(
        "\nRevisá DATABASE_URL. Si la borrás, el panel arranca en modo demo (datos en memoria).\n",
      );
      process.exit(1);
    });
}

export default app;
