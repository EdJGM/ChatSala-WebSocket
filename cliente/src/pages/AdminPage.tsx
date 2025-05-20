import { useState, useEffect } from "react"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Badge } from "../components/ui/badge"
import { Separator } from "../components/ui/separator"
import { InfoIcon, PlusIcon, UsersIcon, LockIcon, UnlockIcon, XIcon } from "lucide-react"
import { Switch } from "../components/ui/switch"
import { Label } from "../components/ui/label"
import { useNavigate } from "react-router-dom"
import { io } from "socket.io-client"

interface Room {
  id: string
  pin: string
  name: string
  maxParticipants: number
  currentParticipants: number
  encrypted: boolean
  oneConnectionPerMachine: boolean
  createdAt: Date
}

export default function AdminPanel() {
  const [roomName, setRoomName] = useState("")
  const [maxParticipants, setMaxParticipants] = useState("10")
  //const [encrypted, setEncrypted] = useState(true)
  const [oneConnectionPerMachine, setOneConnectionPerMachine] = useState(true)
  const [notification, setNotification] = useState<{ message: string; type: "info" | "error" | "success" } | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [socket, setSocket] = useState<any>(null)
  const navigate = useNavigate()

  // Conectar al servidor Socket.io
  useEffect(() => {
    // URL del servidor Socket.io (usar la variable de entorno en producción)
    //const SOCKET_SERVER_URL = "http://ipmaquina:5000"
    const SOCKET_SERVER_URL = "https://chatsala-websocket.onrender.com"
    const newSocket = io(SOCKET_SERVER_URL)

    // Manejar eventos de conexión
    newSocket.on("connect", () => {
      console.log("Conectado al servidor")
      // Solicitar la lista de salas al conectar
      newSocket.emit("get_rooms")
    })

    // Escuchar cambios en participantes de cualquier sala
    newSocket.on("rooms_update", () => {
      // Solicitar la lista actualizada de salas
      newSocket.emit("get_rooms")
    })    

    // Manejar errores de conexión
    newSocket.on("connect_error", (error: any) => {
      console.error("Error de conexión:", error)
      setNotification({
        message: "Error al conectar con el servidor. Intente nuevamente más tarde.",
        type: "error",
      })
    })

    // Recibir la lista de salas
    newSocket.on("rooms_list", (roomsList: Room[]) => {
      // Convertir las fechas de string a Date
      const formattedRooms = roomsList.map(room => ({
        ...room,
        createdAt: new Date(room.createdAt)
      }))
      setRooms(formattedRooms)
    })

    // Confirmación de sala creada
    newSocket.on("room_created", (room: any) => {
      setNotification({
        message: `Sala "${room.name}" creada con PIN: ${room.pin}`,
        type: "success",
      })

      // Solicitar la lista actualizada de salas
      newSocket.emit("get_rooms")

      // Resetear el formulario
      setRoomName("")
      setMaxParticipants("10")
    })

    // Confirmación de sala eliminada
    newSocket.on("room_deleted_success", (roomPin: string) => {
      setNotification({ message: `Sala con PIN ${roomPin} eliminada`, type: "info" })
      // Solicitar la lista actualizada de salas
      newSocket.emit("get_rooms")
    })

    // Guardar la referencia del socket
    setSocket(newSocket)

    // Limpiar al desmontar
    return () => {
      newSocket.disconnect()
    }
  }, [])


  const createRoom = () => {
    if (!roomName.trim()) {
      setNotification({ message: "Por favor ingresa un nombre para la sala", type: "error" })
      return
    }

    const maxPart = Number.parseInt(maxParticipants)
    if (isNaN(maxPart) || maxPart < 2) {
      setNotification({ message: "El número de participantes debe ser al menos 2", type: "error" })
      return
    }

    if (socket) {
      // Enviar solicitud para crear sala
      socket.emit("create_room", {
        name: roomName,
        maxParticipants,
        //encrypted,
        oneConnectionPerMachine
      })
    }
  }

  const deleteRoom = (roomPin: string) => {
    if (socket) {
      socket.emit("delete_room", roomPin)
      setRooms(rooms.filter((room) => room.id !== roomPin))
      setNotification({ message: "Sala eliminada", type: "info" })
    }  
  }

  const joinRoom = (roomPin: string, roomName: string) => {
    // Redirigir a la página de ingreso con el PIN prellenado
    navigate(`/?pin=${roomPin}&roomName=${encodeURIComponent(roomName)}`)
  }  

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <main className="flex min-h-screen flex-col p-4 bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto w-full">
        <h1 className="text-3xl font-bold mb-6">Panel de Administrador</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Create Room Form */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Crear Nueva Sala</CardTitle>
              <CardDescription>Configura los parámetros para una nueva sala de chat</CardDescription>
            </CardHeader>
            <CardContent>
              {notification && (
                <Alert variant={notification.type === "error" ? "destructive" : "default"} className="mb-4">
                  <InfoIcon className="h-4 w-4 mr-2" />
                  <AlertDescription>{notification.message}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="roomName">Nombre de la Sala</Label>
                  <Input
                    id="roomName"
                    placeholder="Ej: Sala de Desarrollo"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxParticipants">Máximo de Participantes</Label>
                  <Input
                    id="maxParticipants"
                    type="number"
                    min="2"
                    placeholder="10"
                    value={maxParticipants}
                    onChange={(e) => setMaxParticipants(e.target.value)}
                  />
                </div>

                {/* <Separator className="my-4" />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="encrypted">Cifrado del Servidor</Label>
                    <div className="text-sm text-muted-foreground">Cifrar mensajes en el servidor</div>
                  </div>
                  <Switch id="encrypted" checked={encrypted} onCheckedChange={setEncrypted} />
                </div> */}

                <Separator className="my-4" />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="oneConnection">Una Conexión por Máquina</Label>
                    <div className="text-sm text-muted-foreground">Limitar a una conexión por dispositivo</div>
                  </div>
                  <Switch
                    id="oneConnection"
                    checked={oneConnectionPerMachine}
                    onCheckedChange={setOneConnectionPerMachine}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={createRoom}>
                <PlusIcon className="h-4 w-4 mr-2" />
                Crear Sala
              </Button>
            </CardFooter>
          </Card>

          {/* Rooms List */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Salas Activas</CardTitle>
              <CardDescription>Administra las salas de chat existentes</CardDescription>
            </CardHeader>
            <CardContent>
              {rooms.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>PIN</TableHead>
                      <TableHead>Participantes</TableHead>
                      <TableHead>Seguridad</TableHead>
                      <TableHead>Creada</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rooms.map((room) => (
                      <TableRow key={room.id}>
                        <TableCell className="font-medium">{room.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{room.pin}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <UsersIcon className="h-4 w-4 mr-1 text-muted-foreground" />
                            {room.currentParticipants}/{room.maxParticipants}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            {room.encrypted && (
                              <Badge variant="secondary" className="bg-green-50">
                                <LockIcon className="h-3 w-3 mr-1" />
                                Cifrado
                              </Badge>
                            )}
                            {room.oneConnectionPerMachine && (
                              <Badge variant="secondary" className="bg-blue-50">
                                <UnlockIcon className="h-3 w-3 mr-1" />1 por máquina
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatTime(room.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="outline" size="sm" onClick={() => joinRoom(room.pin, room.name)}>
                              Unirse
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteRoom(room.pin)}>
                              <XIcon className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No hay salas activas. Crea una nueva sala para comenzar.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
