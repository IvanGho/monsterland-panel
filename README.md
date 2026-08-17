# Panel de torneos

Panel para organizar torneos de una comunidad de Discord: jugadores, llaves de eliminación
simple, ranking de temporada, pases y caja. HTML renderizado en el servidor, sin build.

**Está hecho para desplegarse en Vercel sin configurar nada.** Podés importar el repo y darle
deploy: arranca en modo demo, con datos de ejemplo, y después le conectás una base.

---

## Desplegar en Vercel

### Paso 1 — Importar el repo

En [vercel.com/new](https://vercel.com/new) elegí este repositorio y dale **Deploy**.
No toques nada: ni Framework Preset, ni Build Command, ni Output Directory. Vercel reconoce
solo que es una app de Express y no hace falta ningún `vercel.json`.

Ya debería andar. Entrá a la URL y logueate con la clave **`demo`**.

Estás en **modo demo**: el panel funciona completo pero los datos viven en memoria y se
borran solos. Sirve para ver si te gusta antes de configurar nada.

### Paso 2 — Conectar una base para que los datos queden guardados

En tu proyecto de Vercel: **Storage → Create Database → Postgres** (Neon tiene plan gratis).
Al conectarla al proyecto, Vercel carga la variable `DATABASE_URL` sola: no hay que copiar
ni pegar nada.

Sirve cualquier Postgres, no sólo el de Vercel: Neon, Supabase, Railway o uno propio.
Alcanza con poner su URL en `DATABASE_URL`.

### Paso 3 — Poner las claves de acceso

En **Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `ADMIN_PASSWORD` | tu clave de dueño |
| `MOD_PASSWORD` | la clave del moderador (distinta de la anterior) |
| `SESSION_SECRET` | texto largo al azar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

En cuanto haya `DATABASE_URL`, estas claves pasan a ser **obligatorias**: ya hay datos reales
que proteger, así que el panel no se abre sin ellas.

### Paso 4 — Redeploy

**Deployments → ⋯ → Redeploy** en el último deploy. Las variables de entorno se leen al
arrancar, así que si las cargaste después del primer deploy hay que repetirlo.

Listo. Las tablas se crean solas en el primer uso.

### Un solo proyecto de Vercel

Si el repo estuvo conectado a **más de un proyecto** de Vercel, los deploys se pisan entre sí:
uno queda sirviendo la versión vieja y parece que los cambios "no se toman". Pasó, y es lo
primero que hay que descartar cuando algo no cuadra.

En [vercel.com/dashboard](https://vercel.com/dashboard), buscá todos los proyectos apuntando a
`monsterland-panel`:

1. **Dejá uno solo.** En los que sobren: *Settings → General → Delete Project*. Borrar un
   proyecto de Vercel no toca el repositorio ni la base de datos.
2. En el que queda: *Settings → Environments → Production*, **Production Branch = `main`**.
3. *Settings → Environment Variables*: cargá las de la tabla del Paso 3, marcadas para
   **Production** (y para Preview si querés que los PR también funcionen).
4. *Deployments → ⋯ → Redeploy* en el último. Las variables se leen al arrancar: si las
   cargaste después del deploy, hay que repetirlo.

Cómo saber cuál está sirviendo: abrí `/salud` y mirá el campo `modo`. Si dice
`demo (datos en memoria)` cuando ya configuraste la base, ese deploy no tiene las variables.

### Si algo no anda

Abrí **`/configuracion`** en tu panel. Esa página dice qué variable falta y qué está bien
puesto, sin mostrar ningún secreto. Y **`/salud`** devuelve un JSON que prueba la conexión a
la base de verdad:

```json
{ "ok": true, "modo": "produccion", "base": "conectada" }
```

Si `ok` es `false`, el campo `detalle` trae el error exacto de la base.

| Síntoma | Causa más probable |
|---|---|
| 404 en todas las páginas | Vercel no reconoció la app. `server.js` tiene que importar `express` y hacer `export default app`: son las dos cosas que busca su detector. |
| `No entrypoint found which imports express` en el build | Lo mismo de arriba: alguien quitó el `import express` de `server.js`. |
| Dice "modo demo" pero configuraste la base | Ese deploy no tiene las variables, o falta el redeploy. |
| 503 con una lista de variables | Hay base configurada pero faltan `ADMIN_PASSWORD` / `MOD_PASSWORD`. Es a propósito: con datos reales no se abre sin clave. |
| Te desloguea seguido | Falta `SESSION_SECRET`, así que se genera uno nuevo en cada arranque. |

---

## Por qué este panel no rompe el deploy

Cada decisión de acá abajo está para eliminar una forma concreta de fallar en Vercel:

| Decisión | Qué error evita |
|---|---|
| **Sin paso de build.** JavaScript plano, sin TypeScript ni bundler. | No puede fallar la compilación, porque no hay compilación. `npm install` y listo. |
| **Sin dependencias nativas.** Sólo `express`, `cookie-parser` y `pg`, las tres JS puro. | Los módulos nativos (como `better-sqlite3`) hay que compilar en el build y ahí es donde suelen romperse. |
| **`server.js` importa `express` y hace `export default app`.** | Es exactamente lo que Vercel busca para reconocer un proyecto de Express. Si el archivo de entrada no importa el paquete, el build falla con `No entrypoint found which imports express`. |
| **La app se arma con `configurar(express())`.** | Así el `import express` del archivo de entrada es imprescindible para que el código funcione, y no un import decorativo que alguien borre por prolijidad rompiendo el deploy. |
| **`listen()` sólo fuera de Vercel.** | En serverless no hay puerto que escuchar. |
| **Sin `await` de nivel superior en el archivo de entrada.** | Algunos empaquetadores lo convierten a CommonJS, donde no existe. |
| **Los estáticos van en `public/`.** | Es de donde Vercel los sirve. `express.static()` allá se ignora. |
| **Arranca sin ninguna variable de entorno.** | Un deploy nunca queda muerto por una variable que falta: arranca en modo demo y te lo explica en pantalla. |
| **Nunca hace `process.exit()`.** | Matar el proceso en serverless se ve como un error genérico sin causa. Si falta configuración, responde una página que dice qué falta. |
| **La base no es un archivo.** | En Vercel el disco es descartable: una base SQLite en archivo se borraría en cada deploy. |

---

## Correrlo en tu máquina

```bash
npm install
npm run preparar   # crea el .env con claves al azar y te las muestra
npm start          # http://localhost:3000
```

Sin `DATABASE_URL` en el `.env` arranca en modo demo. Para guardar de verdad, agregá la URL
de un Postgres.

```bash
npm test            # tests de dominio y de los dos almacenes
node scripts/humo.js  # prueba de humo: usa la app entera por HTTP
```

---

## Cómo está organizado

```
server.js             único punto de entrada: Vercel usa su export default,
                      y en local además levanta el puerto
public/               archivos estáticos (favicon, robots)
src/
  config.js           variables de entorno. Nunca tira error ni corta el proceso.
  dominio/            lógica pura: dinero, llave, ranking, caja, elegibilidad
  almacen/
    index.js          elige el backend según la configuración
    postgres.js       una tabla de documentos JSONB
    memoria.js        el mismo contrato, para el modo demo
  datos/
    repo.js           única capa que conoce la forma de los datos
    semilla.js        datos de ejemplo, idempotentes
  web/
    app.js            armado de Express
    auth.js           sesión por cookie firmada, roles admin y mod
    plantilla.js      HTML y CSS
    discord.js        textos para copiar y pegar
    rutas/            una por sección del panel
tests/                node --test, sin dependencias extra
```

Dos criterios al extenderlo:

- **La lógica nueva va en `dominio/` con su test.** Las rutas sólo traducen HTTP a llamadas de
  dominio. Si te encontrás escribiendo reglas de negocio dentro de una ruta, va en el lugar
  equivocado.
- **Todo lo que toca la base es `async`.** Express 5 manda los errores al middleware solo,
  pero si te olvidás un `await` el bug es silencioso.

### Sobre el almacenamiento

Los datos se guardan como documentos JSONB en **una sola tabla**, en vez de nueve tablas
relacionales. Es una decisión deliberada: para 140 miembros y 8 torneos por mes son cientos
de filas, no millones. A esa escala traer una colección completa y cruzarla en memoria es
más rápido que hacer diez consultas con joins, porque el tiempo se va en la ida y vuelta por
red y no en el trabajo de la base. Y de paso desaparecen las migraciones.

Si esto algún día crece a miles de torneos, se reescribe `src/almacen/postgres.js` y nada más:
el resto del código no sabe cómo están guardados los datos.

---

## Los dos roles

| | admin | mod |
|---|---|---|
| Operar torneos, check-in, cargar resultados | sí | sí |
| Cobrar inscripciones y vender pases | sí | sí |
| Crear y cerrar temporadas | sí | no |
| Registrar el pago de un premio | sí | no |
| Borrar movimientos de caja | sí | no |
| Cargar datos de ejemplo | sí | no |

---

## Reglas que el panel hace cumplir

No son detalles de implementación, son las que evitan los problemas caros:

- **18+ obligatorio si hay plata.** Si un torneo tiene inscripción paga o premio con valor
  real, no se puede inscribir a nadie sin mayoría de edad confirmada. No se puede saltear
  desde la interfaz. Para esos casos está la Pista Libre: gratis y con premios no monetarios.
- **El premio es fijo y se anuncia antes de abrir la inscripción.** Si el premio termina
  coincidiendo con lo recaudado en inscripciones, el panel lo marca como alerta grave: así se
  lee como pozo mutuo, que es justamente la lectura que hay que evitar.
- **Los premios no pueden comerse más del 70% de los ingresos.** Si pasa, el panel avisa.
- **El beneficio del mod se calcula sobre el saldo, no sobre los ingresos.** Si el mes cerró
  en rojo, ese mes no hay comisión.
- **La plata entra sola a la caja.** Inscripciones pagadas y pases se registran como ingreso
  al confirmarlos, y marcar un pago dos veces no lo duplica.
- **La llave se arma con los que hicieron check-in.** El walkover automático premia al que no
  avisó que no venía.

---

## Backup

Con Postgres, la base es responsabilidad del proveedor, pero un backup propio no depende de
que la cuenta siga viva:

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%Y-%m).sql
```

En modo demo no hay nada que respaldar: los datos se borran solos.
