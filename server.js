/**
 * Punto de entrada para correr el panel en tu máquina (o en cualquier server común).
 * En Vercel este archivo no se usa: allá entra por api/index.js.
 *
 *   npm start
 */
import { crearApp } from "./src/web/app.js";
import { config } from "./src/config.js";
import { almacen } from "./src/almacen/index.js";

const app = crearApp();

// Abrir la base antes de escuchar: si algo está mal, que se vea acá y no en el primer click.
try {
  const base = await almacen();
  console.log(`Base de datos: ${base.descripcion}`);
} catch (error) {
  console.error("\nNo se pudo conectar a la base de datos:");
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  console.error("\nRevisá DATABASE_URL. Si la borrás, el panel arranca en modo demo (datos en memoria).\n");
  process.exit(1);
}

app.listen(config.puerto, () => {
  console.log(`\nPanel de ${config.nombreComunidad} escuchando en http://localhost:${config.puerto}`);
  if (config.modoDemo) {
    console.log("\n  MODO DEMO: los datos viven en memoria y se borran cuando cortás el proceso.");
    console.log(`  Entrá con la clave: ${config.claveAdmin}  (admin)`);
    console.log(`                      ${config.claveMod}  (moderador)`);
    console.log("  Para datos de verdad, configurá DATABASE_URL. Ver README.\n");
  } else {
    for (const aviso of config.avisos) console.log(`  Aviso: ${aviso}`);
  }
});
