# Continuidad del proyecto — leer antes de tocar nada

Documento de traspaso. **Última actualización: 18/08/2026.**
Si sos un agente que acaba de clonar este repo: **leé esto y `.kiro/steering/monsterland.md` antes de proponer cambios.**

---

## 1. Qué es este proyecto

**Monsterland** es un servidor de Discord de gaming de Argentina: ~140 miembros, 10-15 activos por día,
horario pico 20:00 a 05:00, mayoría argentinos. Identidad "Kripta" (lobo verde neón sobre negro) con
jerarquía Panteón / Guardianes / Combatientes. Juegos: Valorant, CS y Truco.

Lo operan **dos personas**: el dueño (Iván, rol `admin`, está en **provincia de Buenos Aires**, es
**monotributista**) y un moderador de torneos (rol `mod`), ninguno full-time. El mod cobra un beneficio
variable: **15% del saldo** mensual (ingresos − egresos), nunca sobre los ingresos, y cero si el mes cierra en rojo.

**Modelo de negocio:** 2 torneos pagos por semana (Valorant 1v1 y Truco), mesas diarias gratuitas de Truco,
Pase de Temporada mensual/trimestral, y temporadas de ~6 semanas con ranking que se reinicia.
Cobros por Mercado Pago y transferencia; Lemon/USDT sólo como excepción para gente del exterior.

**El dueño no programa.** Las tareas técnicas las hace un agente; a él le corresponden las decisiones,
las cuentas (Vercel, base de datos, dominio) y los assets. Tenerlo presente al redactar: explicar el
"por qué", no sólo el "qué".

### Los dos repositorios

| Repo | Qué es | Estado |
|---|---|---|
| **`IvanGho/monsterland-panel`** (este) | El panel de operación: torneos, pagos, ranking, caja. Privado, 2 usuarios. | Andando, en modo demo hasta que haya base |
| **`IvanGho/kripta-web`** | El sitio público de captación. Next.js. Su único objetivo: que el de afuera entre al Discord. | Primera versión mergeada en `main` |

Comparten **una sola base de datos**. No mezclarlos: el panel escribe datos sensibles y lo usan 2 personas;
el sitio público lo visitan desconocidos y se juega el posicionamiento en Google.

---

## 2. Estado real de `monsterland-panel` al 18/08/2026

**`main` es la reescritura en JavaScript plano.** Se resolvió PR #2 y se mergeó.

- JavaScript plano, **sin paso de build**. No hay TypeScript ni bundler.
- Base **Postgres** (`pg`). Sin `DATABASE_URL` arranca en **modo demo** con los datos en memoria y lo avisa en pantalla.
- 3 dependencias de producción: `express`, `cookie-parser`, `pg`. Las tres JS puro, **ninguna nativa**.
- 63 tests (`npm test`) + prueba de humo por HTTP (`node scripts/humo.js`, 44 chequeos).
- Paleta verde aplicada, steering actualizado y devcontainer restaurado.

### Ramas y PRs

| | Estado |
|---|---|
| PR #1 `compatibilidad-vercel` | Mergeado. Rama **borrada** |
| PR #2 `app-nueva-vercel` | **Mergeado.** La rama quedó y se puede borrar |
| PR #3 `identidad-verde` | Mergeado. Rama **borrada** |
| PR #4 `traspaso` | Abierto. Es este documento |
| PR #5 `vercel-un-solo-proyecto` | **Abierto.** README: cómo dejar un solo proyecto de Vercel + tabla de síntoma → causa |

### Lo que se trasladó al resolver PR #2 (y por qué costó)

1. **La paleta verde estaba en tres lugares, no en uno:** los tokens de `plantilla.js`, el CSS propio de
   `rutas/configuracion.js` y `public/favicon.svg`. Ahora los tokens se **exportan como `TOKENS`** desde
   `src/web/plantilla.js` y configuración los importa. **Nunca volver a copiar los colores a otro archivo.**
