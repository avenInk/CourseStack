# 📁 Seguimiento de Cursos (Local)

Una aplicación sencilla que corre en tu computadora y te permite **ver tus videos de cursos descargados**, llevar el control de qué lecciones ya completaste, y ver recursos como PDFs, imágenes y textos, **todo sin necesidad de internet**.

---

## 🚀 ¿Cómo iniciar la aplicación?

### En Windows

1. Abre la carpeta donde descargaste esta aplicación.
2. Haz **doble clic** en el archivo llamado **`iniciar.bat`**.
3. Se abrirá una ventana negra (símbolo del sistema) — **no la cierres**, es normal.
4. Unos segundos después, se abrirá automáticamente tu navegador con la aplicación lista para usar.
5. Como recomendación, cada que se actualice la carpeta de cursos, ya sea añadiendo, modificando o eliminando archivos, es recomendable cerrar y abrir de nuevo el programa, para cerrar correctamente el servidor es con CRTL + C y seleccionar en las opciones 's' y ENTER.

> ⚠️ **Importante:** Mientras uses la aplicación, la ventana negra debe permanecer abierta. Si la cierras, la aplicación se detiene.

---

### En Mac o Linux

1. Abre la **Terminal**.
2. Navega hasta la carpeta de la aplicación. Por ejemplo:
   ```
   cd ~/Downloads/seguimiento-de-cursos
   ```
3. Ejecuta el siguiente comando:
   ```
   python3 servidor.py
   ```
4. Abre tu navegador y ve a la dirección: **http://localhost:9999**

> Si el puerto 9999 está ocupado, el servidor elegirá automáticamente otro y te lo indicará en la ventana de la terminal.

---

### 📱 En tu Móvil (Celular / Tablet)

¡La aplicación está totalmente optimizada para verse y funcionar perfecto en pantallas táctiles!

Para acceder desde tu teléfono:
1. Asegúrate de que **la aplicación esté corriendo en tu PC** (la ventana negra debe estar abierta).
2. Asegúrate de que tanto tu PC como tu teléfono estén conectados **al mismo WiFi** (red local).
3. Revisa la ventana negra en tu computadora; ahí verás una línea que dice algo como:
   `📱 En tu Móvil: http://192.168.1.5:9999`
4. Escribe esa dirección exacta (con todo y los números al final) en el navegador de tu celular (Safari, Chrome, etc.).

> 🔒 **Nota de privacidad:** Esta dirección solo funciona dentro de tu propia casa/red. Nadie de afuera de internet puede ver tus cursos.

---

## 📂 ¿Cómo organizar mis cursos?

Pon tus cursos dentro de una carpeta llamada **`Cursos`** (puedes usar mayúscula o minúscula, ambas funcionan). Esta carpeta debe estar en el mismo lugar que el archivo `iniciar.bat`.

### Estructura de ejemplo:

```
📁 seguimiento-de-cursos/         ← Carpeta de la aplicación
│
├── iniciar.bat
├── servidor.py
├── index.html
│
└── 📁 Cursos/                    ← Aquí van tus cursos
    │
    ├── 📁 1 Curso de Piano Básico
    │   ├── 📁 Módulo 1 - Introducción
    │   │   ├── 01 Bienvenida.mp4
    │   │   ├── 02 Cómo usar el piano.mp4
    │   │   └── Notas.pdf
    │   ├── 📁 Módulo 2 - Escalas
    │   │   ├── 03 Escala de Do.mp4
    │   │   └── 04 Escala de Sol.mp4
    │   └── Recursos del curso.txt
    │
    └── 📁 2 Aprende Guitarra desde Cero
        ├── 01 Acordes básicos.mp4
        └── 02 Tu primera canción.mp4
```

> 📌 **Coloca una imagen aquí mostrando cómo se ve la carpeta en tu explorador de archivos**

---

### Reglas para nombrar los archivos y carpetas

- **Numera las lecciones** al inicio del nombre para que aparezcan en orden: `01 Introducción.mp4`, `02 Segunda lección.mp4`.
- Los **subcarpetas** dentro de cada curso aparecerán como secciones (bloques) en el menú lateral.
- Puedes tener **tantos niveles de carpetas como necesites** — la aplicación los mostrará todos correctamente.
- Si no tienes carpeta `Cursos`, la aplicación buscará los cursos directamente en su propia carpeta.

---

## 🗂️ Tipos de archivos soportados

La aplicación reconoce automáticamente los siguientes tipos de archivos:

### 🎬 Video
| Extensión | Descripción |
|-----------|-------------|
| `.mp4` | El formato más común y recomendado |
| `.m4v` | Video Apple |
| `.webm` | Video web moderno |
| `.mkv` | Matroska (muy común en descargas) |
| `.ts` | Streams de video (formato de transmisión) |

