# Panel de torneos de Monsterland

Panel web para organizar los torneos de la Kripta sin perder media hora por evento armando llaves a mano.
Lo usan dos personas: el dueño (rol `admin`) y el moderador de torneos (rol `mod`).

**Qué hace**

- Inscripciones con control de pago (Mercado Pago / transferencia / Lemon / efectivo) y check-in.
- Llaves de eliminación simple para 2 a 128 participantes, con BYE automático para cuadros incompletos y BO configurable (por defecto BO1 en rondas y BO3 en la final).
- Carga de resultados con propagación automática del ganador y corrección de resultados mal cargados (limpia lo que venía después).
- Ranking de temporada con puntaje configurable (participación + check-in + victorias + bonus por puesto).
- Caja: cada inscripción cobrada y cada pase vendido entra solo; los premios y gastos se cargan a mano. Calcula saldo, ratio premios/ingresos y el beneficio del mod.
- Textos listos para copiar y pegar en Discord: anuncio de inscripción, recordatorio de check-in, llave, resultado final y ranking.
- Vista pública sin login (`/publico/ranking`) para pegar el link en el canal de torneos.

**Reglas que el panel hace cumplir por diseño**

1. **Premio fijo y desacoplado de las inscripciones.** El premio se define al crear el torneo. Si el premio termina siendo exactamente igual a lo recaudado en inscripciones, el panel tira una alerta grave: así se lee como pozo mutuo, que es la figura que conviene evitar.
2. **18+ obligatorio en cualquier instancia con plata.** Si el torneo tiene inscripción o premio, sólo se puede inscribir a jugadores con mayoría de edad confirmada. Para el resto existe la Pista Libre (inscripción 0, premio 0), donde entra cualquiera.
3. **Separación de roles.** El mod opera torneos y cobra inscripciones. Crear temporadas, registrar el pago de premios y borrar movimientos de caja es sólo del admin.
4. **Todo queda auditado.** Cada acción sensible se registra en la tabla `auditoria` con quién la hizo.

## Stack y por qué

| Decisión | Motivo |
|---|---|
| Node 22 + TypeScript | Un solo lenguaje, sin build de front. Cualquier dev (o cualquier IA) lo puede extender. |
| Express + HTML renderizado en el servidor | Sin React, sin bundler, sin `node_modules` de 400 MB. Abre rápido incluso desde el celular a las 3 AM. |
| SQLite vía libSQL (`@libsql/client`) | El mismo código habla con **un archivo** local (tu PC) o con una base **Turso** por red (Vercel). Mismo dialecto SQL, así que no hay dos versiones del esquema para mantener. Para 140 miembros y 8 torneos por mes sobra. |
| Sin login de Discord (OAuth) | Dos usuarios no justifican montar OAuth. Dos claves y listo. Si algún día lo abrís a más mods, ahí sí conviene OAuth. |

## Cómo verlo funcionando

### Opción A — GitHub Codespaces (sin instalar nada)

La más fácil si no querés instalar Node en tu máquina. Desde la página del repo en GitHub:

1. Botón verde **Code** → pestaña **Codespaces** → **Create codespace on main**.
2. Esperá 2-3 minutos. El devcontainer instala todo, compila, genera el `.env` con claves nuevas y carga datos de prueba solo.
3. En la terminal del Codespace: `npm start`.
4. Salta un aviso **"Open in Browser"** con el puerto 3000. Abrilo y entrá con la clave de admin.

Para ver las claves generadas: `cat .env`.

### Opción B — En tu PC

