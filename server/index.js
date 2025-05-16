// Carga las variables de entorno desde el archivo .env
require('dotenv').config();

// Importa Express para crear el servidor HTTP
const express = require('express');

// Importa el módulo HTTP de Node.js para envolver Express
const http = require('http');

// Importa CORS para permitir peticiones desde el cliente React
const cors = require('cors');

// Importa la clase Server de socket.io para habilitar WebSockets
const { Server } = require('socket.io');

// Importa DNS para resolver nombres de host a partir de IPs
const dns = require('dns');

// Crea la aplicación de Express
const app = express();

// Configura CORS usando el origen que definimos en .env
//app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(cors({ origin: true, credentials: true }));

// Crea el servidor HTTP a partir de la app de Express
const server = http.createServer(app);

// Inicializa Socket.IO sobre el servidor HTTP y aplica la misma política CORS
const io = new Server(server, {
    cors: {
        origin: true,
        //origin: process.env.CORS_ORIGIN,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Estructura para almacenar información de las salas
const rooms = new Map();
// Estructura para almacenar mapeo entre IPs y salas
const ipToRoom = new Map();

// Función para generar un PIN único de 6 dígitos
function generateUniquePin() {
    let pin;
    do {
        // Genera un número de 6 dígitos (entre 100000 y 999999)
        pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms.has(pin)); // Asegura que el PIN no exista ya
    return pin;
}

// Maneja las nuevas conexiones de clientes Socket.IO
io.on('connection', (socket) => {
    // Extrae la dirección IP del cliente (elimina el prefijo IPv6 si existe)
    const clientIp = socket.handshake.address.replace('::ffff:', '');
    console.log(`Cliente conectado: ${clientIp}`);

    // Datos del cliente
    let currentRoom = null;
    let userNickname = null;

    // Intenta resolver el nombre de host inverso para la IP del cliente
    dns.reverse(clientIp, (err, hostnames) => {
       
        // Si hay un hostname válido, lo usamos; si no, dejamos la IP
        const clientHost = (!err && hostnames.length) ? hostnames[0] : clientIp;
        console.log(`Cliente Hostname: ${clientHost}`);
        
        // Envía al cliente su propia info de host e IP
        socket.emit('host_info', { ip: clientIp, host: clientHost });
    });

    // Evento para crear una nueva sala
    socket.on('create_room', ({ name, maxParticipants, encrypted, oneConnectionPerMachine }) => {
        // Verifica si el cliente ya está en una sala
        if (ipToRoom.has(clientIp) && oneConnectionPerMachine) {
            socket.emit('error', { message: 'Ya estás conectado a una sala. Debes salir primero.' });
            return;
        }

        const roomPin = generateUniquePin();

        // Crea la estructura de la sala
        rooms.set(roomPin, {
            name,
            maxParticipants: parseInt(maxParticipants, 10),
            encrypted: encrypted,
            oneConnectionPerMachine: oneConnectionPerMachine,
            participants: new Map(),
            createdAt: new Date()
        });

        console.log(`Sala creada: ${name} con PIN: ${roomPin}`);

        // Responde con el PIN generado
        socket.emit('room_created', {
            pin: roomPin,
            name,
            maxParticipants,
            encrypted,
            oneConnectionPerMachine
        });
    });    

    // Evento para unirse a una sala
    socket.on('join_room', ({ roomPin, nickname }) => {
        // Verifica si la sala existe
        if (!rooms.has(roomPin)) {
            socket.emit('room_not_found');
            return;
        }

        const room = rooms.get(roomPin);

        // Verifica si la sala está llena
        if (room.participants.size >= room.maxParticipants) {
            socket.emit('room_full');
            return;
        }

        // Verifica si el cliente ya está en otra sala y si la sala tiene la restricción de una conexión por máquina
        if (room.oneConnectionPerMachine) {
            // Si la IP ya está en cualquier sala, bloquea
            if (ipToRoom.has(clientIp)) {
                socket.emit('error', { message: 'Solo se permite una conexión por máquina.' });
                return;
            }
            // Si la IP ya está en la sala actual, bloquea (esto cubre el caso de varias pestañas en la misma sala)
            for (const participant of room.participants.values()) {
                if (participant.ip === clientIp) {
                    socket.emit('error', { message: 'Solo se permite una conexión por máquina en esta sala.' });
                    return;
                }
            }
        }        

        // // Verifica si el cliente ya está en otra sala y si la sala tiene la restricción de una conexión por máquina
        // if (ipToRoom.has(clientIp) && ipToRoom.get(clientIp) !== roomPin && room.oneConnectionPerMachine) {
        //     socket.emit('error', { message: 'Ya estás conectado a otra sala. Debes salir primero.' });
        //     return;
        // }

        // Guarda información del usuario
        userNickname = nickname;
        currentRoom = roomPin;

        // Añade el usuario a la sala
        room.participants.set(socket.id, { nickname, id: socket.id, ip: clientIp });

        // Si la sala tiene restricción de una conexión por máquina, registra la IP
        if (room.oneConnectionPerMachine) {
            ipToRoom.set(clientIp, roomPin);
        }

        // Une el socket a la sala
        socket.join(roomPin);

        // Notifica a todos en la sala que el usuario se ha unido
        io.to(roomPin).emit('user_joined', { nickname });

        // Envía la lista actualizada de participantes
        const participantsList = Array.from(room.participants.values());
        io.to(roomPin).emit('participants_update', participantsList);
        
        //Notifica a todos los admins para refrescar la lista de salas
        io.emit('rooms_update');

        console.log(`${nickname} se unió a la sala ${roomPin}`);
    });    
    
    //Evento para enviar un mensaje
    socket.on('send_message', (msg) => {
        // Verifica si el cliente está en una sala
        if (!currentRoom) return;
        
        // Reenvía ese mensaje a todos los clientes conectados
        io.to(currentRoom).emit('receive_message', msg);
        console.log(`Mensaje en sala ${currentRoom} de ${msg.author}: ${msg.message}`);
    });

    // Evento para obtener la lista de salas (para el panel de administrador)
    socket.on('get_rooms', () => {
        const roomsList = Array.from(rooms.entries()).map(([pin, room]) => ({
            id: pin,
            pin,
            name: room.name,
            maxParticipants: room.maxParticipants,
            currentParticipants: room.participants.size,
            encrypted: room.encrypted,
            oneConnectionPerMachine: room.oneConnectionPerMachine,
            createdAt: room.createdAt
        }));

        socket.emit('rooms_list', roomsList);
    });
    
    // Evento para eliminar una sala (para el panel de administrador)
    socket.on('delete_room', (roomPin) => {
        if (rooms.has(roomPin)) {
            // Notifica a todos los participantes que la sala ha sido eliminada
            io.to(roomPin).emit('room_deleted');

            // Elimina todas las entradas de ipToRoom que apuntan a esta sala
            for (const [ip, pin] of ipToRoom.entries()) {
                if (pin === roomPin) {
                    ipToRoom.delete(ip);
                }
            }

            // Elimina la sala
            rooms.delete(roomPin);
            console.log(`Sala ${roomPin} eliminada`);

            // Envía la lista actualizada de salas
            socket.emit('room_deleted_success', roomPin);
        }
    });
    
    // Evento para salir de una sala
    socket.on('leave_room', () => {
        handleDisconnect();
    });
    
    // Función para manejar la desconexión del usuario
    const handleDisconnect = () => {
        if (currentRoom && rooms.has(currentRoom)) {
            const room = rooms.get(currentRoom);

            // Elimina al usuario de la sala
            room.participants.delete(socket.id);

            // Si la sala tiene restricción de una conexión por máquina, libera la IP
            if (room.oneConnectionPerMachine) {
                ipToRoom.delete(clientIp);
            }

            // Notifica a todos en la sala que el usuario ha salido
            if (userNickname) {
                io.to(currentRoom).emit('user_left', { nickname: userNickname });
            }

            // Actualiza la lista de participantes
            const participantsList = Array.from(room.participants.values());
            io.to(currentRoom).emit('participants_update', participantsList);
            // Notifica a todos los admins para refrescar la lista de salas
            io.emit('rooms_update');

            // Si la sala queda vacía, la elimina después de un tiempo
            if (room.participants.size === 0) {
                setTimeout(() => {
                    if (rooms.has(currentRoom) && rooms.get(currentRoom).participants.size === 0) {
                        rooms.delete(currentRoom);
                        console.log(`Sala ${currentRoom} eliminada por inactividad`);
                    }
                }, 1000 * 60 * 30); // 30 minutos
            }

            socket.emit('room_left');
            console.log(`${userNickname || 'Usuario'} salió de la sala ${currentRoom}`);

            // Limpia las variables
            currentRoom = null;
            userNickname = null;

        }
    };  
    
    // Detecta cuando un cliente se desconecta
    socket.on('disconnect', () => {
        handleDisconnect();
        console.log(`Cliente desconectado: ${clientIp}`);
    });    
});

// Lee el puerto desde .env (o usa 3001 por defecto)
const PORT = process.env.PORT || 5000;
// Inicia el servidor escuchando en el puerto configurado
server.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});