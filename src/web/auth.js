/**
 * Sesiones con cookie firmada. No hay tabla de sesiones ni store externo: la cookie lleva
 * el rol y una firma HMAC, y el servidor sólo verifica. En serverless eso es lo que
 * corresponde, porque no hay memoria compartida entre instancias donde guardar sesiones.
 */
import crypto from "node:crypto";
import { config } from "../config.js";

const NOMBRE_COOKIE = "panel_sesion";
const DURACION_MS = 1000 * 60 * 60 * 24 * 14; // 14 días

function firmar(payload) {
  return crypto.createHmac("sha256", config.secretoSesion).update(payload).digest("base64url");
}

export function crearCookieSesion(rol) {
  const payload = JSON.stringify({ rol, expira: Date.now() + DURACION_MS });
  const codificado = Buffer.from(payload, "utf8").toString("base64url");
  return `${codificado}.${firmar(codificado)}`;
}

export function leerSesion(valor) {
  if (!valor) return null;
  const [codificado, firma] = valor.split(".");
  if (!codificado || !firma) return null;

  // Comparación en tiempo constante: evita filtrar la firma por diferencia de tiempos.
  const a = Buffer.from(firma);
  const b = Buffer.from(firmar(codificado));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const sesion = JSON.parse(Buffer.from(codificado, "base64url").toString("utf8"));
    if (sesion.expira < Date.now()) return null;
    if (sesion.rol !== "admin" && sesion.rol !== "mod") return null;
    return sesion;
  } catch {
    return null;
  }
}

/** Compara claves sin filtrar longitud ni contenido por timing. */
export function claveCoincide(entrada, esperada) {
  if (!esperada) return false;
  const a = crypto.createHash("sha256").update(String(entrada)).digest();
  const b = crypto.createHash("sha256").update(String(esperada)).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Devuelve el rol para una clave, o null si no coincide con ninguna. */
export function rolParaClave(clave) {
  if (claveCoincide(clave, config.claveAdmin)) return "admin";
  if (claveCoincide(clave, config.claveMod)) return "mod";
  return null;
}

export function conSesion(req, _res, next) {
  const sesion = leerSesion(req.cookies?.[NOMBRE_COOKIE]);
  if (sesion) req.rol = sesion.rol;
  next();
}

export function requiereLogin(req, res, next) {
  if (!req.rol) {
    res.redirect(`/login?volver=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  next();
}

export function requiereAdmin(req, res, next) {
  if (req.rol !== "admin") {
    res
      .status(403)
      .send(
        "Esta acción es sólo del dueño del servidor (rol admin). Si necesitás hacerla, pedísela a él.",
      );
    return;
  }
  next();
}

export function setCookieSesion(res, rol) {
  res.cookie(NOMBRE_COOKIE, crearCookieSesion(rol), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: DURACION_MS,
    // En Vercel siempre es HTTPS; en local no, y una cookie `secure` no viajaría por http.
    secure: config.enVercel || process.env.NODE_ENV === "production",
  });
}

export function limpiarCookieSesion(res) {
  res.clearCookie(NOMBRE_COOKIE);
}
