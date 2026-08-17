/**
 * Plantilla HTML y helpers de presentación.
 *
 * El CSS va embebido en la respuesta a propósito: son unos pocos KB y así no hay archivos
 * estáticos que servir, ni pipeline de assets, ni un `express.static` que en Vercel no
 * funcionaría igual que en local.
 */
import { config } from "../config.js";

/** Escapa HTML. Todo lo que venga del usuario pasa por acá antes de entrar al template. */
export function esc(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Paleta Kripta, sacada del logo del servidor: lobo verde neón sobre negro.
 *
 * Se exporta y no se copia en ningún otro archivo: la página de configuración también la
 * usa, y cuando estos tokens estaban duplicados el panel terminó mitad verde y mitad
 * violeta. Si cambia un token, cambia en todos lados.
 *
 *   --acento    verde del lobo, para acciones y datos vivos
 *   --acento-2  el glow más claro, para hover y títulos
 *   --fondo     negro con un toque de verde, nunca negro puro (cansa la vista de noche)
 *
 * El sitio público (kripta-web) usa los mismos valores.
 */
export const TOKENS = `
:root {
  --fondo: #050806; --panel: #0d160f; --panel-2: #122117; --borde: #1e3a26;
  --texto: #e4f2e7; --tenue: #8ca694; --acento: #2fc94f; --acento-2: #5dff86;
  --ok: #3be85f; --alerta: #e0b84a; --grave: #e5484d;
}`;

const CSS = `
${TOKENS}
* { box-sizing: border-box; }
body { margin: 0; background: var(--fondo); color: var(--texto);
  font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif; font-size: 15px; line-height: 1.5; }
a { color: var(--acento-2); text-decoration: none; }
a:hover { text-decoration: underline; }
header.top { display: flex; align-items: center; gap: 18px; padding: 12px 20px;
  background: linear-gradient(90deg, #0d160f, #0f2416); border-bottom: 1px solid var(--borde);
  position: sticky; top: 0; z-index: 10; }
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
.grid.g3 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.metrica { background: var(--panel-2); border: 1px solid var(--borde); border-radius: 10px; padding: 14px; }
.metrica .valor { font-size: 24px; font-weight: 700; }
.metrica .etiqueta { color: var(--tenue); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--borde); }
th { color: var(--tenue); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
tr:hover td { background: rgba(47, 201, 79, 0.07); }
form.inline { display: inline; }
input, select, textarea { background: var(--panel-2); color: var(--texto); border: 1px solid var(--borde);
  border-radius: 8px; padding: 8px 10px; font-size: 14px; font-family: inherit; width: 100%; }
label { display: block; font-size: 12px; color: var(--tenue); text-transform: uppercase;
  letter-spacing: 1px; margin: 10px 0 4px; }
/* Texto oscuro sobre el verde, no blanco: el acento es un verde neón claro y el blanco
   encima queda casi ilegible (contraste ~2:1 contra ~10:1 del oscuro). */
button, .boton { background: var(--acento); color: var(--fondo); border: 0; border-radius: 8px; padding: 9px 14px;
  font-size: 14px; font-weight: 600; cursor: pointer; display: inline-block; }
button:hover, .boton:hover { background: var(--acento-2); text-decoration: none; }
button.secundario, .boton.secundario { background: var(--panel-2); border: 1px solid var(--borde); color: var(--texto); }
button.peligro { background: var(--grave); }
button.chico, .boton.chico { padding: 5px 9px; font-size: 12px; }
.fila { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.fila > div { flex: 1 1 160px; }
.etiqueta-estado { font-size: 11px; padding: 2px 8px; border-radius: 20px; border: 1px solid var(--borde);
  text-transform: uppercase; letter-spacing: 1px; }
.estado-borrador { color: var(--tenue); }
.estado-inscripcion { color: var(--alerta); border-color: var(--alerta); }
.estado-en_juego { color: var(--acento-2); border-color: var(--acento-2); }
.estado-finalizado { color: var(--ok); border-color: var(--ok); }
.estado-cancelado { color: var(--grave); border-color: var(--grave); }
.alerta { border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; font-size: 14px; border: 1px solid; }
.alerta.info { border-color: var(--borde); color: var(--tenue); }
.alerta.atencion { border-color: var(--alerta); color: var(--alerta); }
.alerta.grave { border-color: var(--grave); color: var(--grave); }
/* La cinta de demo se queda en ámbar a propósito: es una advertencia y tiene que cortar
   con el verde de la interfaz, no integrarse. */
.cinta-demo { background: #2b2109; border-bottom: 1px solid var(--alerta); color: var(--alerta);
  padding: 8px 20px; font-size: 13px; text-align: center; }
.cinta-demo a { color: #f0d79a; text-decoration: underline; }
.llave { display: flex; gap: 26px; overflow-x: auto; padding-bottom: 10px; }
.ronda { min-width: 230px; }
.ronda h4 { color: var(--tenue); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px; }
.partido { background: var(--panel-2); border: 1px solid var(--borde); border-radius: 8px; padding: 8px; margin-bottom: 10px; }
.partido .lado { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
.partido .lado.gana { color: var(--ok); font-weight: 600; }
.partido .lado.vacio { color: var(--tenue); font-style: italic; }
.tenue { color: var(--tenue); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
pre.copiable { background: #081109; border: 1px solid var(--borde); border-radius: 8px; padding: 12px;
  white-space: pre-wrap; font-size: 13px; color: var(--texto); }
.pill { display: inline-block; background: var(--panel-2); border: 1px solid var(--borde);
  border-radius: 20px; padding: 2px 9px; font-size: 12px; }
footer { color: var(--tenue); font-size: 12px; padding: 20px; text-align: center; }
@media (max-width: 640px) { header.top { flex-wrap: wrap; } main { padding: 16px 12px 40px; } }
`;

const NAV = [
  { href: "/", texto: "Hoy", clave: "hoy" },
  { href: "/torneos", texto: "Torneos", clave: "torneos" },
  { href: "/ranking", texto: "Ranking", clave: "ranking" },
  { href: "/jugadores", texto: "Jugadores", clave: "jugadores" },
  { href: "/pases", texto: "Pases", clave: "pases" },
  { href: "/caja", texto: "Caja", clave: "caja" },
  { href: "/temporadas", texto: "Temporadas", clave: "temporadas" },
];

export function layout(contenido, opciones = {}) {
  const nav = opciones.publico
    ? ""
    : `<nav>${NAV.map(
        (item) =>
          `<a class="${opciones.activo === item.clave ? "activo" : ""}" href="${item.href}">${esc(item.texto)}</a>`,
      ).join("")}</nav>`;

  const rol = opciones.publico
    ? `<span class="rol">vista pública</span>`
    : `<span class="rol">${esc(opciones.rol ?? "")} · <a href="/salir">salir</a></span>`;

  // La cinta de demo va en todas las páginas: es lo único que separa "estoy probando"
  // de "creí que estaba guardando los datos de la temporada".
  const cinta = config.modoDemo
    ? `<div class="cinta-demo">
        <strong>Modo demo</strong> · los datos se borran solos ·
        <a href="/configuracion">cómo conectar una base para que queden guardados</a>
      </div>`
    : "";

  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${esc(opciones.titulo ?? "Panel")} · ${esc(config.nombreComunidad)}</title>
<style>${CSS}</style>
</head>
<body>
${cinta}
<header class="top">
  <span class="marca">${esc(config.nombreComunidad)}</span>
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

export function metrica(etiqueta, valor, detalle = "") {
  return `<div class="metrica">
    <div class="etiqueta">${esc(etiqueta)}</div>
    <div class="valor">${esc(valor)}</div>
    ${detalle ? `<div class="tenue" style="font-size:12px">${esc(detalle)}</div>` : ""}
  </div>`;
}

export function alerta(nivel, mensaje) {
  return `<div class="alerta ${esc(nivel)}">${esc(mensaje)}</div>`;
}

export function etiquetaEstado(estado) {
  return `<span class="etiqueta-estado estado-${esc(estado)}">${esc(String(estado).replace("_", " "))}</span>`;
}
