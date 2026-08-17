# Continuidad del proyecto — leer antes de tocar nada

Documento de traspaso. Escrito el 17/08/2026 al cerrar la sesión donde se construyó el panel.
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

**Este repo** es el panel de operación (privado, 2 usuarios). Está previsto un segundo proyecto,
`kripta-web`: el sitio público de captación en Next.js sobre Vercel, con ranking en vivo, próximos torneos,
anotador de Truco y un convertidor de sensibilidad para shooters (herramientas para traer tráfico orgánico).

---

## 2. Estado real del repositorio al 17/08/2026

| Rama | Qué contiene | Qué hacer |
|---|---|---|
| `main` | TypeScript + libSQL/Turso. 51 tests pasan, typecheck limpio. **Tiene la paleta verde y el steering completo.** | Es la base actual |
| `app-nueva-vercel` (PR #2, abierto) | Reescritura completa en JavaScript plano + Postgres (`pg`) + PGlite para tests. 63 tests pasan. `server.js` en la raíz que importa express y hace `export default` → **es la única versión que satisface la detección de Express de Vercel** | Decisión del dueño: **se sigue con esta.** Ver sección 3 |
| `compatibilidad-vercel` | Ya mergeada en `main` (PR #1) | **Borrar** |
| `identidad-verde` | Ya mergeada en `main` (PR #3) | **Borrar** |

**PR #2 está en estado `dirty`: tiene conflictos y no se puede mergear tal cual.**

### Lo que se pierde si se mergea PR #2 sin cuidado

Tres cosas viven sólo en `main` y **no** están en la rama de la reescritura. Hay que trasladarlas a mano:

1. **La paleta verde.** `main` tiene los tokens correctos en `src/web/layout.ts`.
   La rama nueva tiene `src/web/plantilla.js` con los colores **violetas viejos** (`#8b2fc9`).
   Tokens correctos, hay que pisarlos en `plantilla.js`:

   ```
   --fondo: #050806;   --panel: #0d160f;   --panel-2: #122117;  --borde: #1e3a26;
   --texto: #e4f2e7;   --tenue: #8ca694;   --acento: #2fc94f;   --acento-2: #5dff86;
   --ok: #3be85f;      --alerta: #e0b84a;  --grave: #e5484d;
   ```
   Además: el gradiente del header pasa a `linear-gradient(90deg, #0d160f, #0f2416)`
   y el hover de las filas de tabla a `rgba(47, 201, 79, 0.07)`.

2. **Las secciones nuevas del steering** (`.kiro/steering/monsterland.md` en `main`): arquitectura de dos
   apps, decisión sobre las ramas, las cuatro reglas de la moneda interna y la tabla de la paleta.
   La rama nueva tiene la versión vieja del archivo.

3. **`.devcontainer/devcontainer.json`**, que la reescritura borró. Es lo que permite abrir el repo en
   GitHub Codespaces y verlo funcionando sin instalar nada: el dueño no es desarrollador y ese camino le sirve.
   Recuperarlo es opcional pero recomendado.

---

## 3. Decisiones tomadas (no reabrir sin permiso explícito)

1. **Se sigue con la reescritura en JavaScript de `app-nueva-vercel`**, porque es la que Vercel deploya sin pelear.
   Se pierde TypeScript, y el dueño lo aceptó sabiendo el costo.
   **Mitigación recomendada:** agregar `// @ts-check` y tipos por JSDoc en `src/dominio/` y `src/datos/`.
   Da la mayor parte de la seguridad de tipos sin build ni dependencias. Hacerlo de a poco, no de golpe.
2. **La base de datos pasa a Postgres** (consecuencia de elegir la reescritura, que usa `pg`).
   Turso queda descartado. Usar el free tier de Neon o Supabase, con las variables cargadas en Vercel.
3. **Nada de reescrituras desde cero de nuevo.** Ya hubo dos versiones en paralelo y costó una sesión entera
   desenredarlas. Si algo falla, se arregla en el archivo que corresponde.
4. **Dos aplicaciones separadas** con una sola base compartida: este panel (privado) y `kripta-web` (público).
   No mezclarlas: el panel escribe datos sensibles y lo usan 2 personas; el sitio público lo visitan
   desconocidos y se juega el posicionamiento en Google.
5. **Todo cambio va en una rama y se abre PR.** Nunca directo a `main`.

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
- **La lógica de negocio vive en el módulo de dominio**, en funciones puras, con test propio.
  Las rutas sólo traducen HTTP a llamadas de dominio. Si aparece una regla de negocio dentro de una ruta,
  está en el lugar equivocado.
- **Todo el SQL vive en la capa de datos.** Ningún otro archivo habla SQL.
- **Todo lo que se muestra pasa por la función de escapado** antes de entrar al HTML.
- **Español rioplatense** en UI, comentarios, mensajes de error y nombres de dominio.
- **Sin dependencias nuevas** salvo razón fuerte. El stack es chico a propósito.
- **Antes de decir que algo funciona:** correr los tests, el smoke test, y probarlo andando de verdad.
  Un comando que termina sin error no es prueba de nada.

---

## 6. Qué hay que limpiar

**En GitHub:**
- [ ] Borrar la rama `compatibilidad-vercel` (ya mergeada)
- [ ] Borrar la rama `identidad-verde` (ya mergeada)
- [ ] Resolver los conflictos de PR #2 trasladando las 3 cosas de la sección 2, y mergearlo
- [ ] Volver el repo a **privado**: hoy es público y `OPERACION.md` expone el esquema de monetización,
      el porcentaje del mod y el razonamiento legal. Nada secreto se filtró (ni `.env` ni la base están
      versionados), pero el plan de operación no tiene por qué ser público

**En Vercel:**
- [ ] Dejar **un solo proyecto** conectado a este repo. Si hay varios, borrar los que sobran: son la causa
      de los deploys que se pisan entre sí
- [ ] Production Branch = `main`
- [ ] Cargar las variables de entorno: `ADMIN_PASSWORD`, `MOD_PASSWORD`, `SESSION_SECRET`,
      la URL de Postgres, y las de tipo de cambio y porcentaje del mod
- [ ] Verificar que el deploy sirve `/salud` y que el login funciona antes de dar nada por terminado

---

## 7. Lo próximo, en orden

1. Cerrar el deploy: PR #2 resuelto y mergeado, Vercel andando, login verificado.
2. Restaurar la paleta verde y el steering en la estructura nueva (sección 2).
3. Empezar `kripta-web` (sitio público, Versión A): hero, ranking en vivo, próximos torneos, campeones,
   referidos, anotador de Truco. Objetivo del sitio: **captación** — que el de afuera termine en el Discord.
4. Bot de Discord: inscripción por reacción y rol de campeón automático. Es lo que le saca la mitad del
   trabajo manual al moderador.
5. Doble eliminación para los playoffs de temporada. Exportar la caja a CSV para el contador.

## 8. Pendientes del dueño (no son de código)

- Comprar el dominio. Verificado: `kripta.com`, `monsterland.com` y `kripta.com.ar` están **ocupados**.
  Libres: `monsterland.gg` y `kripta.gg` (~USD 50-90/año, es el TLD estándar del gaming),
  o `kriptaland.com` / `lakripta.com` (~USD 10-15/año). Recomendado: `monsterland.gg` en Cloudflare Registrar.
- Subir el logo del servidor al repo (PNG en la mejor calidad posible) para usarlo en el sitio público.
- Elegir el nombre de la moneda interna.
- Dar de alta en ARCA la actividad de organización de eventos (el monotributo permite hasta 3 actividades
  simultáneas; hoy tiene una, cadetería). Consultar con contador: IIBB provincial y cobros del exterior.
- Una hora de consulta con un abogado de su partido antes del primer cobro.
