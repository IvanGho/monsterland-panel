import { config } from "../config.js";
import type { Rol } from "./auth.js";

/** Escapa HTML. Todo lo que venga del usuario pasa por acá antes de entrar al template. */
export function esc(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CSS = `
/*
 * Paleta Kripta, sacada del logo del servidor: lobo verde neón sobre negro.
 * Es la misma que usa el sitio público, así que si cambia un token, cambia en los dos lados.
 *   --acento    verde del lobo, para acciones y datos vivos
 *   --acento-2  el glow más claro, para hover y títulos
 *   --fondo     negro con un toque de verde, nunca negro puro (cansa la vista de noche)
 */
:root {
  --fondo: #050806;
  --panel: #0d160f;
  --panel-2: #122117;
  --borde: #1e3a26;
  --texto: #e4f2e7;
  --tenue: #8ca694;
  --acento: #2fc94f;
  --acento-2: #5dff86;
  --ok: #3be85f;
  --alerta: #e0b84a;
  --grave: #e5484d;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--fondo); color: var(--texto);
  font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif; font-size: 15px; line-height: 1.5;
}
a { color: var(--acento-2); text-decoration: none; }
a:hover { text-decoration: underline; }
header.top {
  display: flex; align-items: center; gap: 18px; padding: 12px 20px;
  background: linear-gradient(90deg, #0d160f, #0f2416); border-bottom: 1px solid var(--borde);
  position: sticky; top: 0; z-index: 10;
}
header.top .marca { font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--acento-2); }
header.top nav { display: flex; gap: 14px; flex-wrap: wrap; }
header.top nav a { color: var(--tenue); font-size: 14px; }
header.top nav a.activo { color: var(--texto); border-bottom: 2px solid var(--acento); }
header.top .rol { margin-left: auto; color: var(--tenue); font-size: 13px; }
main { padding: 22px 20px 60px; max-width: 1180px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 17px; margin: 26px 0 10px; color: var(--acento-2); }
h3 { font-size: 15px; margin: 18px 0 8px; }
p.sub { color: var(--tenue); margin: 0 0 18px; }
.tarjeta { background: var(--panel); border: 1px solid var(--borde); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
.grid { display: grid; gap: 14px; }
.grid.g2 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.grid.g3 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.metrica { background: var(--panel-2); border: 1px solid var(--borde); border-radius: 10px; padding: 14px; }
.metrica .valor { font-size: 24px; font-weight: 700; }
.metrica .etiqueta { color: var(--tenue); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--borde); }
th { color: var(--tenue); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
tr:hover td { background: rgba(47, 201, 79, 0.07); }
form.inline { display: inline; }
input, select, textarea {
  background: var(--panel-2); color: var(--texto); border: 1px solid var(--borde);
  border-radius: 8px; padding: 8px 10px; font-size: 14px; font-family: inherit; width: 100%;
}
label { display: block; font-size: 12px; color: var(--tenue); text-transform: uppercase; letter-spacing: 1px; margin: 10px 0 4px; }
button, .boton {
  background: var(--acento); color: #fff; border: 0; border-radius: 8px; padding: 9px 14px;
  font-size: 14px; font-weight: 600; cursor: pointer; display: inline-block;
}
button:hover, .boton:hover { background: var(--acento-2); text-decoration: none; }
button.secundario, .boton.secundario { background: var(--panel-2); border: 1px solid var(--borde); color: var(--texto); }
button.peligro { background: var(--grave); }
button.chico, .boton.chico { padding: 5px 9px; font-size: 12px; }
.fila { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.fila > div { flex: 1 1 160px; }
.etiqueta-estado { font-size: 11px; padding: 2px 8px; border-radius: 20px; border: 1px solid var(--borde); text-transform: uppercase; letter-spacing: 1px; }
.estado-borrador { color: var(--tenue); }
.estado-inscripcion { color: var(--alerta); border-color: var(--alerta); }
.estado-en_juego { color: var(--acento-2); border-color: var(--acento-2); }
.estado-finalizado { color: var(--ok); border-color: var(--ok); }
.estado-cancelado { color: var(--grave); border-color: var(--grave); }
.alerta { border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; font-size: 14px; border: 1px solid; }
.alerta.info { border-color: var(--borde); color: var(--tenue); }
.alerta.atencion { border-color: var(--alerta); color: var(--alerta); }
.alerta.grave { border-color: var(--grave); color: var(--grave); }
.llave { display: flex; gap: 26px; overflow-x: auto; padding-bottom: 10px; }
.ronda { min-width: 230px; }
.ronda h4 { color: var(--tenue); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px; }
.partido { background: var(--panel-2); border: 1px solid var(--borde); border-radius: 8px; padding: 8px; margin-bottom: 10px; }
.partido .lado { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
.partido .lado.gana { color: var(--ok); font-weight: 600; }
.partido .lado.vacio { color: var(--tenue); font-style: italic; }
.tenue { color: var(--tenue); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
pre.copiable {
  background: #0d0b13; border: 1px solid var(--borde); border-radius: 8px; padding: 12px;
  white-space: pre-wrap; font-size: 13px; color: var(--texto);
}
.pill { display: inline-block; background: var(--panel-2); border: 1px solid var(--borde); border-radius: 20px; padding: 2px 9px; font-size: 12px; }
footer { color: var(--tenue); font-size: 12px; padding: 20px; text-align: center; }
@media (max-width: 640px) { header.top { flex-wrap: wrap; } main { padding: 16px 12px 40px; } }
`;

export interface OpcionesLayout {
  titulo: string;
  rol?: Rol;
  activo?: string;
  publico?: boolean;
}

const NAV: Array<{ href: string; texto: string; clave: string }> = [
  { href: "/", texto: "Hoy", clave: "hoy" },
  { href: "/torneos", texto: "Torneos", clave: "torneos" },
  { href: "/ranking", texto: "Ranking", clave: "ranking" },
  { href: "/jugadores", texto: "Jugadores", clave: "jugadores" },
  { href: "/pases", texto: "Pases", clave: "pases" },
  { href: "/caja", texto: "Caja", clave: "caja" },
  { href: "/temporadas", texto: "Temporadas", clave: "temporadas" },
];

export function layout(contenido: string, opciones: OpcionesLayout): string {
  const nav = opciones.publico
    ? ""
    : `<nav>${NAV.map(
        (item) =>
          `<a class="${opciones.activo === item.clave ? "activo" : ""}" href="${item.href}">${esc(item.texto)}</a>`,
      ).join("")}</nav>`;

  const rol = opciones.publico
    ? `<span class="rol">vista pública</span>`
    : `<span class="rol">${esc(opciones.rol ?? "")} · <a href="/salir">salir</a></span>`;

  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opciones.titulo)} · ${esc(config.nombreComunidad)}</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <span class="marca">${esc(config.nombreComunidad)} · Kripta</span>
  ${nav}
  ${rol}
</header>
<main>
${contenido}
</main>
<footer>
  Panel de torneos de ${esc(config.nombreComunidad)} · el premio de cada torneo es fijo y se anuncia antes de abrir la inscripción
</footer>
</body>
</html>`;
}

export function metrica(etiqueta: string, valor: string, detalle = ""): string {
  return `<div class="metrica">
    <div class="etiqueta">${esc(etiqueta)}</div>
    <div class="valor">${esc(valor)}</div>
    ${detalle ? `<div class="tenue" style="font-size:12px">${esc(detalle)}</div>` : ""}
  </div>`;
}

export function alerta(nivel: "info" | "atencion" | "grave", mensaje: string): string {
  return `<div class="alerta ${nivel}">${esc(mensaje)}</div>`;
}

export function etiquetaEstado(estado: string): string {
  return `<span class="etiqueta-estado estado-${esc(estado)}">${esc(estado.replace("_", " "))}</span>`;
}
