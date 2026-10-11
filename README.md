# Cifras y Letras

Juego multijugador en tiempo real: login rápido con un nombre, una sala común con
todos los jugadores conectados, y partidas de **Letras** y **Cifras** alternas.

- **Letras**: aparecen 10 letras (4 vocales), sorteadas por frecuencia real
  (W y X salen muy de vez en cuando); las vocales o consonantes **pueden repetirse**.
  Forma la palabra más larga que exista en el diccionario. 1 punto por letra.
  Gana la más larga; en empate puntúan todos.
- **Cifras**: 6 números distintos (del 1 al 10 y 25/50/75/100) y un objetivo entre 100 y 999.
  Con sumas, restas, multiplicaciones y divisiones acércate al objetivo en 60 s.
  Puedes guardar **varios resultados** (como varias palabras en Letras): puntúa el mejor.
  **10 puntos** si lo clavas, **8** si eres el más cercano; en empate puntúan todos.
- Los jugadores arrastran las letras/números con el ratón y el cálculo es automático.
- En letras puedes formar varias palabras: puntúa la más larga que seas capaz. La bandeja
  muestra solo las letras que te quedan para la palabra en curso; **＋ Nueva palabra**
  las restaura todas.
- En cifras puedes guardar varios intentos con **＋ Guardar resultado**; cada intento
  recupera todos los números. **(...) Cerrar grupo** guarda un paréntesis para seguir
  operando con su resultado, pero cada grupo se gasta una sola vez.
- Sonidos sintetizados (sin ficheros) con botón de silencio 🔊 en la cabecera,
  confeti al puntuar y a lo grande si ganas la partida.
- Cada ronda dura 60 s (configurable) con cuenta atrás animada. Al terminar, los
  resultados **no** pasan solos: el anfitrión pulsa **Siguiente ronda** cuando queráis,
  para poder comentar la jugada.

## Requisitos

- Node.js **18 o superior** (ya incluido si despliegas con Docker).

## Arranque rápido (desarrollo)

```bash
npm install
npm run fetch-dictionary   # solo si falta data/palabras.txt
npm start                  # http://localhost:3000
```

En servidores compartidos puedes elegir otro puerto sin tocar el código, p. ej.
`PORT=27182 npm start` (y `HOST=127.0.0.1` para escuchar solo en local).

El diccionario ya viene incluido en `data/palabras.txt`. Si quieres regenerarlo,
borra ese archivo y ejecuta `npm run fetch-dictionary`.

## Pruebas

```bash
npm install            # incluye dependencias de desarrollo
npm test               # arranca un servidor de prueba y simula una partida completa
```

## Despliegue en un servidor Linux

### Opción A — instalador automático (Debian/Ubuntu)

```bash
# copia la carpeta del proyecto al servidor y ejecuta:
sudo bash deploy/install.sh
```

Instala Node.js si falta, crea el usuario `cifras`, copia la app a `/opt/cifras-y-letras`,
instala las dependencias y configura un servicio `systemd` que arranca solo.
Abre la web en `http://IP_DEL_SERVIDOR:3000`.

Configuración opcional: edita `/etc/cifras-y-letras.env` y reinicia
(`systemctl restart cifras-y-letras`).

### Opción B — Docker

```bash
docker build -t cifras-y-letras .
docker run -d --restart unless-stopped -p 3000:3000 --name cifras-y-letras cifras-y-letras
```

### Opción C — manual

```bash
npm install --omit=dev
PORT=3000 node server/index.js
```

## Configuración (variables de entorno)

| Variable              | Defecto | Descripción                                   |
|-----------------------|---------|-----------------------------------------------|
| `PORT`                | `3000`  | Puerto HTTP                                   |
| `HOST`                | `0.0.0.0`| Interfaz de escucha                          |
| `ROOM_NAME`           | `Sala principal` | Nombre de la sala                   |
| `ROUND_TIME_SECONDS`  | `60`    | Segundos de cada ronda                        |
| `COUNTDOWN_SECONDS`   | `5`     | Cuenta atrás antes de cada ronda              |
| `RESULTS_SECONDS`     | `12`    | Tiempo de pantalla de resultados               |
| `NUM_ROUNDS`          | `8`     | Rondas por partida (alternas letras/cifras)    |
| `MIN_WORD_LENGTH`     | `3`     | Longitud mínima de palabra válida              |
| `VOWELS_PER_ROUND`    | `4`     | Vocales en cada ronda de letras                |
| `NUM_NUMBERS`         | `6`     | Cifras por ronda de cifras                     |
| `MAX_NUMBER_ATTEMPTS` | `10`    | Resultados distintos por jugador en cifras     |
| `POINTS_EXACT`        | `10`    | Puntos por clavar el objetivo                  |
| `POINTS_CLOSE`        | `8`     | Puntos por la aproximación más cercana         |
| `DICTIONARY_FILE`     | `data/palabras.txt` | Ruta del diccionario            |

## Cómo se juega

1. **Entra**: escribe un nombre y pulsa "Entrar en la sala". El primero en entrar es
   el anfitrión y tiene el botón **Comenzar la partida**.
2. **Letras**: arrastra las letras a las filas para construir palabras. Se validan
   al instante contra el diccionario (verde = válida). Puedes tener varias palabras a la vez
   y la bandeja se vacía con las letras que ya usas en la palabra actual: pulsa
   **＋ Nueva palabra** y vuelven a aparecer las 10. Un **doble toque/click** en una letra
   la añade al final de la última palabra que estabas escribiendo.
3. **Cifras**: elige números y operaciones; el valor y la distancia al objetivo se
   calculan solos. La resta no puede dar negativo y la división debe ser exacta.
   Con **(...) Cerrar grupo** cierras un paréntesis: queda guardado con su resultado
   y puedes tocarlo para usarlo en otra operación (p. ej. `4−3=1` y seguir con ese 1);
   cada grupo se gasta una sola vez, igual que los números. Con **＋ Guardar resultado**
   registras el intento actual y recuperas todos los números para probar otro.
4. Al terminar cada ronda se muestran los resultados y los puntos; el anfitrión pulsa
   **Siguiente ronda** cuando queráis (así se puede comentar la jugada). Se alternan
   Letras y Cifras. Al final, clasificación completa.

## Notas técnicas

- El diccionario es la lista abierta de palabras españolas
  [`words/an-array-of-spanish-words`](https://github.com/words/an-array-of-spanish-words),
  normalizada (mayúsculas, sin tildes). Es una aproximación práctica al diccionario de
  la RAE; las palabras con tilde se escriben con su letra base.
- Comunicación en tiempo real con **Socket.IO**; el servidor valida palabras, expresiones
  y puntuaciones (ni clonando ni manipulando el cliente se puede hacer trampa).
- Después de cada ronda de letras/cifras se muestra además la mejor solución posible.