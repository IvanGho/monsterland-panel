# Manual de operación — Torneos de la Kripta

Este documento es para el **moderador de torneos**. Es el contrato de trabajo informal: lo que hay que hacer,
cuándo, y qué cosas no se hacen nunca. Si algo de acá no se puede cumplir, se avisa y se reprograma:
un torneo reprogramado con aviso no rompe nada, un torneo que arranca tarde y termina mal sí.

---

## Las 5 reglas que no se rompen

1. **El premio se anuncia antes de abrir la inscripción y no cambia.** Ni si se anotan 4, ni si se anotan 16.
   Nunca se dice "el pozo", "la apuesta" o "lo que juntemos". Se dice "el premio".
2. **Nadie sin 18+ confirmado entra a un torneo con inscripción o premio.** El panel lo bloquea, pero el criterio
   es tuyo: si dudás de la edad de alguien, va a la Pista Libre y listo. Ante la duda, no cobra y no compite por plata.
3. **El premio se paga el mismo día.** Si no está la gift card, no se anuncia el torneo.
4. **Los cobros se registran en el momento.** Si cobrás y no lo cargás, la caja miente y a fin de mes no se sabe
   cuánto te corresponde.
5. **Si no llega el mínimo de inscriptos, se reprograma y se devuelve.** Sin excepciones ni "dale que jugamos 3".

---

## Rutina diaria (10 a 15 minutos, en horario pico: 21 a 23 hs)

| # | Tarea | Dónde |
|---|---|---|
| 1 | Abrir **Hoy** y leer las alertas. Si hay una roja, resolverla antes que nada. | `/` |
| 2 | Confirmar pagos nuevos: mirar Mercado Pago / alias, y marcar "Pago" en el torneo. | `/torneos/{id}` |
| 3 | Contestar las inscripciones del día en el canal de torneos (confirmar cupo, mandar el alias). | Discord |
| 4 | Si hay torneo esa noche: pedir check-in **30 minutos antes** con el texto que genera el panel. | `/torneos/{id}` |
| 5 | Anotar en el canal privado de staff cualquier quilombo (no se presentó, discusión de resultado, sospecha de edad). | Discord |

**Si hay torneo esa noche, sumale la rutina de evento:**

| Momento | Qué hacer |
|---|---|
| −60 min | Publicar recordatorio y abrir la sala de voz. |
| −30 min | Pedir check-in. El que no hace check-in **no entra a la llave**. |
| −5 min | Marcar presentes en el panel y apretar **Sortear llave**. |
| 0 | Publicar la llave (texto del panel) y arrancar. |
| Durante | Cargar cada resultado apenas termina. No se acumulan al final. |
| Final | Publicar el resultado, pedirle el alias al campeón, avisarle al admin para que pague. |
| +15 min | Publicar el ranking actualizado. Cerrar el torneo (estado `finalizado`). |

---

## Rutina semanal (30 a 40 minutos, día fijo: lunes)

1. **Crear los torneos de la semana** (dos: Valorant el martes o jueves, Truco el sábado) con premio y cupo definidos.
   Dejarlos en `borrador` hasta que el admin confirme el premio, después pasarlos a `inscripcion`.
2. **Publicar los dos anuncios** con el texto del panel.
3. **Revisar la caja de la semana**: que no haya inscripciones cobradas sin cargar. Si el ratio premios/ingresos
   pasó del 70%, avisarle al admin **antes** de anunciar el premio de la semana siguiente.
4. **Cortar 3 clips** de lo mejor de la semana (o marcarle los minutos al admin para que los corte).
5. **Mensaje de reactivación**: escribirle por privado a 3 jugadores que no aparecieron esta semana. Uno por uno,
   sin copiar y pegar. Esto es lo que más retención da y lo que más se abandona.
6. **Revisar Server Insights** de Discord (Configuración del servidor → Insights) y anotar tres números en el
   canal de staff: visitantes de la semana, comunicadores y retención de miembros nuevos.

---

## Rutina mensual (1 hora, primer lunes del mes)

1. **Cerrar el mes en la caja**: filtrar del 1 al último día, chequear que los premios pagados coincidan con los
   torneos jugados, y anotar el saldo.
