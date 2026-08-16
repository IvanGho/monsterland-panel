/**
 * Punto de entrada.
 *
 * Vercel detecta este archivo solo (`src/server.ts` es una de las rutas que busca para
 * apps de Express) y usa el `export default`. Fuera de Vercel, además levanta el puerto.
 * Por eso el listen() está condicionado: en serverless no hay puerto que escuchar.
 */
import { config, validarConfig } from "./config.js";
import { crearApp } from "./app.js";
import { db } from "./db/index.js";

const app = crearApp();

if (!config.enVercel) {
  const problemas = validarConfig();
  if (problemas.length > 0) {
    console.error("No se puede arrancar el panel:\n" + problemas.map((p) => ` - ${p}`).join("\n"));
    console.error("\nCopiá .env.example a .env y completá los valores (o corré: npm run preparar).");
    process.exit(1);
  }

  // Abrir (y migrar) la base antes de escuchar: mejor fallar acá que en el primer request.
  db()
    .then(() => {
      app.listen(config.puerto, () => {
        console.log(
          `Panel de ${config.nombreComunidad} escuchando en http://localhost:${config.puerto}`,
        );
        console.log(`Base de datos: ${config.dbEsRemota ? config.urlDB : config.rutaDB}`);
      });
    })
    .catch((error: unknown) => {
      console.error("No se pudo abrir la base de datos:", error);
      process.exit(1);
    });
}

export default app;
