# ChatSala-WebSocket 💬

Una aplicación de chat en tiempo real desarrollada con **React**, **TypeScript**, **Node.js** y **Socket.IO**. Permite crear salas de chat temporales con identificación única por dispositivo mediante fingerprinting.

## 🚀 Características

- **Chat en tiempo real** con WebSockets (Socket.IO)
- **Salas temporales** con PIN único de 6 dígitos
- **Identificación por dispositivo** usando fingerprinting
- **Panel de administración** para gestionar salas
- **Interfaz moderna** con TailwindCSS y componentes Radix UI
- **Control de participantes** por sala
- **Conexión única por dispositivo** (opcional)
- **Detección automática de IP y hostname**

## 🏗️ Arquitectura

El proyecto está dividido en dos partes principales:

```
Chat-WebSocket/
├── cliente/          # Frontend - React + TypeScript
│   ├── src/
│   │   ├── components/     # Componentes UI reutilizables
│   │   ├── pages/         # Páginas principales
│   │   ├── services/      # Servicios (fingerprinting, storage)
│   │   └── utils/         # Utilidades
│   └── public/       # Archivos estáticos
├── server/           # Backend - Node.js + Express + Socket.IO
└── README.md
```

## 🛠️ Tecnologías

### Frontend (Cliente)
- **React 19** - Framework de interfaz de usuario
- **TypeScript** - Tipado estático
- **TailwindCSS** - Framework CSS
- **Radix UI** - Componentes accesibles
- **Socket.IO Client** - Comunicación en tiempo real
- **FingerprintJS** - Identificación única de dispositivos
- **React Router** - Navegación

### Backend (Servidor)
- **Node.js** - Runtime de JavaScript
- **Express** - Framework web
- **Socket.IO** - WebSockets para tiempo real
- **CORS** - Control de acceso entre dominios
- **dotenv** - Variables de entorno

## 🚀 Instalación y Configuración

### Prerrequisitos
- Node.js (versión 16 o superior)
- npm o yarn

### Configuración del Servidor

1. Navega al directorio del servidor:
```bash
cd server
```

2. Instala las dependencias:
```bash
npm install
```

3. Crea un archivo `.env` (opcional):
```bash
PORT=5000
```

4. Inicia el servidor:
```bash
node index.js
```

El servidor estará corriendo en `http://localhost:5000`

### Configuración del Cliente

1. Navega al directorio del cliente:
```bash
cd cliente
```

2. Instala las dependencias:
```bash
npm install
```

3. Inicia la aplicación:
```bash
npm start
```

La aplicación estará disponible en `http://localhost:3000`

## 📱 Uso

### Para Usuarios

1. **Página Principal**: Ingresa tu nickname y el PIN de la sala para unirte
2. **Chat**: Envía mensajes en tiempo real con otros participantes
3. **Participantes**: Ve quién está conectado en la sala

### Para Administradores

1. **Panel de Administración**: Accede a `/admin`
2. **Crear Salas**: 
   - Nombre de la sala
   - Número máximo de participantes
   - Opción de una conexión por dispositivo
3. **Gestionar Salas**: Ve estadísticas y elimina salas activas

## 🔧 Funcionalidades Técnicas

### Fingerprinting de Dispositivos
- Genera una huella digital única por dispositivo
- Permite control de acceso por máquina
- Sincronización entre pestañas del navegador

### Gestión de Salas
- PIN único de 6 dígitos por sala
- Eliminación automática de salas inactivas (10 minutos)
- Control de participantes máximos
- Identificación del creador de la sala

### Comunicación en Tiempo Real
- Mensajes instantáneos
- Notificaciones de usuarios conectados/desconectados
- Actualizaciones de participantes en tiempo real

## 🌐 Despliegue

### Servidor
El servidor puede desplegarse en servicios como:
- Heroku
- Render
- Railway
- DigitalOcean

### Cliente
El cliente puede desplegarse en:
- Vercel
- Netlify
- Firebase Hosting
- GitHub Pages

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es de código abierto y está disponible bajo la licencia MIT.

## 👨‍💻 Autor

**EdJGM** - *Desarrollo inicial*

## 🐛 Reporte de Bugs

Si encuentras algún bug o tienes sugerencias, por favor abre un issue en el repositorio.

---

## 📚 Documentación Adicional

### Eventos de Socket.IO

#### Cliente → Servidor
- `register_fingerprint` - Registra la huella del dispositivo
- `join_room` - Se une a una sala
- `send_message` - Envía un mensaje
- `create_room` - Crea nueva sala
- `delete_room` - Elimina sala
- `get_rooms` - Obtiene lista de salas
- `leave_room` - Abandona sala

#### Servidor → Cliente
- `host_info` - Información del host/IP
- `room_created` - Confirmación de sala creada
- `room_not_found` - Sala no encontrada
- `user_joined` - Usuario se unió
- `user_left` - Usuario abandonó
- `receive_message` - Mensaje recibido
- `participants_update` - Actualización de participantes
- `rooms_list` - Lista de salas
- `creator_rooms` - Salas creadas por el usuario

### Estructura de Datos

```typescript
interface Room {
  pin: string
  name: string
  maxParticipants: number
  currentParticipants: number
  createdAt: Date
  oneConnectionPerMachine: boolean
  creatorFingerprint: string
}

interface Message {
  author: string
  message: string
  timestamp: number
}

interface Participant {
  nickname: string
  id: string
  isCreator: boolean
}
```
