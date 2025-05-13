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
app.use(cors({ origin: process.env.CORS_ORIGIN }));

// Crea el servidor HTTP a partir de la app de Express
const server = http.createServer(app);

// Inicializa Socket.IO sobre el servidor HTTP y aplica la misma política CORS
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN,
        methods: ["GET", "POST"]
    }
});

// Maneja las nuevas conexiones de clientes Socket.IO
io.on('connection', (socket) => {
    // Extrae la dirección IP del cliente (elimina el prefijo IPv6 si existe)
    const clientIp = socket.handshake.address.replace('::ffff:', '');
    console.log(`Cliente conectado: ${clientIp}`);

    // Intenta resolver el nombre de host inverso para la IP del cliente
    dns.reverse(clientIp, (err, hostnames) => {
       
        // Si hay un hostname válido, lo usamos; si no, dejamos la IP
        const clientHost = (!err && hostnames.length) ? hostnames[0] : clientIp;
        console.log(`Cliente Hostname: ${clientHost}`);
        
        // Envía al cliente su propia info de host e IP
        socket.emit('host_info', { ip: clientIp, host: clientHost });
    });

    // Escucha mensajes entrantes del cliente bajo el evento 'send_message'
    socket.on('send_message', (msg) => {
        
        // Reenvía ese mensaje a todos los clientes conectados
        io.emit('receive_message', msg);
        console.log(`Mensaje enviado desde ${clientIp}: ${msg.message}`);
    });

    // Detecta cuando un cliente se desconecta
    socket.on('disconnect', () => {
        console.log(`Cliente desconectado: ${clientIp}`);
    });
});

// Lee el puerto desde .env (o usa 3001 por defecto)
const PORT = process.env.PORT || 5000;
// Inicia el servidor escuchando en el puerto configurado
server.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});