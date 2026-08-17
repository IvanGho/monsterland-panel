# Contexto y reglas del proyecto Monsterland

Este archivo lo lee Kiro automáticamente en cada sesión sobre este repo.
Si algo cambia (precios, reglas, equipo), actualizalo acá y no hace falta explicarlo de nuevo.

## Qué es esto

Panel de torneos de **Monsterland**, un servidor de Discord de gaming de Argentina
(~140 miembros, 10-15 activos por día, horario pico 20 a 05, mayoría de Argentina).
Identidad visual "Kripta": gótica, oscura, con jerarquía narrativa Panteón / Guardianes / Combatientes.

Lo operan **dos personas**: el dueño (rol `admin`) y un moderador de torneos (rol `mod`),
ninguno full-time. Juegos: Valorant, CS y Truco. Dos torneos pagos por semana más mesas
diarias gratuitas de Truco.

El dueño está en **provincia de Buenos Aires**, es **monotributista**, y cobra por
Mercado Pago / transferencia; Lemon (USDT) sólo como excepción para miembros del exterior.

## Reglas de negocio que NO se negocian

Cualquier cambio que rompa una de estas está mal, incluso si el código funciona y los tests pasan:

1. **El premio es fijo y desacoplado de las inscripciones.** Se define al crear el torneo,
   se anuncia antes de abrir la inscripción y es el mismo con 4 o con 16 participantes.
   Si el premio coincide con lo recaudado, el panel tiene que alertar: así se lee como
   *pozo mutuo*, que es la figura que hay que evitar (art. 301 bis del Código Penal;
   antecedente: intimación de ALEA a Mercado Libre por los "torneos de amigos", junio 2026).
2. **Mayoría de edad obligatoria en cualquier instancia con dinero.** Si un torneo tiene
   inscripción o premio, sólo entran jugadores con 18+ confirmado. Para el resto existe la
   **Pista Libre**: inscripción 0, premio 0, abierta a todos.
3. **La moneda interna es un programa de lealtad, no una moneda.** Ver la sección
   "La moneda interna" más abajo: son cuatro reglas y las cuatro son obligatorias.
4. **Nunca se usa vocabulario de apuestas.** Se dice "inscripción", "premio", "concurso de
   habilidad". Nunca "pozo", "apuesta", "banca" ni "casa". Aplica al código, a la UI y a los
   textos generados para Discord.
5. **Nada de sponsors ni afiliados de casas de apuestas.** En PBA sólo hay 7 licencias de
   juego online y los sitios legales terminan en `.bet.ar` (Ley 15.079 y Decreto 181/19);
   promocionar otros es promocionar juego ilegal, y además destruye el argumento de que los
   torneos son concursos de habilidad y no apuestas.
6. **Premios y recompensas juntos no pasan el 70% de los ingresos** del período. Ya está
   programado como alerta en el módulo de caja.

## Stack y estructura (actualizado: agosto 2026)

**JavaScript plano, sin paso de build.** No hay TypeScript, ni bundler, ni compilación.
Es una decisión tomada a conciencia: ver "Decisión sobre las ramas" más abajo.

```
server.js               único punto de entrada. Importa express y hace export default:
                        es lo que Vercel busca para reconocer la app. En local además
                        levanta el puerto. NO tocar esos dos detalles sin leer el README.
public/                 estáticos (Vercel los sirve desde acá; express.static allá se ignora)
src/config.js           variables de entorno. Nunca tira error ni corta el proceso.
src/dominio/            lógica pura con test propio: dinero, llave, ranking, caja, elegibilidad
src/almacen/            persistencia. postgres.js (una tabla de documentos JSONB) y
                        memoria.js (modo demo). Mismo contrato los dos.
src/datos/repo.js       única capa que conoce la forma de los datos
src/web/                app.js, auth.js, plantilla.js, discord.js y rutas/
tests/                  node --test, sin dependencias de test extra
```