2. Se arreglaron dos restos violetas que PR #3 no había alcanzado: el fondo de los bloques de código
   (`#0d0b13`) y el texto blanco sobre el botón verde, que contra `#2fc94f` daba contraste ~2:1.
   Ahora el texto de los botones va oscuro (~10:1).
3. `.devcontainer/devcontainer.json` restaurado y **adaptado**: el de antes llamaba a `npm run build` y
   `npm run seed`, que en esta estructura no existen.

---

## 3. Decisiones tomadas (no reabrir sin permiso explícito)

1. **Se sigue con la reescritura en JavaScript.** Es la única versión que Vercel deploya sin pelear.
   Se perdió TypeScript y el dueño lo aceptó sabiendo el costo.
   **Mitigación recomendada:** `// @ts-check` y tipos por JSDoc en `src/dominio/` y `src/datos/`,
   de a poco y no de golpe.
2. **La base es Postgres.** Free tier de Neon o Supabase. Turso quedó descartado.
3. **Nada de reescrituras desde cero de nuevo.** Ya hubo dos versiones en paralelo y costó una sesión
   entera desenredarlas. Si algo falla, se arregla en el archivo que corresponde.
4. **Dos aplicaciones separadas** con una sola base compartida (ver sección 1).
5. **Todo cambio va en una rama y se abre PR.** Nunca directo a `main`.
6. **En el tooling, los defaults quedan como vienen.** `kripta-web` usa `create-next-app` tal cual
   (TypeScript, Tailwind, App Router) y Vercel lo despliega con detección automática, sin `vercel.json`
   ni build command propio. El dolor de Vercel vino siempre de configurar a mano.
7. **El sitio público no calcula reglas de negocio.** Le pide al panel un JSON ya resuelto. Si
   recalculara el ranking habría dos implementaciones de la misma regla y terminarían discrepando.

---

## 4. Reglas de negocio que NO se negocian

Un cambio que rompa una de estas está mal aunque el código funcione y los tests pasen.

1. **El premio de cada torneo es fijo y desacoplado de las inscripciones.** Se define al crear el torneo, se
   anuncia antes de abrir la inscripción, y es el mismo con 4 o con 16 participantes. Si el premio coincide
   exactamente con lo recaudado, el panel tiene que alertar: así se lee como *pozo mutuo*.
   Antecedente concreto: ALEA (los reguladores de juego de todas las provincias) intimó a Mercado Libre en
   junio de 2026 por los "torneos de amigos", encuadrándolos en el art. 301 bis del Código Penal
   (captación de juegos de azar sin autorización, 3 a 6 años de prisión).
2. **Mayoría de edad obligatoria en cualquier instancia con dinero.** Si un torneo tiene inscripción o premio,
   sólo entran jugadores con 18+ confirmado. Existe la **Pista Libre** (inscripción 0, premio 0) abierta a todos.
3. **La moneda interna es un programa de lealtad, no una moneda.** Cuatro reglas:
   no se compra nunca · no se transfiere entre usuarios · se gana jugando · se gasta en un catálogo cerrado
   (cosméticos y roles, y como techo Nitro o gift cards con tope mensual).
   El nombre está sin definir; la opción preferida es "Colmillos".

   > **Tensión sin resolver, anotada también en el steering.** La versión vieja de la regla decía que la
   > moneda no se convierte a nada de valor real, *"ni gift cards"*. Estas cuatro reglas permiten Nitro y
   > gift cards como techo. Se dejaron las cuatro, que son las más recientes, pero **el dueño todavía no
   > confirmó cuál gana.** Mientras el catálogo sea cosméticos y roles no hay discusión; habilitar el techo
   > empuja contra la política de juego de Discord, que mira si la recompensa tiene "valor del mundo real".
   > **No ampliarlo sin hablarlo.**
4. **Nunca vocabulario de apuestas.** Se dice inscripción, premio, concurso de habilidad.
   Nunca pozo, apuesta, banca, casa. Aplica al código, a la UI y a los textos que se generan para Discord.
