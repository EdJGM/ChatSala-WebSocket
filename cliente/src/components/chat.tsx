import React, { useEffect, useRef, useState } from "react"
import { io } from "socket.io-client";
import { Card } from "primereact/card";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { InputTextarea } from "primereact/inputtextarea";

// URL de conexión al servidor Socket.IO, definida en .env
const SOCKET_SERVER_URL = process.env.REACT_APP_SOCKET_SERVER_URL

// Interfaz para los mensajes de chat
interface Message {
    author: string,
    message: string
}

// Interfaz para la información de host/IP enviada por el servidor
interface HostInfo {
    host: string,
    ip: string,
}

export const Chat: React.FC = () => {
  
    // Estado temporal para el nickname mientras el usuario lo escribe
    const [tempNickname, setTempNickname] = useState<string>("");
    
    // Estado que almacena el nickname definitivo del usuario
    const [nickname, setNickname] = useState<string>("");

    // Indica si el socket ya se conectó y llegó la info de host
    const [connected, setConnected] = useState<boolean>(false);

    // Estado para guardar la información de host/IP recibida
    const [hostInfo, setHostInfo] = useState<HostInfo>({ host: "", ip: ""});

    // Estado del mensaje que el usuario va a enviar
    const [message, setMessage] = useState<string>("");

    // Historial de mensajes intercambiados
    const [messages, setMessages] = useState<Message[]>([]);

    // Referencia al socket, para poder usarlo en distintos callbacks
    const socketRef = useRef<any>(null);

    // Efecto que inicializa la conexión al servidor **solo** cuando el usuario elige un nickname
    useEffect(() => {
        
        // Si no hay nickname, no conectamos el socket
        if (!nickname)  return;

        //crear la conexion al socket
        socketRef.current = io(SOCKET_SERVER_URL);

        // Escuchar el evento 'host_info' enviado por el servidor al conectar
        socketRef.current.on("host_info", (info: HostInfo) => {
            setHostInfo(info); // Guardar host/IP en estado
            setConnected(true); // Marcar como conectado
        });

        // Escuchar nuevos mensajes emitidos por el servidor
        socketRef.current.on("receive_message", (msg: Message) => {;
            setMessages((prevMessages) => [...prevMessages, msg]); // Añadir al historial
        });

        // Limpieza al desmontar el componente o cambiar de nickname
        return () => {
            socketRef.current.disconnect();
            setConnected(false);
        }
    }, [nickname]);

    // Función que fija el nickname definitivo al pulsar el botón o Enter
    const handleNickname = () => {
        const nick = tempNickname.trim();
        if (!nick) return; // No aceptamos nickname vacío
        setNickname(nick); // Guardamos el nickname en estado
    }

    // Función para enviar un mensaje al servidor
    const sendMessage = () => {

        // No enviamos si no hay texto o no estamos conectados
        if (!message.trim() || !connected) return;

        // Creamos el objeto mensaje con el autor = nickname
        const msg = {author: nickname, message: message};

        // Emitimos al servidor
        socketRef.current.emit("send_message", msg);

        // También añadimos el mensaje al historial local
        setMessages(prev => [...prev, msg]);

        // Limpiamos el input de texto
        setMessage("");
    }

    // Si aún no se ha fijado nickname, mostramos el formulario de bienvenida
    if (!nickname){
        return (
            <div className="app">
                <Card title="Bienvenido al chat">
                    <div className="p-fluid">
                        <div className="p-field">
                            <label htmlFor="txtNick">Ingrese su nick</label>
                            <InputText
                                id="txtNick"
                                placeholder="Ejm: Jperez123"
                                value={tempNickname}
                                onChange={e => setTempNickname(e.target.value)} // Actualiza tempNick
                            />
                        </div>
                        <Button 
                            label="Ingresar al Chat" 
                            icon="pi pi-check" 
                            onClick={handleNickname}  // Al hacer clic fijamos el nickname
                        />
                    </div>
                </Card>
            </div>
        )
    }

    // Una vez tenemos nickname, renderizamos la interfaz de chat
    return (
        <div className="app">
            <Card title={`Chat de ${nickname}` }>
                {/* Mostrar información de host e IP */}
                <div className="host-info">
                    Conectado desde: <strong>{hostInfo.host}</strong>({hostInfo.ip})
                </div>

                {/* Contenedor de mensajes */}
                <div className="messages-container">
                    {
                        messages.map((msg, index) => (
                            <p 
                                key={index}
                                className={`message ${msg.author === nickname ? "yo" : "otro"}`}
                            >
                                <strong>{msg.author}</strong>{msg.message}
                            </p>
                        ))
                    }
                </div>

                {/* Área de entrada y botón */}
                <div className="input-chat">
                    <InputTextarea
                        rows={2}
                        cols={30}
                        placeholder="Escribe tu mensaje"
                        value={message}
                        onChange={e => setMessage(e.target.value)} // Actualiza el mensaje
                    />
                    <Button 
                        label="Enviar" 
                        icon="pi pi-send" 
                        onClick={sendMessage}   // Al hacer clic enviamos el mensaje
                    />
                </div>
            </Card>
        </div>
    )
} 