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

Cualquier cambio que rompa una de estas cinco cosas está mal, incluso si el código funciona:

1. **El premio es fijo y desacoplado de las inscripciones.** Se define al crear el torneo,
   se anuncia antes de abrir la inscripción y es el mismo con 4 o con 16 participantes.
   Si el premio coincide con lo recaudado, el panel tiene que alertar: así se lee como
   *pozo mutuo*, que es la figura que hay que evitar (art. 301 bis del Código Penal;
   antecedente: intimación de ALEA a Mercado Libre por los "torneos de amigos", junio 2026).
2. **Mayoría de edad obligatoria en cualquier instancia con dinero.** Si un torneo tiene
   inscripción o premio, sólo entran jugadores con 18+ confirmado. Para el resto existe la
   **Pista Libre**: inscripción 0, premio 0, abierta a todos.
3. **La moneda virtual del servidor no se convierte a nada de valor real.** Ni gift cards,
   ni dinero, ni ventajas compradas. En cuanto es canjeable, entra en la definición de
   "valor del mundo real" de la política de juego de Discord.
4. **Nunca se usa vocabulario de apuestas.** Se dice "inscripción", "premio", "concurso de
   habilidad". Nunca "pozo", "apuesta", "banca" ni "casa". Aplica al código, a la UI y a los
   textos generados para Discord.
5. **Nada de sponsors ni afiliados de casas de apuestas.** En PBA sólo hay 7 licencias de
   juego online y los sitios legales terminan en `.bet.ar`; promocionar otros es promocionar
   juego ilegal, y además destruye el argumento de que los torneos no son apuestas.

## Convenciones técnicas

- **Todo el dinero en centavos enteros.** Nunca float para pesos.
- **La lógica de negocio vive en `src/domain/`**, en funciones puras, con su test.
  Las rutas de `src/web/rutas/` sólo traducen HTTP a llamadas de dominio. Si aparece una regla
  de negocio dentro de una ruta, está en el lugar equivocado.
- **Todo el SQL vive en `src/db/repo.ts`.** Ningún otro archivo habla SQL.
- **Todo lo que se muestre pasa por `esc()`** de `src/web/layout.ts` antes de entrar al HTML.
- **Español rioplatense** en UI, comentarios, mensajes de error y nombres de dominio
  (`torneos`, `participantes`, `partidos`, `movimientos`). Los nombres técnicos pueden quedar
  en inglés cuando es lo natural (`bestOf`, `id`).
- **El beneficio del moderador se calcula sobre el saldo** (ingresos − egresos), nunca sobre
  los ingresos: es lo que alinea sus incentivos con la salud de la caja. Si el mes cierra en
  rojo, es 0 y no se acumula.
- **Sin dependencias nuevas salvo que haya una razón fuerte.** El stack es a propósito chico:
  Node + Express + SQLite + HTML renderizado en el servidor, sin build de front.

## Cómo verificar antes de decir que algo funciona

```bash
npm run typecheck          # tipos
npm test                   # 51 tests de dominio e integración
npm run build && npm start # y después scripts/smoke.mjs contra el server levantado
```

Un comando que termina sin error no es prueba de que la funcionalidad ande: hay que verla andar.

## Rigor con los datos

Cuando se hable de plata, crecimiento o marco legal: separar **evidencia** (con link) de
**hipótesis**. Lo que no se encuentre, se dice "no encontrado", no se estima. Aplica también a
los comentarios del código y a la documentación.

## Lo próximo en la fila

1. Bot de Discord: inscripción por reacción y rol de campeón automático.
2. Doble eliminación para los playoffs de temporada.
3. Exportar la caja a CSV para el contador.
4. Login con Discord (OAuth) si algún día operan más de dos personas.


---

## Arquitectura decidida (agosto 2026)

Son **dos aplicaciones separadas** con una sola base de datos compartida:

```
kripta-web  (Next.js en Vercel, publico)     -> capta gente de afuera y la lleva al Discord
      |  lee
      v
Turso / libSQL  (base compartida, free tier) -> unica fuente de verdad
      ^
      |  escribe
monsterland-panel (este repo, privado)       -> la operacion: torneos, pagos, ranking, caja
```

Por que asi y no todo junto: el panel lo usan 2 personas y escribe datos sensibles; el sitio
publico lo visitan desconocidos, tiene que cargar rapido y posicionar en Google. Mezclarlos
obliga a elegir mal en los dos lados.

**Decision cerrada sobre las ramas:** se sigue con `main` (TypeScript + libSQL/Turso).
La rama `app-nueva-vercel` (reescritura en JavaScript plano con Postgres) **no se mergea**:
funciona, pero tirar los tipos justamente cuando el mantenimiento va a ser asistido por IA es
ir en contra. Se conserva como referencia y nada mas. Si algun dia hay que pasar a Postgres,
se cambia el driver dentro de `src/db/`, no se reescribe la app.

## La moneda interna: reglas duras

La moneda (nombre a definir) es un **programa de lealtad**, no una moneda. La diferencia no es
semantica: es lo que separa esto de una casa de apuestas. Cuatro reglas, las cuatro obligatorias:

1. **No se compra nunca.** No hay pack, no hay tienda de monedas, no hay "recarga".
2. **No se transfiere entre usuarios.** Sin mercado interno, sin regalar, sin comerciar.
   Un mercado P2P convierte la moneda en algo con precio real y nos deja exactamente donde
   no queremos estar.
3. **Se gana jugando**: participar, ganar, hacer check-in, rachas, referidos que se quedan.
4. **Se gasta en un catalogo cerrado** que fija la organizacion: cosmeticos y roles (costo cero),
   y como maximo Nitro o gift cards con tope mensual y a criterio de la organizacion.

Nunca se comunica como "gana plata jugando". Se comunica como recompensa por jugar.
El catalogo es un gasto real: entra a la caja y cuenta para el limite de premios + recompensas
sobre ingresos (70%).

## Identidad visual

Verde del logo (lobo verde neon sobre negro), no violeta. Los tokens viven en
`src/web/layout.ts` y el sitio publico usa los mismos:

| Token | Valor | Uso |
|---|---|---|
| `--fondo` | `#050806` | negro con verde, nunca negro puro |
| `--panel` | `#0d160f` | tarjetas |
| `--panel-2` | `#122117` | inputs y superficies elevadas |
| `--borde` | `#1e3a26` | bordes |
| `--texto` | `#e4f2e7` | texto |
| `--tenue` | `#8ca694` | texto secundario |
| `--acento` | `#2fc94f` | verde del lobo: botones y datos vivos |
| `--acento-2` | `#5dff86` | glow: hover y titulos |

Tipografia: la del sistema. No se suman fuentes web salvo que haya una razon de marca fuerte,
porque cada fuente es tiempo de carga y el sitio publico se juega el posicionamiento ahi.
