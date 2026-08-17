/**
 * Página de configuración.
 *
 * Existe porque el modo de fallar de la versión anterior era el peor posible: si faltaba una
 * variable de entorno, el proceso moría y Vercel mostraba un error genérico. Acá el panel
 * arranca siempre y esta página dice exactamente qué falta y cómo se arregla.
 *
 * Nunca muestra el valor de un secreto: sólo si está puesto o no. La única excepción son las
 * claves del modo demo, que son públicas por definición porque no protegen nada real.
 */
import { config } from "../../config.js";
import { esc, TOKENS } from "../plantilla.js";

/**
 * Los colores salen de los tokens de la plantilla, no copiados a mano: esta página tiene su
 * propio CSS porque se muestra incluso cuando el panel no arrancó, pero la paleta es una sola.
 */
const CSS = `
${TOKENS}
body { background: var(--fondo); color: var(--texto); font-family: ui-sans-serif, system-ui, sans-serif;
  line-height:1.6; margin:0; padding:40px 20px; }
.caja { max-width: 760px; margin: 0 auto; }
h1 { color: var(--acento-2); font-size:24px; margin:0 0 6px; }
h2 { font-size:16px; margin:28px 0 8px; color: var(--acento-2); }
p.sub { color: var(--tenue); margin:0 0 24px; }
code { background: var(--panel-2); padding:2px 6px; border-radius:4px; font-size:13px; }
pre { background: var(--panel); border:1px solid var(--borde); border-radius:8px; padding:12px;
  overflow-x:auto; font-size:13px; }
table { width:100%; border-collapse:collapse; margin:10px 0 0; font-size:14px; }
th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--borde); }
th { color: var(--tenue); font-size:12px; text-transform:uppercase; letter-spacing:1px; }
.si { color: var(--ok); }
.no { color: var(--grave); }
.opc { color: var(--tenue); }
.aviso { border:1px solid var(--alerta); color: var(--alerta); border-radius:8px; padding:12px; margin:0 0 16px; }
.ok { border:1px solid var(--ok); color: var(--ok); border-radius:8px; padding:12px; margin:0 0 16px; }
ol li { margin:8px 0; }
a { color: var(--acento-2); }
.volver { display:inline-block; margin-top:24px; }
`;

function fila(nombre, puesto, obligatoria, detalle) {
  const estado = puesto
    ? `<span class="si">configurada</span>`
    : obligatoria
      ? `<span class="no">falta</span>`
      : `<span class="opc">opcional</span>`;
  return `<tr><td><code>${esc(nombre)}</code></td><td>${estado}</td><td class="opc">${detalle}</td></tr>`;
}

export function paginaConfiguracion(rol) {
  const tieneBase = !config.modoDemo;
  const puesta = (nombre) => {
    const v = process.env[nombre];
    return typeof v === "string" && v.trim() !== "";
  };

  const encabezado = config.modoDemo
    ? `<div class="aviso"><strong>Modo demo.</strong> El panel funciona, pero los datos viven en
       memoria y se borran solos. En Vercel se borran todavía más rápido, porque cada instancia
       arranca limpia. Conectá una base para que queden guardados.</div>`
    : config.faltantes.length > 0
      ? `<div class="aviso"><strong>Falta configurar el acceso.</strong> Hay una base de datos
         conectada, así que hay datos de verdad para proteger: sin claves, el panel no se abre.
         Configurá ${config.faltantes.map((f) => `<code>${esc(f)}</code>`).join(" y ")} y volvé a desplegar.</div>`
      : `<div class="ok"><strong>Todo listo.</strong> Base de datos conectada y claves configuradas.</div>`;

  const avisos = config.avisos.length
    ? `<h2>Avisos</h2><ul>${config.avisos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`
    : "";

  const clavesDemo = config.modoDemo
    ? `<h2>Claves para entrar ahora</h2>
       <p class="sub">Son fijas mientras estés en modo demo, y no protegen nada porque los datos
       son inventados. En cuanto conectes una base, dejan de funcionar.</p>
       <pre>admin: ${esc(config.claveAdmin)}
mod:   ${esc(config.claveMod)}</pre>`
    : "";

  return `<!doctype html><html lang="es-AR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>Configuración · ${esc(config.nombreComunidad)}</title>
<style>${CSS}</style></head><body><div class="caja">

<h1>Configuración del panel</h1>
<p class="sub">Estado actual y lo que falta, si falta algo.</p>

${encabezado}

<h2>Variables de entorno</h2>
<table>
  <thead><tr><th>Variable</th><th>Estado</th><th>Para qué</th></tr></thead>
  <tbody>
    ${fila("DATABASE_URL", puesta("DATABASE_URL") || puesta("POSTGRES_URL"), false, "Base Postgres. Sin esto, modo demo.")}
    ${fila("ADMIN_PASSWORD", puesta("ADMIN_PASSWORD"), tieneBase, "Clave del dueño. Puede todo.")}
    ${fila("MOD_PASSWORD", puesta("MOD_PASSWORD"), tieneBase, "Clave del moderador. No toca plata ni temporadas.")}
    ${fila("SESSION_SECRET", puesta("SESSION_SECRET"), false, "Firma las sesiones. Sin esto te desloguea seguido.")}
    ${fila("NOMBRE_COMUNIDAD", puesta("NOMBRE_COMUNIDAD"), false, "El nombre que se muestra arriba.")}
    ${fila("TIPO_CAMBIO_ARS", puesta("TIPO_CAMBIO_ARS"), false, "Para mostrar equivalencias en dólares.")}
    ${fila("PORCENTAJE_MOD", puesta("PORCENTAJE_MOD"), false, "Comisión del mod sobre el saldo. Default 0.15.")}
  </tbody>
</table>

${avisos}
${clavesDemo}

<h2>Cómo dejarlo andando en Vercel</h2>
<ol>
  <li>En tu proyecto de Vercel entrá a <strong>Storage</strong> y creá una base
      <strong>Postgres</strong> (Neon tiene plan gratis). Al conectarla al proyecto, Vercel
      carga <code>DATABASE_URL</code> solo: no hay que copiar nada a mano.</li>
  <li>En <strong>Settings → Environment Variables</strong> agregá <code>ADMIN_PASSWORD</code>,
      <code>MOD_PASSWORD</code> (distintas entre sí) y <code>SESSION_SECRET</code>.
      Para el secreto sirve cualquier texto largo al azar:
      <pre>node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"</pre></li>
  <li>Andá a <strong>Deployments</strong> y hacé <strong>Redeploy</strong> en el último.
      Las variables se leen al arrancar, así que si las cargás después del deploy hay que
      repetirlo para que las tome.</li>
  <li>Volvé a esta página: las tablas se crean solas en el primer uso.</li>
</ol>

<p><a class="volver" href="/">${rol ? "Volver al panel" : "Ir al panel"}</a></p>
</div></body></html>`;
}
