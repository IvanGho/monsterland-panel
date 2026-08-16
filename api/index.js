/**
 * Punto de entrada en Vercel.
 *
 * Vercel convierte cada archivo de `api/` en una función serverless, y el `vercel.json`
 * manda todas las rutas acá. Es a propósito explícito en vez de depender de que Vercel
 * adivine el framework: la detección automática cambia con el tiempo y cuando falla
 * el síntoma es un 404 en todas las páginas, que es dificilísimo de diagnosticar.
 *
 * Acá no hay `listen()`: en serverless nadie escucha un puerto, se exporta el handler.
 * Una app de Express ya es una función (req, res), así que sirve tal cual.
 */
import { crearApp } from "../src/web/app.js";

export default crearApp();
