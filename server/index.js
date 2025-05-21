// Carga las variables de entorno desde el archivo .env
require("dotenv").config()

// Importa Express para crear el servidor HTTP
const express = require("express")

// Importa el módulo HTTP de Node.js para envolver Express
const http = require("http")

// Importa CORS para permitir peticiones desde el cliente React
const cors = require("cors")

// Importa la clase Server de socket.io para habilitar WebSockets
const { Server } = require("socket.io")

// Importa DNS para resolver nombres de host a partir de IPs
const dns = require("dns")

// Crea la aplicación de Express
const app = express()

app.set("trust proxy", true)

// Configura CORS
app.use(cors({ origin: true, credentials: true }))

// Crea el servidor HTTP a partir de la app de Express
const server = http.createServer(app)

// Inicializa Socket.IO sobre el servidor HTTP y aplica la misma política CORS
const io = new Server(server, {
    cors: {
        origin: true,
        methods: ["GET", "POST"],
        credentials: true,
    },
})

// Estructura para almacenar información de las salas
const rooms = new Map()
// Estructura para almacenar mapeo entre fingerprints de máquinas y salas
const machineToRoom = new Map()

// Función para generar un PIN único de 6 dígitos
function generateUniquePin() {
    let pin
    do {
        // Genera un número de 6 dígitos (entre 100000 y 999999)
        pin = Math.floor(100000 + Math.random() * 900000).toString()
    } while (rooms.has(pin)) // Asegura que el PIN no exista ya
    return pin
}