5. **Cero sponsors o afiliados de casas de apuestas.** En provincia de Buenos Aires el juego online legal son
   7 licencias con dominios `.bet.ar` (Ley 15.079 y Decreto 181/19): promocionar otros es promocionar juego
   ilegal, y además destruye el argumento de que los torneos son de habilidad y no apuestas.
6. **Premios y recompensas juntos no pueden pasar el 70% de los ingresos** del período. Ya está programado
   como alerta en el módulo de caja.

---

## 5. Convenciones técnicas

- **Todo el dinero en centavos enteros.** Nunca float para pesos.
- **La lógica de negocio vive en `src/dominio/`**, en funciones puras, con test propio.
  Las rutas sólo traducen HTTP a llamadas de dominio. Si aparece una regla de negocio dentro de una ruta,
  está en el lugar equivocado.
- **Todo el SQL vive en `src/almacen/postgres.js`.** Ningún otro archivo habla SQL.
- **Todo lo que se muestra pasa por `esc()`** de `src/web/plantilla.js` antes de entrar al HTML.
- **La paleta se importa desde `TOKENS`.** Nunca copiarla.
- **Todo lo que toca la base es `async`.** Express 5 manda los errores al middleware solo, pero si te
  olvidás un `await` el bug es silencioso.
- **Español rioplatense** en UI, comentarios, mensajes de error y nombres de dominio.
- **Sin dependencias nuevas** salvo razón fuerte. El stack es chico a propósito.
- **Antes de decir que algo funciona:** correr los tests, el smoke test, y probarlo andando de verdad.
  Un comando que termina sin error no es prueba de nada.
- **Si un cambio rompe un test existente, se arregla el cambio, no el test.**

### Dos detalles que rompen el deploy si alguien los "limpia"

- **`server.js` tiene que importar `express` y hacer `export default app`.** Es lo que busca el detector
  de Express de Vercel. Sin eso el build falla con `No entrypoint found which imports express`.
  Por eso la app se arma con `configurar(express())`: para que ese import sea imprescindible y no
  decorativo. **No hay `vercel.json` y no debe haberlo.**
- **`listen()` y `process.exit()` sólo fuera de Vercel**, detrás de `if (!config.enVercel)`.

### `kripta-web`: lo verificado sobre Next 16

- `export const revalidate` y `fetch` con `next: { revalidate }` son el **modelo previo**, pero siguen
  soportados: se eliminan sólo si se activa `cacheComponents`, que es **opt-in** y no está activado.
  **No activarlo** sin necesidad.
- El repo trae un `AGENTS.md` que avisa que esta versión de Next difiere del conocimiento de los modelos.
  Los docs están en `node_modules/next/dist/docs/`. **Leerlos antes de escribir, no después.**

---

## 6. Qué hay que limpiar

**Hecho:**
- [x] Resolver los conflictos de PR #2 y mergearlo
- [x] Borrar las ramas `compatibilidad-vercel` e `identidad-verde`
- [x] Trasladar la paleta verde, el steering y el devcontainer a la estructura nueva

**Pendiente en GitHub:**
- [ ] Borrar la rama `app-nueva-vercel` (ya mergeada)
- [ ] Mergear PR #5 (README de Vercel) y PR #4 (este documento)
- [ ] Volver `monsterland-panel` a **privado**: hoy es público y `OPERACION.md` expone el esquema de
      monetización, el porcentaje del mod y el razonamiento legal. Nada secreto se filtró (ni `.env` ni la
      base están versionados), pero el plan de operación no tiene por qué ser público

**Pendiente en Vercel (lo tiene que hacer el dueño, el agente no tiene acceso):**
- [ ] **Un solo proyecto por repo.** Si hay varios apuntando al mismo, los deploys se pisan: es la causa de
      los "no toma los cambios". Los pasos están en el README del panel
- [ ] Production Branch = `main` en los dos proyectos
- [ ] Crear la base **Postgres** (Storage → Create Database) y cargar en el panel: `ADMIN_PASSWORD`,
      `MOD_PASSWORD`, `SESSION_SECRET`, y las opcionales de tipo de cambio y porcentaje del mod
