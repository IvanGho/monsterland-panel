/**
 * Armado de la app de Express, sin escuchar en ningún puerto.
 *
 * Está separado de server.ts a propósito: en un entorno serverless (Vercel) nadie llama
 * a listen() y nadie puede llamar a process.exit() — el proceso es compartido entre
 * requests y matarlo deja al usuario con un error opaco. Acá sólo se construye la app.
 */
import express from "express";
import cookieParser from "cookie-parser";
import { config, validarConfig } from "./config.js";
import { conSesion } from "./web/auth.js";
import { rutasGestion } from "./web/rutas/gestion.js";
import { rutasPanel } from "./web/rutas/panel.js";
import { rutasPublicas } from "./web/rutas/publico.js";
import { rutasTorneos } from "./web/rutas/torneos.js";
import { esc } from "./web/layout.js";

/** Página de ayuda cuando falta configuración: mejor esto que un 500 sin explicación. */
function paginaDeConfiguracion(problemas: string[]): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Falta configurar el panel</title>
    <style>
      body{background:#0e0d12;color:#e8e6ef;font-family:system-ui,sans-serif;padding:40px;line-height:1.6}
      code{background:#1c1a24;padding:2px 6px;border-radius:4px}
      li{margin:6px 0}
      a{color:#b18cff}
    </style></head><body>
    <h1>Falta configurar el panel</h1>
    <p>El panel no puede arrancar hasta que estas variables de entorno estén completas:</p>
    <ul>${problemas.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    <p>En Vercel se cargan en <strong>Settings → Environment Variables</strong>; después hay que
    volver a desplegar para que tomen efecto. Localmente van en el archivo <code>.env</code>
    (podés generarlo con <code>npm run preparar</code>).</p>
    </body></html>`;
}

export function crearApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  // Detrás del proxy de Vercel: para que req.protocol/req.ip reflejen al cliente real.
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false, limit: "256kb" }));
  app.use(cookieParser());

  // Sin claves de acceso no hay panel: cortamos acá, pero explicando qué falta.
  const problemas = validarConfig();
  if (problemas.length > 0) {
    console.error("Configuración incompleta:\n" + problemas.map((p) => ` - ${p}`).join("\n"));
    app.use((_req, res) => {
      res.status(503).type("html").send(paginaDeConfiguracion(problemas));
    });
    return app;
  }

  app.use(conSesion);

  app.use(rutasPublicas);
  app.use(rutasPanel);
  app.use("/torneos", rutasTorneos);
  app.use(rutasGestion);

  app.use((_req, res) => {
    res.status(404).send(`No existe esa página. <a href="/">Volver al panel</a>`);
  });

  // Express 5 manda acá también las promesas rechazadas de los handlers async.
  // Sin este middleware, un error de base dejaría la request colgada.
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ): void => {
      console.error("Error no manejado:", error);
      if (res.headersSent) {
        res.end();
        return;
      }
      const detalle =
        config.enVercel && error instanceof Error && /TURSO|libsql|SQLITE|fetch/i.test(error.message)
          ? " Puede ser un problema de conexión con la base: revisá TURSO_DATABASE_URL y TURSO_AUTH_TOKEN."
          : "";
      res.status(500).send(`Se rompió algo del lado del servidor. Mirá los logs.${esc(detalle)}`);
    },
  );

  return app;
}
