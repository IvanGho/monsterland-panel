/**
 * Armado de la app de Express.
 *
 * No hay `listen()` acá: en Vercel nadie escucha un puerto, se exporta el handler
 * (ver api/index.js). El `server.js` de la raíz es el que levanta el puerto en local.
 */
import express from "express";
import cookieParser from "cookie-parser";
import { config } from "../config.js";
import { conSesion } from "./auth.js";
import { rutasPublicas } from "./rutas/publico.js";
import { rutasPanel } from "./rutas/panel.js";
import { rutasTorneos } from "./rutas/torneos.js";
import { rutasGestion } from "./rutas/gestion.js";
import { paginaConfiguracion } from "./rutas/configuracion.js";

export function crearApp() {
  const app = express();
  app.disable("x-powered-by");
  // Detrás del proxy de Vercel: para que req.protocol y req.ip reflejen al cliente real.
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false, limit: "256kb" }));
  app.use(cookieParser());
  app.use(conSesion);

  // Siempre disponible, incluso sin configurar nada: es la página que explica qué falta.
  app.get("/configuracion", (req, res) => {
    res.type("html").send(paginaConfiguracion(req.rol));
  });

  /**
   * Chequeo de salud. Toca la base a propósito: si `ok` es true, la conexión funciona de
   * verdad, no es un "el proceso está vivo" que no prueba nada.
   */
  app.get("/salud", async (_req, res) => {
    const salida = {
      ok: true,
      modo: config.modoDemo ? "demo (datos en memoria)" : "produccion",
      hora: new Date().toISOString(),
    };
    try {
      const { abrirRepo } = await import("../datos/repo.js");
      const repo = await abrirRepo();
      await repo.temporadas();
      salida.base = config.modoDemo ? "memoria" : "conectada";
    } catch (error) {
      salida.ok = false;
      salida.base = "sin conexión";
      salida.detalle = error instanceof Error ? error.message : String(error);
      res.status(503).json(salida);
      return;
    }
    if (config.faltantes.length > 0) salida.faltaConfigurar = config.faltantes;
    res.json(salida);
  });

  /**
   * Si falta configuración imprescindible, no montamos el panel: mostramos la página de
   * configuración en todas las rutas. Pasa cuando hay DATABASE_URL (o sea, datos de verdad)
   * pero no hay claves de acceso: dejar entrar sin clave expondría esos datos.
   */
  if (!config.usable) {
    console.error(
      "Falta configurar: " + config.faltantes.join(", ") + ". El panel está en modo configuración.",
    );
    app.use((_req, res) => {
      res.status(503).type("html").send(paginaConfiguracion());
    });
    return app;
  }

  app.use(rutasPublicas);
  app.use(rutasPanel);
  app.use("/torneos", rutasTorneos);
  app.use(rutasGestion);

  app.use((_req, res) => {
    res.status(404).send(`No existe esa página. <a href="/">Volver al panel</a>`);
  });

  /**
   * Manejador de errores. Express 5 manda acá también las promesas rechazadas de los
   * handlers async, así que un error de base no deja la request colgada. Vercel avisa que
   * si Express se come los errores, la función queda en un estado raro: por eso se loguea
   * siempre y se responde siempre.
   */
  app.use((error, _req, res, _next) => {
    console.error("Error no manejado:", error);
    if (res.headersSent) {
      res.end();
      return;
    }
    const mensaje = error instanceof Error ? error.message : String(error);
    const pistaBase = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|password|SSL|certificate|does not exist/i.test(
      mensaje,
    )
      ? ` Parece un problema con la base de datos. Revisá DATABASE_URL en /configuracion.`
      : "";
    res.status(500).send(`Se rompió algo del lado del servidor.${pistaBase}`);
  });

  return app;
}