Necesitás [Node 22 o superior](https://nodejs.org). Después:

```bash
git clone https://github.com/IvanGho/monsterland-panel.git
cd monsterland-panel
npm install
npm run demo
```

`npm run demo` hace todo: genera el `.env` con claves al azar (te las imprime en pantalla — anotalas),
compila, carga datos de prueba y levanta el panel en **http://localhost:3000**.

De ahí en adelante, para levantarlo: `npm start`. Para desarrollar con recarga automática: `npm run dev`.

### Opción C — Que tu mod entre desde su casa, sin pagar hosting

Con el panel corriendo en tu PC, en otra terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

Te da una URL pública temporal (`https://algo-random.trycloudflare.com`) que podés pasarle al mod.
Cuando cerrás la terminal, la URL muere. Ideal para las noches de torneo sin gastar un peso.

### Opción D — Vercel, online 24/7 y gratis

Para que el mod entre cuando quiera sin depender de tu máquina.
Ver [Desplegar en Vercel](#desplegar-en-vercel) más abajo.

> Los datos de prueba (`npm run seed`) sólo se cargan si la base está vacía: no te van a ensuciar
> la base real. Para una demo aparte usá `DB_PATH=./data/prueba.db`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run demo` | Todo junto: prepara el `.env`, compila, carga datos de prueba y levanta el panel |
| `npm run preparar` | Genera el `.env` con claves al azar (no toca uno existente) |
| `npm run dev` | Servidor con recarga automática |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Corre lo compilado |
| `npm test` | 51 tests de la lógica de llaves, ranking, caja y elegibilidad |
| `npm run typecheck` | Chequeo de tipos sin compilar |
| `npm run seed` | Carga datos de prueba |
| `node scripts/smoke.mjs` | Prueba end-to-end contra un panel levantado (ver encabezado del archivo) |

**No corras `seed` ni `smoke` contra la base real**: crean datos de prueba. Usá `DB_PATH=./data/prueba.db`.

## Dónde hostearlo

| Opción | Costo | Detalle |
|---|---|---|
| **Vercel + Turso** (recomendado si el mod tiene que entrar solo) | $0 en los planes gratuitos | El panel queda online 24/7 sin que tengas la PC prendida. Ver los pasos abajo. |
| **Tu propia PC** | $0 | Levantás el panel cuando organizás. El mod entra por la red local, o abrís un túnel temporal con `cloudflared tunnel --url http://localhost:3000`. Cero costo, cero riesgo, y si se cae no pasa nada porque no hay nada público. |
| **Fly.io / Railway / Render con volumen** | Desde ~USD 5/mes | Si preferís un server común con disco. Montá el volumen y apuntá `DB_PATH` ahí (ej. `/data/monsterland.db`). |
| **VPS chico** (Hetzner, Contabo) | ~USD 4-5/mes | Más control, más trabajo de mantenimiento. |

### Desplegar en Vercel

Vercel corre el panel como una sola función serverless. Eso trae **una** restricción que hay que
respetar: el disco es descartable, así que la base **no** puede ser un archivo — se borraría en cada
deploy. Por eso la base va en [Turso](https://turso.tech) (libSQL, que es SQLite del otro lado de la red).
El panel se niega a arrancar en Vercel si no configuraste la base, así que no hay forma de perder datos por olvido.

**1. Crear la base en Turso** (plan gratuito, sin tarjeta):

```bash
npm i -g @tursodatabase/turso-cli
turso auth signup
turso db create monsterland
turso db show monsterland --url      # -> TURSO_DATABASE_URL
turso db tokens create monsterland   # -> TURSO_AUTH_TOKEN
```

**2. Importar el repo en Vercel** ([vercel.com/new](https://vercel.com/new)). Detecta Express solo:
no hay que configurar build command ni output directory, y no hace falta `vercel.json`.

**3. Cargar las variables de entorno** en Settings → Environment Variables:

| Variable | Valor |
|---|---|
| `TURSO_DATABASE_URL` | lo que devolvió `turso db show --url` |
| `TURSO_AUTH_TOKEN` | lo que devolvió `turso db tokens create` |
| `ADMIN_PASSWORD` | tu clave de dueño |
| `MOD_PASSWORD` | la clave del mod (distinta de la anterior) |
| `SESSION_SECRET` | 32 bytes al azar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NOMBRE_COMUNIDAD` | opcional |
| `TIPO_CAMBIO_ARS` | opcional |

**4. Volver a desplegar** (Deployments → ⋯ → Redeploy). Las variables sólo se leen en el arranque:
si las cargás después del primer deploy, hace falta este paso.

**5. Chequear que quedó bien**: abrí `https://tu-panel.vercel.app/salud`. Tiene que devolver
`{"ok":true,"base":"conectada"}`. Si devuelve 503, el propio panel te dice qué variable falta.

El esquema de la base se crea solo en el primer arranque: no hay que correr migraciones a mano.
Para cargar datos de prueba en la base de Turso: `TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run seed`.

> **Latencia**: en Vercel cada consulta viaja por red. Elegí la región de Turso más cerca de la de
> tu proyecto en Vercel (por ejemplo ambas en Brasil o en el este de EE.UU.) o el panel va a andar lento.

**Backup**:
- Base en archivo: copiá `data/monsterland.db` (y los `.db-wal`/`.db-shm` si existen) a Drive una vez por semana.
- Base en Turso: `turso db shell monsterland .dump > backup.sql`.

Sin backup, un disco que se rompe o una cuenta que se cierra te borra la temporada.

## Variables de entorno

Ver `.env.example`. Las tres obligatorias: `ADMIN_PASSWORD`, `MOD_PASSWORD`, `SESSION_SECRET`.
El panel **se niega a arrancar** si falta alguna o si las dos claves son iguales.

Para la base, una de las dos: `DB_PATH` (archivo local, es el default) o
`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (base por red, obligatorio en Vercel).
Si están las dos, gana la remota.

## Estructura

```
src/
  config.ts              variables de entorno, validación y resolución de la base
  app.ts                 armado de la app de Express (sin escuchar puerto: lo usa Vercel)
  server.ts              punto de entrada: exporta la app y levanta el puerto fuera de Vercel
  seed.ts                datos de prueba
  db/
    schema.ts            esquema SQL (inline, para que el build no dependa de copiar archivos)
    index.ts             conexión libSQL (archivo o Turso) + migración automática al arrancar
    repo.ts              todas las consultas (única capa que habla SQL)
  domain/                lógica pura, sin base ni HTTP: es lo que está testeado
    bracket.ts           llaves, BYEs, propagación de ganadores, puestos
    ranking.ts           puntaje de temporada
    caja.ts              resumen financiero, alertas, beneficio del mod
    elegibilidad.ts      quién puede inscribirse (regla 18+, cupo, pase, baneos)
    money.ts             centavos y formato ARS
  web/
    auth.ts              sesión por cookie firmada (HMAC), comparación en tiempo constante
    layout.ts            HTML base y estilos (tema Kripta)
    discord.ts           generación de los textos para pegar en Discord
    rutas/               panel, torneos, gestión (jugadores/pases/caja/temporadas/ranking), público
tests/                   bracket, negocio (money/ranking/caja/elegibilidad), repo (integración)
scripts/smoke.mjs        prueba end-to-end por HTTP
```

Regla para extenderlo: **la lógica nueva va en `domain/` con su test**. Las rutas sólo traducen HTTP a llamadas de dominio. Si te encontrás escribiendo reglas de negocio dentro de una ruta, va en el lugar equivocado.

Dos detalles de forma que conviene respetar:

- **Todo lo que toca la base es `async`.** La base puede estar del otro lado de la red, así que
  `repo.*` devuelve promesas y los handlers son `async`. Express 5 manda los rechazos al middleware
  de error solo, pero si te olvidás un `await` el bug es silencioso.
- **Cuidado con el N+1.** Contra un archivo local una consulta por fila no se nota; contra Turso cada
  una es un viaje de red. Para eso están los helpers que traen todo junto
  (`jugadoresPorParticipante`, `jugadoresConPaseActivo`).

## Cosas que faltan (por orden de utilidad)

1. **Bot de Discord** que sincronice inscripciones desde una reacción y asigne el rol de campeón automáticamente. Es el próximo paso obvio: hoy el mod copia y pega.
2. **Doble eliminación** para los playoffs de temporada. Hoy sólo hay eliminación simple.
3. **Recordatorios automáticos** de check-in (hoy el texto se genera, pero lo manda el mod a mano).
4. **Login con Discord (OAuth)** si algún día operan más de dos personas.
5. **Exportar la caja a CSV** para pasársela al contador.
