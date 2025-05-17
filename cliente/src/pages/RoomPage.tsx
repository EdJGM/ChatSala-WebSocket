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
import { SendIcon, InfoIcon, UserIcon, LogOutIcon } from "lucide-react"
import { io, type Socket } from "socket.io-client"

// Interfaces
interface Message {
  author: string
  message: string
  timestamp?: number
}

interface HostInfo {
  host: string
  ip: string
}

interface Participant {
  nickname: string
  id: string
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
    const SOCKET_SERVER_URL = "http://192.168.1.4:5000" 

    try {
      socketRef.current = io(SOCKET_SERVER_URL, {
        query: {
          nickname,
          roomPin,
        },
      })

      // Connection events
      socketRef.current.on("connect", () => {
        setConnected(true)
        setNotification({ message: "Conectado a la sala", type: "success" })
        // Unirse a la sala después de conectar
        socketRef.current?.emit("join_room", { roomPin, nickname })
      })

      socketRef.current.on("connect_error", () => {
        setNotification({ message: "Error al conectar al servidor", type: "error" })
      })

      // Host info
      socketRef.current.on("host_info", (info: HostInfo) => {
        setHostInfo(info)
      })

      // Room events
      socketRef.current.on("room_not_found", () => {
        setNotification({ message: "La sala no existe", type: "error" })
        setTimeout(() => (window.location.href = "/"), 3000)
      })

      socketRef.current.on("room_full", () => {
        setNotification({ message: "La sala está llena", type: "error" })
        setTimeout(() => (window.location.href = "/"), 3000)
      })

      // Message events
      socketRef.current.on("receive_message", (msg: Message) => {
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
        setParticipants(roomParticipants)
      })

      socketRef.current.on("user_joined", (user: { nickname: string }) => {
        setNotification({ message: `${user.nickname} se ha unido a la sala`, type: "info" })
      })

      socketRef.current.on("user_left", (user: { nickname: string }) => {
        setNotification({ message: `${user.nickname} ha abandonado la sala`, type: "info" })
      })

      socketRef.current.on("room_left",() => {
        socketRef.current?.disconnect()
        window.location.href = "/"
      });

      socketRef.current.on("error", (err: { message: string }) => {
        setNotification({ message: err.message, type: "error" });
        setTimeout(() => (window.location.href = "/"), 3000);
      });

      socketRef.current.on("room_deleted", () => {
        setNotification({ message: "La sala ha sido eliminada por el administrador.", type: "error" });
        setTimeout(() => {
          socketRef.current?.disconnect();
          window.location.href = "/";
        }, 2000); // Da tiempo a mostrar la notificación
      });

      // Cleanup on unmount
      return () => {
        if (socketRef.current) {
          // Notifica al servidor antes de desconectar
          socketRef.current.emit("leave_room")
          socketRef.current.disconnect()
        }
      }
    } catch (error) {
      console.error("Socket connection error:", error)
      setNotification({ message: "Error al conectar al servidor", type: "error" })
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
      {notification?.type === "error" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          style={{ pointerEvents: "auto" }}
        >
          <div className="max-w-md w-full">
            <Alert variant="destructive" className="mb-4 text-center">
              <InfoIcon className="h-6 w-6 mr-2 inline-block" />
              <AlertDescription className="text-lg">{notification.message}</AlertDescription>
            </Alert>
          </div>
        </div>
      )}      
      {/* Chat Area */}
      <div className={`flex-grow md:mr-4 mb-4 md:mb-0 ${notification?.type === "error" ? "pointer-events-none blur-sm" : ""}`}>
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
            {notification && (
              <Alert variant={notification.type === "error" ? "destructive" : "default"} className="mt-2">
                <InfoIcon className="h-4 w-4 mr-2" />
                <AlertDescription>{notification.message}</AlertDescription>
              </Alert>
            )}
            {hostInfo.host && (
              <div className="text-xs text-muted-foreground mt-1">
                Conectado desde: {hostInfo.host} ({hostInfo.ip})
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
                disabled={!connected}
              />
              <Button onClick={sendMessage} disabled={!connected} className="self-end">
                <SendIcon className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Participants Sidebar */}
      <div className={`w-full md:w-64 ${notification?.type === "error" ? "pointer-events-none blur-sm" : ""}`}>
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
                      <span className={participant.nickname === nickname ? "font-semibold" : ""}>
                        {participant.nickname}
                        {participant.nickname === nickname && " (tú)"}
                      </span>
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
