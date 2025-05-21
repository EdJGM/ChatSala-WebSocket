import type React from "react"

import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { Button } from "../components/ui/button"
import { Textarea } from "../components/ui/textarea"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { ScrollArea } from "../components/ui/scroll-area"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Avatar, AvatarFallback } from "../components/ui/avatar"
import { Separator } from "../components/ui/separator"
import { SendIcon, InfoIcon, UserIcon, LogOutIcon, ShieldIcon } from "lucide-react"
import { io, type Socket } from "socket.io-client"
import fingerprintService from "../services/fingerprint-service"

// Interfaces
interface Message {
  author: string
  message: string
  timestamp?: number
}

interface HostInfo {
  host: string
  ip: string
  fingerprint?: string
}

interface Participant {
  nickname: string
  id: string
  isCreator?: boolean // campo para indicar si es el creador
}

export default function ChatRoom() {
  const { pin: roomPin } = useParams<{ pin: string }>()
  const [searchParams] = useSearchParams()
  const nickname = searchParams.get("nickname") || ""

  // States
  const [connected, setConnected] = useState(false)
  const [hostInfo, setHostInfo] = useState<HostInfo>({ host: "", ip: "" })
  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [notification, setNotification] = useState<{ message: string; type: "info" | "error" | "success" } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Refs
  const socketRef = useRef<Socket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Conectar al socket
  useEffect(() => {
    if (!nickname || !roomPin) {
      window.location.href = "/"
      return
    }

    // mismo puerto que el backend
    //const SOCKET_SERVER_URL = "http://ipbackend:5000"
    let isMounted = true
    const SOCKET_SERVER_URL = "https://chatsala-websocket.onrender.com" 

    // Función asíncrona para inicializar la conexión
    async function initializeConnection() {
      try {
        setIsLoading(true)
        setNotification({ message: "Generando huella digital...", type: "info" })

        // Obtener la huella digital de la máquina
        const fingerprint = await fingerprintService.getFingerprint()
        console.log("Huella digital generada:", fingerprint)

        if (!isMounted) return

        setNotification({ message: "Conectando al servidor...", type: "info" })

        // Conectar a Socket.IO
        socketRef.current = io(SOCKET_SERVER_URL)

        // Cuando se establece la conexión, enviar la huella digital
        socketRef.current.on("connect", () => {
          if (!isMounted) return
          console.log("Conectado al servidor")
          setConnected(true)
          setNotification({ message: "Registrando dispositivo...", type: "info" })

          // Registrar la huella digital en el servidor
          socketRef.current?.emit("register_fingerprint", { fingerprint })
        })

        // Connection events
        socketRef.current.on("connect_error", () => {
          if (!isMounted) return
          setNotification({ message: "Error al conectar al servidor", type: "error" })
          setIsLoading(false)
        })

        // Host info
        socketRef.current.on("host_info", (info: HostInfo) => {
          if (!isMounted) return
          setHostInfo(info)
          setNotification({ message: "Conectado a la sala", type: "success" })
          setIsLoading(false)

          // Unirse a la sala después de recibir la confirmación de host_info
          socketRef.current?.emit("join_room", { roomPin, nickname })
        })

        // Room events
        socketRef.current.on("room_not_found", () => {
          if (!isMounted) return
          setNotification({ message: "La sala no existe", type: "error" })
          setTimeout(() => (window.location.href = "/"), 3000)
        })

        socketRef.current.on("room_full", () => {
          if (!isMounted) return
          setNotification({ message: "La sala está llena", type: "error" })
          setTimeout(() => (window.location.href = "/"), 3000)
        })

        // Message events
        socketRef.current.on("receive_message", (msg: Message) => {
          if (!isMounted) return
          setMessages((prevMessages) => [
            ...prevMessages,
            {
              ...msg,
              timestamp: Date.now(),
            },
          ])
        })

        // Participant events
        socketRef.current.on("participants_update", (roomParticipants: Participant[]) => {
          if (!isMounted) return
          setParticipants(roomParticipants)
        })

        socketRef.current.on("user_joined", (user: { nickname: string }) => {
          if (!isMounted) return
          setNotification({ message: `${user.nickname} se ha unido a la sala`, type: "info" })
        })

        socketRef.current.on("user_left", (user: { nickname: string }) => {
          if (!isMounted) return
          setNotification({ message: `${user.nickname} ha abandonado la sala`, type: "info" })
        })

        socketRef.current.on("room_left", () => {
          if (!isMounted) return
          socketRef.current?.disconnect()
          window.location.href = "/"
        })

        socketRef.current.on("error", (err: { message: string }) => {
          if (!isMounted) return
          setNotification({ message: err.message, type: "error" })
          setTimeout(() => (window.location.href = "/"), 3000)
        })

        socketRef.current.on("room_deleted", () => {
          if (!isMounted) return
          setNotification({ message: "La sala ha sido eliminada por el administrador.", type: "error" })
          setTimeout(() => {
            socketRef.current?.disconnect()
            window.location.href = "/"
          }, 2000) // Da tiempo a mostrar la notificación
        })
      } catch (error) {
        if (!isMounted) return
        console.error("Error al inicializar la conexión:", error)
        setNotification({ message: "Error al inicializar la conexión", type: "error" })
        setIsLoading(false)
      }
    }

    initializeConnection()

    // Cleanup on unmount
    return () => {
      isMounted = false
      if (socketRef.current) {
        // Notifica al servidor antes de desconectar
        socketRef.current.emit("leave_room")
        socketRef.current.disconnect()
      }
    }
  }, [nickname, roomPin])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Send message function
  const sendMessage = () => {
    if (!message.trim() || !connected || !socketRef.current) return

    const newMessage = {
      author: nickname,
      message: message.trim(),
      timestamp: Date.now(),
    }

    socketRef.current.emit("send_message", newMessage)
    //setMessages((prev) => [...prev, newMessage])
    setMessage("")
  }

  // Handle key press (Enter to send)
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Leave room function
  const leaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.emit("leave_room")
      //socketRef.current.disconnect()
    }
    //window.location.href = "/"
  }

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name.substring(0, 2).toUpperCase()
  }

  // Format timestamp
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return ""
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <main className="flex min-h-screen flex-col md:flex-row bg-gradient-to-b from-slate-50 to-slate-100 p-4 relative">
      {/* Overlay con blur si hay notificación de error */}
      {(notification?.type === "error" || isLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          style={{ pointerEvents: "auto" }}
        >
          <div className="max-w-md w-full">
            <Alert variant={notification?.type === "error" ? "destructive" : "default"} className="mb-4 text-center">
              <InfoIcon className="h-6 w-6 mr-2 inline-block" />
              <AlertDescription className="text-lg">
                {isLoading ? "Conectando a la sala..." : notification?.message}
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}      
      {/* Chat Area */}
      <div className={`flex-grow md:mr-4 mb-4 md:mb-0 ${notification?.type === "error" || isLoading ? "pointer-events-none blur-sm" : ""}`}>
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-xl">
                Sala: {roomPin}
                {connected && (
                  <Badge variant="outline" className="ml-2 bg-green-50">
                    Conectado
                  </Badge>
                )}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={leaveRoom}>
                <LogOutIcon className="h-4 w-4 mr-2" />
                Salir
              </Button>
            </div>
            {notification && notification.type !== "error" && (
              <Alert variant="default" className="mt-2">
                <InfoIcon className="h-4 w-4 mr-2" />
                <AlertDescription>{notification.message}</AlertDescription>
              </Alert>
            )}
            {hostInfo.host && (
              <div className="text-xs text-muted-foreground mt-1">
                Conectado desde: {hostInfo.host} ({hostInfo.ip})
                {hostInfo.fingerprint && (
                  <span className="block mt-1">ID de máquina: {hostInfo.fingerprint.substring(0, 8)}...</span>
                )}
              </div>
            )}
          </CardHeader>

          <CardContent className="flex-grow overflow-hidden">
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-4 p-1">
                {messages.map((msg, index) => (
                  <div key={index} className={`flex ${msg.author === nickname ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.author === nickname ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}
                    >
                      {msg.author !== nickname && <div className="font-semibold text-sm mb-1">{msg.author}</div>}
                      <div className="break-words">{msg.message}</div>
                      <div
                        className={`text-xs mt-1 ${
                          msg.author === nickname ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {formatTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          </CardContent>

          <CardFooter className="pt-3">
            <div className="flex w-full space-x-2">
              <Textarea
                placeholder="Escribe tu mensaje..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                className="flex-grow resize-none"
                rows={2}
                disabled={!connected || isLoading}
              />
              <Button onClick={sendMessage} disabled={!connected || isLoading} className="self-end">
                <SendIcon className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Participants Sidebar */}
      <div className={`w-full md:w-64 ${notification?.type === "error" || isLoading ? "pointer-events-none blur-sm" : ""}`}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <UserIcon className="h-4 w-4 mr-2" />
              Participantes ({participants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-2">
                {participants.map((participant, index) => (
                  <div key={index}>
                    <div className="flex items-center p-2 rounded-md hover:bg-muted">
                      <Avatar className="h-8 w-8 mr-2">
                        <AvatarFallback
                          className={participant.nickname === nickname ? "bg-primary text-primary-foreground" : ""}
                        >
                          {getInitials(participant.nickname)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <span className={participant.nickname === nickname ? "font-semibold" : ""}>
                          {participant.nickname}
                          {participant.nickname === nickname && " (tú)"}
                        </span>
                        {participant.isCreator && (
                          <Badge variant="outline" className="ml-2 bg-green-50 text-xs">
                            <ShieldIcon className="h-3 w-3 mr-1" />
                            Creador
                          </Badge>
                        )}
                      </div> 
                    </div>
                    {index < participants.length - 1 && <Separator />}
                  </div>
                ))}
                {participants.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">No hay participantes</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