// Maneja las nuevas conexiones de clientes Socket.IO
io.on("connection", (socket) => {
    // Extrae la dirección IP del cliente (para registro)
    const rawIp = socket.handshake.headers["x-forwarded-for"]?.split(",")[0] || socket.handshake.address
    const clientIp = rawIp.replace("::ffff:", "").trim()

    console.log(`Cliente conectado: ${clientIp}`)

    // Datos del cliente
    let machineFingerprint = null
    let currentRoom = null
    let userNickname = null

    // Evento para recibir el fingerprint de la máquina
    socket.on("register_fingerprint", (data) => {
        machineFingerprint = data.fingerprint
        console.log(`Fingerprint registrado para ${clientIp}: ${machineFingerprint}`)

        // Intenta resolver el nombre de host inverso para la IP del cliente
        dns.reverse(clientIp, (err, hostnames) => {
            // Si hay un hostname válido, lo usamos; si no, dejamos la IP
            const clientHost = !err && hostnames && hostnames.length ? hostnames[0] : clientIp

            // Envía al cliente su propia info de host e IP
            socket.emit("host_info", {
                ip: clientIp,
                host: clientHost,
                fingerprint: machineFingerprint,
            })
        })
    })

    // Evento para crear una nueva sala
    socket.on("create_room", ({ name, maxParticipants, encrypted, oneConnectionPerMachine }) => {
        // Verifica que el cliente haya enviado su fingerprint
        if (!machineFingerprint) {
            socket.emit("error", { message: "No se ha registrado la huella de la máquina. Recarga la página." })
            return
        }

        // Verifica si la máquina ya está en una sala
        if (machineToRoom.has(machineFingerprint) && oneConnectionPerMachine) {
            socket.emit("error", { message: "Ya estás conectado a una sala desde esta máquina. Debes salir primero." })
            return
        }

        const roomPin = generateUniquePin()

        // Crea la estructura de la sala
        rooms.set(roomPin, {
            name,
            maxParticipants: Number.parseInt(maxParticipants, 10),
            encrypted: encrypted,
            oneConnectionPerMachine: oneConnectionPerMachine,
            participants: new Map(),
            createdAt: new Date(),
        })

        console.log(`Sala creada: ${name} con PIN: ${roomPin}`)

        // Responde con el PIN generado
        socket.emit("room_created", {
            pin: roomPin,
            name,
            maxParticipants,
            encrypted,
            oneConnectionPerMachine,
        })
    })

    // Evento para unirse a una sala
    socket.on("join_room", ({ roomPin, nickname }) => {
        // Verifica que el cliente haya enviado su fingerprint
        if (!machineFingerprint) {
            socket.emit("error", { message: "No se ha registrado la huella de la máquina. Recarga la página." })
            return
        }

        // Verifica si la sala existe
        if (!rooms.has(roomPin)) {
            socket.emit("room_not_found")
            return
        }

        const room = rooms.get(roomPin)

        // Verifica si la sala está llena
        if (room.participants.size >= room.maxParticipants) {
            socket.emit("room_full")
            return
        }

        // Verifica si la máquina ya está en otra sala y si la sala tiene la restricción de una conexión por máquina
        if (room.oneConnectionPerMachine) {
            // Si la máquina ya está en cualquier sala, bloquea
            if (machineToRoom.has(machineFingerprint)) {
                socket.emit("error", { message: "Solo se permite una conexión por máquina." })
                return
            }

            // Si la máquina ya está en la sala actual, bloquea
            for (const participant of room.participants.values()) {
                if (participant.machineFingerprint === machineFingerprint) {
                    socket.emit("error", { message: "Solo se permite una conexión por máquina en esta sala." })
                    return
                }
            }
        }

        // Guarda información del usuario
        userNickname = nickname
        currentRoom = roomPin

        // Añade el usuario a la sala
        room.participants.set(socket.id, {
            nickname,
            id: socket.id,
            ip: clientIp,
            machineFingerprint: machineFingerprint,
        })

        // Si la sala tiene restricción de una conexión por máquina, registra la máquina
        if (room.oneConnectionPerMachine) {
            machineToRoom.set(machineFingerprint, roomPin)
        }

        // Une el socket a la sala
        socket.join(roomPin)

        // Notifica a todos en la sala que el usuario se ha unido
        io.to(roomPin).emit("user_joined", { nickname })

        // Envía la lista actualizada de participantes
        const participantsList = Array.from(room.participants.values()).map((p) => ({
            nickname: p.nickname,
            id: p.id,
        }))
        io.to(roomPin).emit("participants_update", participantsList)

        //Notifica a todos los admins para refrescar la lista de salas
        io.emit("rooms_update")

        console.log(`${nickname} se unió a la sala ${roomPin}`)
    })

    //Evento para enviar un mensaje
    socket.on("send_message", (msg) => {
        // Verifica si el cliente está en una sala
        if (!currentRoom) return

        // Reenvía ese mensaje a todos los clientes conectados
        io.to(currentRoom).emit("receive_message", msg)
        console.log(`Mensaje en sala ${currentRoom} de ${msg.author}: ${msg.message}`)
    })

    // Evento para obtener la lista de salas (para el panel de administrador)
    socket.on("get_rooms", () => {
        const roomsList = Array.from(rooms.entries()).map(([pin, room]) => ({
            id: pin,
            pin,
            name: room.name,
            maxParticipants: room.maxParticipants,
            currentParticipants: room.participants.size,
            encrypted: room.encrypted,
            oneConnectionPerMachine: room.oneConnectionPerMachine,
            createdAt: room.createdAt,
        }))

        socket.emit("rooms_list", roomsList)
    })

    // Evento para eliminar una sala (para el panel de administrador)
    socket.on("delete_room", (roomPin) => {
        if (rooms.has(roomPin)) {
            // Notifica a todos los participantes que la sala ha sido eliminada
            io.to(roomPin).emit("room_deleted")

            // Elimina todas las entradas de machineToRoom que apuntan a esta sala
            for (const [fingerprint, pin] of machineToRoom.entries()) {
                if (pin === roomPin) {
                    machineToRoom.delete(fingerprint)
                }
            }

            // Elimina la sala
            rooms.delete(roomPin)
            console.log(`Sala ${roomPin} eliminada`)

            // Envía la lista actualizada de salas
            socket.emit("room_deleted_success", roomPin)
        }
    })

    // Evento para salir de una sala
    socket.on("leave_room", () => {
        handleDisconnect()
    })

    // Función para manejar la desconexión del usuario
    const handleDisconnect = () => {
        if (currentRoom && rooms.has(currentRoom)) {
            const room = rooms.get(currentRoom)

            // Elimina al usuario de la sala
            room.participants.delete(socket.id)

            // Si la sala tiene restricción de una conexión por máquina, libera la máquina
            if (room.oneConnectionPerMachine && machineFingerprint) {
                machineToRoom.delete(machineFingerprint)
            }

            // Notifica a todos en la sala que el usuario ha salido
            if (userNickname) {
                io.to(currentRoom).emit("user_left", { nickname: userNickname })
            }

            // Actualiza la lista de participantes
            const participantsList = Array.from(room.participants.values()).map((p) => ({
                nickname: p.nickname,
                id: p.id,
            }))
            io.to(currentRoom).emit("participants_update", participantsList)

            // Notifica a todos los admins para refrescar la lista de salas
            io.emit("rooms_update")

            // Si la sala queda vacía, la elimina después de un tiempo
            if (room.participants.size === 0) {
                setTimeout(
                    () => {
                        if (rooms.has(currentRoom) && rooms.get(currentRoom).participants.size === 0) {
                            rooms.delete(currentRoom)
                            console.log(`Sala ${currentRoom} eliminada por inactividad`)
                        }
                    },
                    1000 * 60 * 30,
                ) // 30 minutos
            }

            socket.emit("room_left")
            console.log(`${userNickname || "Usuario"} salió de la sala ${currentRoom}`)

            // Limpia las variables
            currentRoom = null
            userNickname = null
        }
    }

    // Detecta cuando un cliente se desconecta
    socket.on("disconnect", () => {
        handleDisconnect()
        console.log(`Cliente desconectado: ${clientIp}`)
    })
})

// Lee el puerto desde .env (o usa 5000 por defecto)
const PORT = process.env.PORT || 5000
// Inicia el servidor escuchando en el puerto configurado
server.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`)
})
