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
// Estructura para almacenar mapeo entre creadores de salas y sus salas
const creatorToRooms = new Map()

// Función para generar un PIN único de 6 dígitos
function generateUniquePin() {
    let pin
    do {
        // Genera un número de 6 dígitos (entre 100000 y 999999)
        pin = Math.floor(100000 + Math.random() * 900000).toString()
    } while (rooms.has(pin)) // Asegura que el PIN no exista ya
    return pin
}

// Función para programar la eliminación de una sala inactiva
function scheduleRoomDeletion(roomPin, timeoutMinutes = 10) {
    if (rooms.has(roomPin)) {
        // Cancelar cualquier temporizador existente
        if (rooms.get(roomPin).deletionTimer) {
            clearTimeout(rooms.get(roomPin).deletionTimer)
        }

        // Programar la eliminación después del tiempo especificado
        const deletionTimer = setTimeout(
            () => {
                if (rooms.has(roomPin)) {
                    const room = rooms.get(roomPin)

                    // Solo eliminar si la sala está vacía
                    if (room.participants.size === 0) {
                        // Eliminar la sala de la lista de salas del creador
                        if (room.creatorFingerprint && creatorToRooms.has(room.creatorFingerprint)) {
                            const creatorRooms = creatorToRooms.get(room.creatorFingerprint)
                            const updatedRooms = creatorRooms.filter((pin) => pin !== roomPin)

                            if (updatedRooms.length === 0) {
                                creatorToRooms.delete(room.creatorFingerprint)
                            } else {
                                creatorToRooms.set(room.creatorFingerprint, updatedRooms)
                            }
                        }

                        // Eliminar la sala
                        rooms.delete(roomPin)
                        console.log(`Sala ${roomPin} eliminada automáticamente por inactividad (${timeoutMinutes} minutos)`)

                        // Notificar a todos los administradores
                        io.emit("rooms_update")
                    }
                }
            },
            timeoutMinutes * 60 * 1000,
        ) // Convertir minutos a milisegundos

        // Guardar la referencia al temporizador en la sala
        rooms.get(roomPin).deletionTimer = deletionTimer
    }
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

            // Enviar al cliente la lista de salas que ha creado
            if (machineFingerprint && creatorToRooms.has(machineFingerprint)) {
                socket.emit("creator_rooms", creatorToRooms.get(machineFingerprint))
            } else {
                socket.emit("creator_rooms", [])
            }
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
            creatorFingerprint: machineFingerprint, // Guardar el fingerprint del creador
            deletionTimer: null, // Para el temporizador de eliminación automática
        })

        // Registrar esta sala como creada por este usuario
        if (creatorToRooms.has(machineFingerprint)) {
            creatorToRooms.get(machineFingerprint).push(roomPin)
        } else {
            creatorToRooms.set(machineFingerprint, [roomPin])
        }

        console.log(`Sala creada: ${name} con PIN: ${roomPin} por ${machineFingerprint}`)

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
    socket.on("join_room", async ({ roomPin, nickname }) => {
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
            // Extraer la parte principal del fingerprint (antes del primer guion bajo) para comparación entre navegadores
            const mainFingerprint = machineFingerprint.split("_")[0]

            // Verificar si alguna máquina con el mismo fingerprint base ya está conectada
            let machineAlreadyConnected = false

            // Comprobar en todas las salas si hay alguna máquina con el mismo fingerprint base
            for (const [existingRoomPin, existingRoom] of rooms.entries()) {
                if (existingRoom.oneConnectionPerMachine) {
                    for (const participant of existingRoom.participants.values()) {
                        const participantMainFingerprint = participant.machineFingerprint.split("_")[0]

                        if (participantMainFingerprint === mainFingerprint) {
                            machineAlreadyConnected = true
                            break
                        }
                    }
                }

                if (machineAlreadyConnected) break
            }

            if (machineAlreadyConnected) {
                socket.emit("error", {
                    message: "Esta máquina ya está conectada a una sala. Solo se permite una conexión por máquina física.",
                })
                return
            }
        }

        // Si hay un temporizador de eliminación activo, cancelarlo
        if (room.deletionTimer) {
            clearTimeout(room.deletionTimer)
            room.deletionTimer = null
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
            isCreator: machineFingerprint === room.creatorFingerprint,
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
            isCreator: p.machineFingerprint === room.creatorFingerprint,
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
        // Verificar si el cliente ha enviado su fingerprint
        if (!machineFingerprint) {
            socket.emit("error", { message: "No se ha registrado la huella de la máquina. Recarga la página." })
            return
        }

        const roomsList = Array.from(rooms.entries()).map(([pin, room]) => ({
            id: pin,
            pin,
            name: room.name,
            maxParticipants: room.maxParticipants,
            currentParticipants: room.participants.size,
            encrypted: room.encrypted,
            oneConnectionPerMachine: room.oneConnectionPerMachine,
            createdAt: room.createdAt,
            isCreator: room.creatorFingerprint === machineFingerprint, // Indicar si este usuario es el creador
        }))

        socket.emit("rooms_list", roomsList)
    })

    // Evento para eliminar una sala (para el panel de administrador)
    socket.on("delete_room", (roomPin) => {
        // Verificar si el cliente ha enviado su fingerprint
        if (!machineFingerprint) {
            socket.emit("error", { message: "No se ha registrado la huella de la máquina. Recarga la página." })
            return
        }

        if (rooms.has(roomPin)) {
            const room = rooms.get(roomPin)

            // Verificar si el usuario es el creador de la sala
            if (room.creatorFingerprint !== machineFingerprint) {
                socket.emit("error", { message: "Solo el creador de la sala puede eliminarla." })
                return
            }

            // Notifica a todos los participantes que la sala ha sido eliminada
            io.to(roomPin).emit("room_deleted")

            // Elimina todas las entradas de machineToRoom que apuntan a esta sala
            for (const [fingerprint, pin] of machineToRoom.entries()) {
                if (pin === roomPin) {
                    machineToRoom.delete(fingerprint)
                }
            }

            // Eliminar la sala de la lista de salas del creador
            if (creatorToRooms.has(machineFingerprint)) {
                const creatorRooms = creatorToRooms.get(machineFingerprint)
                const updatedRooms = creatorRooms.filter((pin) => pin !== roomPin)

                if (updatedRooms.length === 0) {
                    creatorToRooms.delete(machineFingerprint)
                } else {
                    creatorToRooms.set(machineFingerprint, updatedRooms)
                }
            }

            // Elimina la sala
            rooms.delete(roomPin)
            console.log(`Sala ${roomPin} eliminada por el creador: ${machineFingerprint}`)

            // Envía la lista actualizada de salas
            socket.emit("room_deleted_success", roomPin)

            // Notificar a todos los administradores
            io.emit("rooms_update")
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
                isCreator: p.machineFingerprint === room.creatorFingerprint,
            }))
            io.to(currentRoom).emit("participants_update", participantsList)

            // Notifica a todos los admins para refrescar la lista de salas
            io.emit("rooms_update")

            // Si la sala queda vacía, programar su eliminación después de 10 minutos
            if (room.participants.size === 0) {
                scheduleRoomDeletion(currentRoom, 10) // 10 minutos
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
