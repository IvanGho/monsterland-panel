import express from "express";
import cookieParser from "cookie-parser";
import { config, validarConfig } from "./config.js";
import { db } from "./db/index.js";
import { conSesion } from "./web/auth.js";
import { rutasGestion } from "./web/rutas/gestion.js";
import { rutasPanel } from "./web/rutas/panel.js";
import { rutasPublicas } from "./web/rutas/publico.js";
import { rutasTorneos } from "./web/rutas/torneos.js";

const problemas = validarConfig();
if (problemas.length > 0) {
  console.error("No se puede arrancar el panel:\n" + problemas.map((p) => ` - ${p}`).join("\n"));
  console.error("\nCopiá .env.example a .env y completá los valores.");
  process.exit(1);
}

// Abre (y migra) la base al arrancar: mejor fallar acá que en el primer request.
db();

const app = express();
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
app.use(cookieParser());
app.use(conSesion);

app.use(rutasPublicas);
app.use(rutasPanel);
app.use("/torneos", rutasTorneos);
app.use(rutasGestion);

app.use((req, res) => {
  res.status(404).send(`No existe esa página. <a href="/">Volver al panel</a>`);
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Error no manejado:", error);
  res.status(500).send("Se rompió algo del lado del servidor. Mirá los logs.");
});

app.listen(config.puerto, () => {
  console.log(`Panel de ${config.nombreComunidad} escuchando en http://localhost:${config.puerto}`);
  console.log(`Base de datos: ${config.rutaDB}`);
});
