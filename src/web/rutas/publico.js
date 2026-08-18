import { Router } from "express";
import { config } from "../../config.js";
import { abrirRepo } from "../../datos/repo.js";
import { sembrar } from "../../datos/semilla.js";
import { formatoARS } from "../../dominio/dinero.js";
import { limpiarCookieSesion, requiereAdmin, requiereLogin, rolParaClave, setCookieSesion } from "../auth.js";
import { alerta, esc, layout } from "../plantilla.js";

export const rutasPublicas = Router();

// ---------------- login ----------------

rutasPublicas.get("/login", (req, res) => {
  const volver = typeof req.query.volver === "string" ? req.query.volver : "/";
  const error = req.query.error === "1";
  res.send(
    layout(
      `<div class="tarjeta" style="max-width:420px;margin:60px auto">
        <h1>Entrar al panel</h1>
        <p class="sub">Panel de torneos de ${esc(config.nombreComunidad)}.</p>
        ${error ? alerta("grave", "Clave incorrecta.") : ""}
        ${
          config.modoDemo
            ? alerta(
                "atencion",
                `Modo demo. Clave de admin: "${config.claveAdmin}" · clave de mod: "${config.claveMod}". Los datos se borran solos.`,
              )
            : ""
        }
        <form method="post" action="/login">
          <input type="hidden" name="volver" value="${esc(volver)}">
          <label>Clave</label>
          <input type="password" name="clave" autofocus required>
          <div style="margin-top:14px"><button type="submit">Entrar</button></div>
        </form>
        <p class="tenue" style="margin-top:14px;font-size:12px">
          Hay dos claves: la del dueño (admin) y la del moderador (mod). El mod puede operar torneos y
          cargar cobros; crear temporadas, tocar premios y borrar movimientos de caja es sólo del admin.
        </p>
        <p class="tenue" style="font-size:12px"><a href="/configuracion">Ver estado de la configuración</a></p>
      </div>`,
      { titulo: "Entrar", publico: true },
    ),
  );
});

rutasPublicas.post("/login", (req, res) => {
  const volver = String(req.body?.volver ?? "/");
  // Sólo rutas internas: si no, un link a /login?volver=http://malo.com sería un redirect abierto.
  const destino = volver.startsWith("/") && !volver.startsWith("//") ? volver : "/";
  const rol = rolParaClave(String(req.body?.clave ?? ""));
  if (!rol) {
    res.redirect(`/login?error=1&volver=${encodeURIComponent(destino)}`);
    return;
  }
  setCookieSesion(res, rol);
  res.redirect(destino);
});

rutasPublicas.get("/salir", (_req, res) => {
  limpiarCookieSesion(res);
  res.redirect("/login");
});

// ---------------- datos de ejemplo ----------------

rutasPublicas.post("/sembrar", requiereLogin, requiereAdmin, async (req, res) => {
  const repo = await abrirRepo();
  const resultado = await sembrar(repo);
  if (!resultado.ok) {
    res.status(400).send(
      layout(
        `<h1>No cargué los datos de ejemplo</h1>${alerta("atencion", resultado.motivo)}
         <p><a class="boton secundario" href="/">Volver</a></p>`,
        { titulo: "Datos de ejemplo", rol: req.rol },
      ),
    );
    return;
  }
  await repo.registrar(req.rol, "sembrar_ejemplo", `torneo #${resultado.torneoId}`);
  res.redirect("/");
});

// ---------------- API para el sitio público ----------------

/**
 * Los datos que muestra `kripta-web`, en JSON.
 *
 * Es el contrato del tipo `DatosPublicos` de `kripta-web/app/lib/datos.ts`. Si cambia el shape
 * acá, hay que cambiar el tipo allá: son dos repos y no hay nada que los sincronice solo.
 *
 * El armado vive en `repo.datosPublicos()`, no acá: esta ruta sólo traduce HTTP.
 *
 * Sobre el `Access-Control-Allow-Origin`: hoy no hace falta, porque `kripta-web` hace el fetch
 * desde su propio servidor (Server Component) y CORS es una restricción del navegador, no del
 * servidor. Va igual, con `*`, para que mañana se pueda leer desde el navegador —por ejemplo un
 * ranking que se refresque solo sin recargar la página— sin tener que volver a tocar el panel.
 * Es seguro porque acá no hay nada privado ni cookies en juego: es exactamente la misma
 * información que ya está en `/publico/ranking`, que también es abierta.
 */