- **Todo el dinero en centavos enteros.** Nunca float para pesos.
- **La lógica de negocio vive en `src/dominio/`**, en funciones puras, con su test.
  Las rutas de `src/web/rutas/` sólo traducen HTTP a llamadas de dominio. Si aparece una regla
  de negocio dentro de una ruta, está en el lugar equivocado.
- **Todo el SQL vive en `src/almacen/postgres.js`.** Ningún otro archivo habla SQL.
  Si algún día hay que cambiar de motor, se reescribe ese archivo y nada más.
- **Todo lo que se muestre pasa por `esc()`** de `src/web/plantilla.js` antes de entrar al HTML.
- **La paleta se importa desde `TOKENS`** de `src/web/plantilla.js`. Nunca copiar los colores
  a otro archivo: cuando estuvieron duplicados el panel terminó mitad verde y mitad violeta.
- **Todo lo que toca la base es `async`.** Express 5 manda los errores al middleware solo,
  pero si te olvidás un `await` el bug es silencioso.
- **Español rioplatense** en UI, comentarios, mensajes de error y nombres de dominio
  (`torneos`, `participantes`, `partidos`, `movimientos`). Los nombres técnicos pueden quedar
  en inglés cuando es lo natural (`bestOf`, `id`).
- **El beneficio del moderador se calcula sobre el saldo** (ingresos − egresos), nunca sobre
  los ingresos: es lo que alinea sus incentivos con la salud de la caja. Si el mes cierra en
  rojo, es 0 y no se acumula.
- **Sin dependencias nuevas salvo que haya una razón fuerte.** Producción son tres:
  `express`, `cookie-parser`, `pg`. Las tres JS puro: una dependencia nativa rompe el build
  de Vercel, que es exactamente el problema del que salimos.

### Recuperar tipos sin volver a TypeScript

Mejora recomendada, **de a poco y no de golpe**: `// @ts-check` arriba del archivo y tipos por
JSDoc, empezando por `src/dominio/` y `src/datos/`. Da la mayor parte de la seguridad de tipos
sin build ni dependencias nuevas.

## Cómo verificar antes de decir que algo funciona

```bash
npm test              # 63 tests: dominio + el flujo completo contra los dos almacenes
node scripts/humo.js  # prueba de humo: usa la app entera por HTTP (44 chequeos)
npm start             # y abrirlo en el navegador
```

Un comando que termina sin error no es prueba de que la funcionalidad ande: hay que verla andar.
Si un cambio rompe un test existente, se arregla el cambio, no el test.

## Rigor con los datos

Cuando se hable de plata, crecimiento o marco legal: separar **evidencia** (con link) de
**hipótesis**. Lo que no se encuentre, se dice "no encontrado", no se estima. Aplica también a
los comentarios del código y a la documentación.

---

## Arquitectura decidida (agosto 2026)

Son **dos aplicaciones separadas** con una sola base de datos compartida:

```
kripta-web  (Next.js en Vercel, publico)     -> capta gente de afuera y la lleva al Discord
      |  lee
      v
Postgres  (base compartida, free tier)       -> unica fuente de verdad
      ^
      |  escribe
monsterland-panel (este repo, privado)       -> la operacion: torneos, pagos, ranking, caja
```

Por qué así y no todo junto: el panel lo usan 2 personas y escribe datos sensibles; el sitio
público lo visitan desconocidos, tiene que cargar rápido y posicionar en Google. Mezclarlos
obliga a elegir mal en los dos lados.

**Base de datos: Postgres.** Free tier de Neon o Supabase, con las variables cargadas en Vercel.
Turso/libSQL quedó descartado al elegir la reescritura, que usa `pg`. Sin `DATABASE_URL` el
panel arranca en **modo demo** con los datos en memoria: sirve para probar, y se avisa en
pantalla en cada página.

## Decisión sobre las ramas (cerrada, no reabrir sin permiso)

