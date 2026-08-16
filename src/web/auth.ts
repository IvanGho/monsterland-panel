import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

export type Rol = "admin" | "mod";

const NOMBRE_COOKIE = "kripta_sesion";
const DURACION_MS = 1000 * 60 * 60 * 24 * 14; // 14 días

export interface Sesion {
  rol: Rol;
  expira: number;
}

function firmar(payload: string): string {
  return crypto.createHmac("sha256", config.secretoSesion).update(payload).digest("base64url");
}

export function crearCookieSesion(rol: Rol): string {
  const payload = JSON.stringify({ rol, expira: Date.now() + DURACION_MS } satisfies Sesion);
  const codificado = Buffer.from(payload, "utf8").toString("base64url");
  return `${codificado}.${firmar(codificado)}`;
}

export function leerSesion(valor: string | undefined): Sesion | null {
  if (!valor) return null;
  const [codificado, firma] = valor.split(".");
  if (!codificado || !firma) return null;
  const esperada = firmar(codificado);
  // Comparación en tiempo constante: evita filtrar la firma por diferencia de tiempos.
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const sesion = JSON.parse(Buffer.from(codificado, "base64url").toString("utf8")) as Sesion;
    if (sesion.expira < Date.now()) return null;
    if (sesion.rol !== "admin" && sesion.rol !== "mod") return null;
    return sesion;
  } catch {
    return null;
  }
}

/** Compara contraseñas sin filtrar longitud ni contenido por timing. */
export function claveCoincide(entrada: string, esperada: string): boolean {
  if (!esperada) return false;
  const a = crypto.createHash("sha256").update(entrada).digest();
  const b = crypto.createHash("sha256").update(esperada).digest();
  return crypto.timingSafeEqual(a, b);
}

declare module "express-serve-static-core" {
  interface Request {
    rol?: Rol;
  }
}

export function conSesion(req: Request, _res: Response, next: NextFunction): void {
  const sesion = leerSesion(req.cookies?.[NOMBRE_COOKIE]);
  if (sesion) req.rol = sesion.rol;
  next();
}

export function requiereLogin(req: Request, res: Response, next: NextFunction): void {
  if (!req.rol) {
    res.redirect(`/login?volver=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  next();
}

export function requiereAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.rol !== "admin") {
    res.status(403).send(
      "Esta acción es sólo del dueño del servidor (rol admin). Si necesitás hacerla, pedísela a él.",
    );
    return;
  }
  next();
}

export function setCookieSesion(res: Response, rol: Rol): void {
  res.cookie(NOMBRE_COOKIE, crearCookieSesion(rol), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: DURACION_MS,
    secure: process.env.NODE_ENV === "production",
  });
}

export function limpiarCookieSesion(res: Response): void {
  res.clearCookie(NOMBRE_COOKIE);
}