- [ ] En `kripta-web`: cargar `NEXT_PUBLIC_URL_DISCORD` con una invitación **que no expire**. Es la
      conversión del sitio: sin eso el botón principal no lleva a ningún lado
- [ ] Redeploy después de cargar variables (se leen al arrancar)
- [ ] Verificar `/salud` del panel: tiene que decir `"base": "conectada"`. Si dice `modo: demo`, a ese
      deploy le faltan las variables

---

## 7. Lo próximo, en orden

1. **Cerrar los deploys:** base Postgres creada, variables cargadas, `/salud` en verde y login verificado.
2. **Exponer los datos reales al sitio público.** Falta una ruta pública en el panel que devuelva el JSON
   con el shape `DatosPublicos` de `kripta-web/app/lib/datos.ts` (temporada, próximo torneo, torneos,
   ranking, campeones). Después basta con setear `PANEL_API_URL` en `kripta-web`. Hasta entonces el sitio
   muestra datos de ejemplo y se ve completo igual.
3. **Reemplazar el logo.** `kripta-web/app/componentes/marca.tsx` tiene un lobo geométrico escrito en SVG
   a mano, que funciona y se ve nítido. Cuando esté el logo del servidor se reemplaza **sólo ese archivo**.
4. **Bot de Discord:** inscripción por reacción y rol de campeón automático. Es lo que le saca la mitad
   del trabajo manual al moderador.
5. Doble eliminación para los playoffs de temporada. Exportar la caja a CSV para el contador.
6. `// @ts-check` + JSDoc en el dominio y la capa de datos del panel, de a poco.

## 8. Pendientes del dueño (no son de código)

- Comprar el dominio. Verificado: `kripta.com`, `monsterland.com` y `kripta.com.ar` están **ocupados**.
  Libres: `monsterland.gg` y `kripta.gg` (~USD 50-90/año, es el TLD estándar del gaming),
  o `kriptaland.com` / `lakripta.com` (~USD 10-15/año). Recomendado: `monsterland.gg` en Cloudflare Registrar.
- Subir el logo del servidor en la mejor calidad posible (PNG grande o vectorial). **Ya no bloquea**:
  hay un logo SVG provisorio andando.
- Elegir el nombre de la moneda interna, y resolver la tensión de la sección 4, regla 3.
- Dar de alta en ARCA la actividad de organización de eventos (el monotributo permite hasta 3 actividades
  simultáneas; hoy tiene una, cadetería). Consultar con contador: IIBB provincial y cobros del exterior.
- Una hora de consulta con un abogado de su partido antes del primer cobro.

---

## 9. Notas del entorno de trabajo (para el próximo agente)

Cosas que cuestan descubrir y hacen perder tiempo:

- **Node está en `/root/.nvm/versions/node/v22.23.2/bin` y NO en el `PATH`.** Hay que exportarlo en cada
  comando de bash.
- **No hay `diff` instalado.** Usar `git diff <commit>:<archivo> <commit>:<archivo>`.
- **Los procesos en background NO sobreviven entre llamadas de bash** (ni con `setsid`, `nohup`, `disown`
  ni `run_in_background`). No se puede levantar un servidor en una llamada y usarlo en otra.
- **Para verificar algo visualmente:** guardar el HTML servido, generar con Node un archivo `.js` que lo
  embeba con `JSON.stringify` y pasárselo a Playwright con el parámetro `filename`, usando
  `page.setContent`. Ese archivo tiene que estar bajo
  `/projects/sandbox/.kiro/artifacts/screenshots` (otros paths dan "outside allowed roots"), `file://`
  está bloqueado, y dentro de ese código no existen `require` ni `import` dinámico.
- **El agente no puede crear repos** (403) ni tocar cuentas de Vercel. Los repos los crea el dueño y
  después hay que pedirle que dé acceso a la integración de Kiro, si no el `push` falla con 403.