### 🎵 Audio
| Extensión | Descripción |
|-----------|-------------|
| `.mp3` | Audio más común |
| `.m4a` | Audio de alta calidad |
| `.flac` | Audio sin pérdida |
| `.ogg` | Audio libre |
| `.wav` | Audio sin comprimir |

### 📄 Documentos y Recursos
| Extensión | Descripción | ¿Se puede ver dentro de la app? |
|-----------|-------------|--------------------------------|
| `.pdf` | Documentos PDF | ✅ Sí, con visor integrado |
| `.txt` | Archivos de texto plano | ✅ Sí, con visor integrado |

### 🖼️ Imágenes
| Extensión | Descripción | ¿Se puede ver dentro de la app? |
|-----------|-------------|--------------------------------|
| `.png` | Imagen PNG | ✅ Sí, con visor integrado |
| `.jpg` / `.jpeg` | Fotografía JPEG | ✅ Sí, con visor integrado |
| `.gif` | Imagen animada | ✅ Sí, con visor integrado |
| `.webp` | Imagen web moderna | ✅ Sí, con visor integrado |
| `.svg` | Imagen vectorial | ✅ Sí, con visor integrado |

> 💡 **Todos los archivos** tienen un botón de descarga para que puedas guardarlos donde quieras.

---

## ▶️ ¿Cómo usar la aplicación?

### Pantalla principal
Al abrir la aplicación, verás las tarjetas de tus cursos con:
- El porcentaje de progreso completado.
- Cuántas lecciones tiene el curso y cuántas has terminado.
- La última lección que viste.

> 📌 **Coloca una imagen aquí mostrando la pantalla principal con los cursos**

### Reproducir una lección
1. Haz clic en la tarjeta del curso que quieres ver.
2. En el menú de la izquierda, encontrarás todas las lecciones organizadas por secciones.
3. Haz clic en cualquier lección para reproducirla.
4. Cuando termines de ver la lección, haz clic en el botón **"Marcar completado"** para registrar tu avance.

> 📌 **Coloca una imagen aquí mostrando el reproductor con el menú lateral**

### Controles del reproductor

| Acción | Cómo hacerlo |
|--------|--------------|
| Pausar / Reproducir | Clic en el botón ▶️ o presiona **Espacio** |
| Retroceder 10 segundos | Clic en ⏮️ o presiona **← (flecha izquierda)** |
| Avanzar 10 segundos | Clic en ⏭️ o presiona **→ (flecha derecha)** |
| Silenciar | Clic en 🔊 o presiona **M** |
| Pantalla completa | Clic en el ícono o presiona **F** |
| Cambiar velocidad | Clic en el botón **1x** (cicla entre 0.5x, 1x, 1.5x, 2x, etc.) |
| Subir velocidad | **Shift + →** |
| Bajar velocidad | **Shift + ←** |

---

## 📈 Seguimiento de progreso

- El progreso se guarda **automáticamente** cada pocos segundos mientras ves un video.
- Si cierras el navegador y vuelves a abrir la aplicación, el video retomará desde donde lo dejaste.
- Puedes ver tu historial de lecciones vistas haciendo clic en el ícono del **reloj** (🕐) en la barra superior.

---

## ❓ Preguntas frecuentes

**¿Necesito internet para usar la aplicación?**  
No, funciona completamente sin internet. Todo está en tu computadora.

**¿Qué pasa si cierro accidentalmente la ventana negra?**  
El servidor se detendrá. Para volver a usarla, haz doble clic en `iniciar.bat` de nuevo. Tu progreso no se perderá.

**¿En qué navegador funciona mejor?**  
Recomendamos **Google Chrome** o **Microsoft Edge**. Firefox también funciona pero puede tener limitaciones con algunos formatos de video (`.ts`).

**¿El puerto 9999 ya está en uso?**  
La aplicación lo detecta automáticamente y elige otro puerto libre. La dirección correcta se mostrará en la ventana negra.

**¿Puedo tener los videos en cualquier carpeta?**  
Sí, puedes poner tus cursos directamente en la carpeta de la aplicación o dentro de una subcarpeta llamada `Cursos`. No importa cuántos niveles de subcarpetas tengas.

---

## 🛠️ Requisitos del sistema

- **Python 3.8 o superior** instalado en tu computadora.
  - En Windows: descárgalo desde [python.org](https://www.python.org/downloads/)
  - En Mac: generalmente ya viene instalado.
- Un navegador web moderno (Chrome, Edge, Firefox).
- Los archivos de video o audio que quieras ver.

---

## 🔮 Próximamente

Pronto añadiremos soporte para **configuraciones nativas**. Podrás personalizar los colores, el logo, el nombre de la aplicación y la apariencia general de la web directamente desde un panel de opciones, **¡sin necesidad de saber programar ni tocar código!**

---

*Aplicación de código abierto para gestión local de cursos.*