rutasPublicas.get("/publico/datos", async (_req, res) => {
  const repo = await abrirRepo();
  const datos = await repo.datosPublicos({ miembrosDiscord: config.miembrosDiscord });
  res.set("Access-Control-Allow-Origin", "*");
  // En modo demo los datos son inventados: que el sitio lo sepa y pueda avisarlo.
  res.json({ ...datos, esEjemplo: config.modoDemo });
});

// ---------------- vista pública ----------------

/**
 * Vista pública, sin login: para pegar el link en el canal de torneos.
 * No muestra plata de la caja, ni datos personales, ni el estado de pago de nadie.
 */
rutasPublicas.get("/publico/ranking", async (_req, res) => {
  const repo = await abrirRepo();
  const temporada = await repo.temporadaActiva();
  if (!temporada) {
    res.send(
      layout(`<h1>Ranking</h1><p class="tenue">No hay temporada activa.</p>`, {
        titulo: "Ranking",
        publico: true,
      }),
    );
    return;
  }

  const [ranking, jugadores, torneos] = await Promise.all([
    repo.rankingDeTemporada(temporada.id),
    repo.jugadores(),
    repo.torneos({ temporadaId: temporada.id }),
  ]);
  const nombres = new Map(jugadores.map((j) => [j.id, j.nombre]));

  const filas = ranking
    .map(
      (f, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(nombres.get(f.jugadorId) ?? "?")}</td>
        <td><strong>${f.puntos}</strong></td>
        <td>${f.torneos}</td>
        <td>${f.primeros}</td>
      </tr>`,
    )
    .join("");

  const proximos = torneos
    .filter((t) => ["inscripcion", "en_juego"].includes(t.estado))
    .map(
      (t) => `<tr>
        <td>${esc(t.nombre)}</td>
        <td>${esc(t.juego)} ${esc(t.formato)}</td>
        <td class="mono">${esc(String(t.empiezaEn).replace("T", " "))}</td>
        <td>${t.inscripcionCentavos > 0 ? formatoARS(t.inscripcionCentavos) : "gratis"}</td>
        <td>${t.premioCentavos > 0 ? formatoARS(t.premioCentavos) : "rol + puntos"}</td>
      </tr>`,
    )
    .join("");

  res.send(
    layout(
      `<h1>${esc(temporada.nombre)}</h1>
      <p class="sub">Ranking en vivo · ${esc(temporada.desdeFecha)} a ${esc(temporada.hastaFecha)}${
        temporada.premioFinalCentavos > 0
          ? ` · premio final ${formatoARS(temporada.premioFinalCentavos)}`
          : ""
      }</p>
      <div class="tarjeta">
        ${
          filas
            ? `<table><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Torneos</th><th>Títulos</th></tr></thead><tbody>${filas}</tbody></table>`
            : `<p class="tenue">Todavía no se jugó nada de esta temporada.</p>`
        }
      </div>
      <h2>Próximos torneos</h2>
      <div class="tarjeta">
        ${
          proximos
            ? `<table><thead><tr><th>Torneo</th><th>Juego</th><th>Arranca</th><th>Inscripción</th><th>Premio fijo</th></tr></thead><tbody>${proximos}</tbody></table>`
            : `<p class="tenue">No hay torneos abiertos ahora.</p>`
        }
      </div>
      <p class="tenue" style="font-size:12px">
        El premio de cada torneo es fijo, se anuncia antes de abrir la inscripción y lo paga la
        organización: no se forma con las inscripciones y no cambia según cuánta gente se anote.
        Los torneos con inscripción o premio son sólo para mayores de 18.
      </p>`,
      { titulo: `Ranking ${temporada.nombre}`, publico: true },
    ),
  );
});