2. **Calcular el beneficio del mod**: el panel lo muestra en Caja. Se paga sobre el **saldo** (ingresos − egresos),
   no sobre los ingresos. Si el mes cerró en rojo, ese mes no hay beneficio en plata (sí los beneficios fijos, ver abajo).
3. **Renovar o dar de baja los pases** que vencieron. Escribirle a cada uno antes de que venza, no después.
4. **Revisar el ranking** y armar el podio del mes con su rol.
5. **Reunión de 20 minutos con el admin**: qué formato retuvo más gente, qué torneo no llenó, qué se cambia el mes que viene.
6. **Backup de la base**: `pg_dump "$DATABASE_URL" > backup-$(date +%Y-%m).sql` y subir ese
   archivo a Drive. El proveedor ya hace backups, pero uno propio no depende de que la cuenta
   siga viva. (Si el panel está en modo demo no hay nada que respaldar: los datos se borran solos.)

---

## El acuerdo con el moderador

Esto no es un sueldo y conviene que quede claro por escrito, para los dos.

**Lo que recibe todos los meses, sin importar la caja:**

- Rol propio en el servidor con su color y su lugar en la jerarquía (Guardián de la Kripta).
- Pase de Temporada del nivel más alto, sin cargo, mientras cumpla el rol.
- Nitro Basic o el equivalente en gift card cuando la caja del mes cierra en positivo.
- Créditos en la transmisión y en el arte de cada temporada.
- Voz y voto en el formato de los torneos y en la elección del juego del mes.

**Lo que recibe según la caja:**

- **15% del saldo mensual** (ingresos − egresos del mes). Configurable en el `.env` con `PORCENTAJE_MOD`.
- Si el saldo es negativo o cero, ese mes no hay porcentaje. No se acumula deuda ni se arrastra al mes siguiente.

**Por qué sobre el saldo y no sobre los ingresos:** para que los dos estén del mismo lado. Si el porcentaje fuera
sobre lo recaudado, al mod le convendría vender inscripciones aunque los premios se coman todo. Sobre el saldo, le
conviene que la operación cierre bien.

**Lo que se espera a cambio:** las tres rutinas de arriba. Nada más. No es atención 24/7, no es moderación de todo
el servidor, no es responder a las 4 AM.

**Cómo se corta:** cualquiera de los dos avisa con dos semanas. Se termina la temporada en curso y ahí se corta.
No se deja una temporada a medias, porque el que paga la cuenta es el jugador que se anotó.

> Nota importante para el admin: un pago mensual fijo y regular por tareas dirigidas puede, en Argentina,
> discutirse como relación laboral encubierta. Por eso este esquema es variable, sin horario fijo, sin exclusividad
> y sin obligación de estar disponible. Si en algún momento el ingreso crece y esto se vuelve un trabajo de verdad,
> hay que formalizarlo bien (factura del mod como monotributista por servicios prestados) y consultarlo con un contador.
> El texto exacto de la presunción laboral (art. 23 de la Ley de Contrato de Trabajo) no lo verifiqué en fuente
> oficial, así que tratalo como una advertencia práctica y no como asesoramiento legal.

---

## Qué hacer cuando algo sale mal

| Situación | Qué se hace |
|---|---|
| No llega el mínimo de inscriptos | Se reprograma y se devuelve la inscripción. Se anuncia en el canal, no por privado. |
| Alguien no se presenta | Walkover a favor del rival (tildá "walkover" al cargar). No se devuelve la inscripción del ausente. |
| Discusión por un resultado | Decide el mod con la evidencia que haya (captura, VOD del stream). Si no hay evidencia, se repite el mapa. La decisión se anuncia y no se discute después. |
| Se cargó mal un resultado | Se corrige en el panel; los partidos posteriores se limpian solos y hay que volver a cargarlos. |
| Sospecha de que alguien es menor | Se lo saca del torneo pago, se le devuelve la inscripción y se lo invita a la Pista Libre. No se pide DNI ni foto: se saca y se avisa al admin. |
| Alguien pide jugar con la cuenta de otro | No juega. Un jugador, una cuenta, un Riot ID cargado en el panel. |
| Cae el panel a mitad de torneo | Se sigue en papel (la llave ya está publicada en el canal) y se carga todo después. La llave publicada en Discord es la fuente de verdad. |
| Alguien pide reembolso después de jugar | No corresponde. Antes de que arranque el torneo, sí. |
