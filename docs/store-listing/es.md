# Store listing — Español

> Machine-drafted; have a native speaker review before publishing.

## Name

Reddit Slideshow Spectacular!

## Summary

Convierte tus feeds de Reddit, antiguos o nuevos, en un pase de diapositivas multimedia a pantalla completa y controlado con el teclado. Gratis, privado, local y sin rastreo.

## Description

Reddit Slideshow Spectacular! convierte tus feeds de Reddit en un pase de diapositivas multimedia a pantalla completa y controlado con el teclado. Abre un feed, subreddit, multireddit o resultados de búsqueda en old.reddit.com o www.reddit.com, haz clic en el icono de la barra de herramientas (o pulsa Alt+Shift+S) y recuéstate a disfrutar.

El pase de diapositivas reutiliza tu sesión de Reddit ya iniciada: sin claves de API, sin inicio de sesión adicional y sin cuentas extra. Recorre las publicaciones multimedia en el orden en que Reddit las devuelve y avanza por el feed de forma automática, de modo que el pase de diapositivas continúa más allá de la primera página.

NOVEDADES - V1.2.0

- Nuevos atajos de teclado: D para descargar la imagen o el vídeo actual, I para bloquear al autor (y omitir su publicación), y A para agregarlo como amigo o seguirlo
- Ajustes independientes «Mostrar siempre el contador y los omitidos» y «Mostrar siempre el título y la firma»
- Un contador de posición y un indicador de omitidos más discretos, con un pequeño indicador giratorio en la esquina mientras se carga la siguiente diapositiva
- Corregido: los controles ahora se ocultan al estar inactivos incluso después de hacer clic en uno con el ratón

Notas completas de la versión: https://github.com/Rio517/reddit-slideshow-spectacular/releases/tag/v1.2.0

QUÉ REPRODUCE

- Imágenes directas de Reddit (resolución completa desde i.redd.it cuando está disponible)
- Galerías de Reddit, desplegadas en una diapositiva por imagen
- Vídeo alojado en Reddit (v.redd.it), con su sonido (la pista de audio independiente)
- Clips de Redgifs, Imgur (.gifv), Streamable y Giphy, reproducidos como vídeo nativo
- Álbumes de Imgur, desplegados en una diapositiva por imagen
- Archivos de vídeo e imagen de Catbox
- Crossposts, resueltos al contenido multimedia de la publicación original

La cola es solo multimedia: las publicaciones de texto, los enlaces a artículos externos, los anuncios fijados y las publicaciones patrocinadas se omiten; el contenido que no carga también se salta, así que el pase de diapositivas nunca se detiene en una diapositiva vacía.

CONTROLES

- Teclado: Left/Right para avanzar y retroceder (Shift+Right salta a la siguiente publicación; Page Up/Page Down saltan 10 hacia atrás/adelante), Up/Down para votar positivo/negativo, Space para reproducir/pausar, M para silenciar, F para pantalla completa, D para descargar, I para bloquear al autor (y omitir su publicación), A para agregarlo como amigo o seguirlo, Esc para cerrar
- Una barra de controles en pantalla: anterior, reproducir/pausar, siguiente, silenciar, pantalla completa, abrir en ventana y ajustes
- Bajo cada diapositiva: una línea de créditos (quién la publicó, en qué subreddit, la fuente y la resolución), con botones para abrir la publicación original o descargar el contenido
- Haz clic en el contador de posición para ir directamente a cualquier publicación de la cola cargada
- Haz clic en el fondo oscuro para cerrar
- Las imágenes avanzan con un temporizador que tú ajustas; el temporizador sigue corriendo aunque avances manualmente con las flechas, y los vídeos avanzan al terminar el clip

DETALLES AGRADABLES

- Transiciones entre diapositivas: fundido, deslizamiento, empuje, zoom, volteo o ninguna
- Barra de cuenta atrás opcional en la parte superior (en diapositivas de vídeo, en todas las diapositivas o nunca)
- Paneo y zoom lento opcional para imágenes demasiado grandes para verse de una vez
- Contador de posición y título de la publicación siempre visibles para que sepas dónde estás
- "Abrir en ventana" reabre el pase de diapositivas en una ventana emergente minimalista, lista para emitir por AirPlay o Chromecast a un televisor o segunda pantalla para disfrutar de un feed cómodo en pantalla grande
- Omisión de duplicados: se saltan reposts, crossposts y galerías repetidas; además, un hash perceptual (activado por defecto) también detecta la misma imagen subida de nuevo con un enlace diferente, ya sea sola o dentro de una galería
- "Abrir original" lleva directamente a la publicación fuente

AJUSTES (se aplican en tiempo real, sin recarga)

- Tiempo por imagen (de 1 segundo a 5 minutos, con escala de precisión en los valores bajos)
- Transición entre diapositivas
- Visibilidad de la barra del temporizador
- Tiempo de espera para contenido lento antes de pasar al siguiente
- Reproducción automática de vídeos activada/desactivada, inicio silenciado activado/desactivado
- Incluir contenido NSFW — por defecto sigue tu sesión de Reddit, mostrando contenido para mayores de 18 solo en la medida en que tu cuenta ya lo haga
- Omitir contenido multimedia duplicado, incluidas imágenes subidas de nuevo (activado por defecto)
- Paneo y zoom en imágenes grandes (o en todas las imágenes), con control total sobre la secuencia

PRIVACIDAD

Sin analíticas, sin rastreo, sin anuncios, sin cuentas y sin servidores del desarrollador (no existen). La extensión solo obtiene el contenido que estás viendo: el feed y su contenido multimedia desde Reddit, y los clips de proveedores como Imgur, Redgifs, Streamable, Giphy y Catbox. Lo único que escribe en tu cuenta de Reddit es votar (teclas arriba/abajo), bloquear a un autor (I) y agregar o seguir a un autor (A), y solo cuando pulsas la tecla correspondiente. Tus ajustes se almacenan localmente en tu ordenador y no incluye código remoto. Política completa: consulta el enlace a la política de privacidad.

Código abierto, licencia MIT.