Se sigue con la **reescritura en JavaScript plano** (rama `app-nueva-vercel`, PR #2), porque es
la única versión que Vercel deploya sin pelear: `server.js` importa express y hace
`export default`, que es lo que su detector de Express exige. Se aceptó **perder TypeScript**
sabiendo el costo, y se mitiga con `// @ts-check` + JSDoc.

Las ramas `compatibilidad-vercel` (PR #1) e `identidad-verde` (PR #3) ya están mergeadas y se
borraron. **Nada de reescrituras desde cero de nuevo:** ya hubo dos versiones en paralelo y
costó una sesión entera desenredarlas. Si algo falla, se arregla en el archivo que corresponde.

## La moneda interna: reglas duras

La moneda (nombre a definir; la opción preferida es "Colmillos") es un **programa de lealtad**,
no una moneda. La diferencia no es semántica: es lo que separa esto de una casa de apuestas.
Cuatro reglas, las cuatro obligatorias:

1. **No se compra nunca.** No hay pack, no hay tienda de monedas, no hay "recarga".
2. **No se transfiere entre usuarios.** Sin mercado interno, sin regalar, sin comerciar.
   Un mercado P2P convierte la moneda en algo con precio real y nos deja exactamente donde
   no queremos estar.
3. **Se gana jugando**: participar, ganar, hacer check-in, rachas, referidos que se quedan.
4. **Se gasta en un catálogo cerrado** que fija la organización: cosméticos y roles (costo cero),
   y como techo Nitro o gift cards con tope mensual y a criterio de la organización.

Nunca se comunica como "gana plata jugando". Se comunica como recompensa por jugar.
El catálogo es un gasto real: entra a la caja y cuenta para el límite de premios + recompensas
sobre ingresos (70%).

> **Tensión conocida, a resolver antes de implementar el catálogo:** la regla 4 permite Nitro y
> gift cards como techo, y eso empuja contra la política de juego de Discord, que mira si la
> recompensa tiene "valor del mundo real". Mientras el catálogo sea cosméticos y roles no hay
> discusión. Si se habilita el techo, que sea con tope mensual, sin publicitarlo como
> conversión y con la decisión escrita. **No ampliar esto sin hablarlo con el dueño.**

## Identidad visual

Verde del logo (lobo verde neón sobre negro), no violeta. Los tokens se exportan como `TOKENS`
desde `src/web/plantilla.js` y el sitio público usa los mismos valores:

| Token | Valor | Uso |
|---|---|---|
| `--fondo` | `#050806` | negro con verde, nunca negro puro |
| `--panel` | `#0d160f` | tarjetas |
| `--panel-2` | `#122117` | inputs y superficies elevadas |
| `--borde` | `#1e3a26` | bordes |
| `--texto` | `#e4f2e7` | texto |
| `--tenue` | `#8ca694` | texto secundario |
| `--acento` | `#2fc94f` | verde del lobo: botones y datos vivos |
| `--acento-2` | `#5dff86` | glow: hover y títulos |
| `--ok` | `#3be85f` | estados correctos |
| `--alerta` | `#e0b84a` | advertencias (y la cinta del modo demo) |
| `--grave` | `#e5484d` | errores y acciones destructivas |

Detalles que ya se decidieron y conviene no volver atrás: el header va con
`linear-gradient(90deg, #0d160f, #0f2416)`, el hover de las filas con `rgba(47, 201, 79, 0.07)`,
y el texto de los botones va **oscuro** (`var(--fondo)`) sobre el verde, no blanco: el acento es
un verde neón claro y el blanco encima queda casi ilegible.

Tipografía: la del sistema. No se suman fuentes web salvo que haya una razón de marca fuerte,
porque cada fuente es tiempo de carga y el sitio público se juega el posicionamiento ahí.

## Lo próximo en la fila

1. `kripta-web`: sitio público de captación (hero con próximo torneo, ranking en vivo, cómo
   funciona, torneos de la semana, campeones, referidos), más anotador de Truco y convertidor
   de sensibilidad como herramientas para tráfico orgánico.
2. Bot de Discord: inscripción por reacción y rol de campeón automático. Es lo que le saca la
   mitad del trabajo manual al moderador.
3. Doble eliminación para los playoffs de temporada.
4. Exportar la caja a CSV para el contador.
5. Login con Discord (OAuth) si algún día operan más de dos personas.
