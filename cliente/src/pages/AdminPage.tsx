import { useState, useEffect } from "react"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Badge } from "../components/ui/badge"
import { Separator } from "../components/ui/separator"
import { InfoIcon, PlusIcon, UsersIcon, LockIcon, UnlockIcon, XIcon, ShieldIcon } from "lucide-react"
import { Switch } from "../components/ui/switch"
import { Label } from "../components/ui/label"
import { useNavigate } from "react-router-dom"
import { io } from "socket.io-client"
import fingerprintService from "../services/fingerprint-service"

interface Room {
  id: string
  pin: string
  name: string
  maxParticipants: number
  currentParticipants: number
  encrypted: boolean
  oneConnectionPerMachine: boolean
  createdAt: Date
  isCreator: boolean // campo para indicar si el usuario actual es el creador
}

export default function AdminPanel() {
  const [roomName, setRoomName] = useState("")
  const [maxParticipants, setMaxParticipants] = useState("10")
  //const [encrypted, setEncrypted] = useState(true)
  const [oneConnectionPerMachine, setOneConnectionPerMachine] = useState(true)
  const [notification, setNotification] = useState<{ message: string; type: "info" | "error" | "success" } | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [socket, setSocket] = useState<any>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [creatorRooms, setCreatorRooms] = useState<string[]>([]) // Lista de salas creadas por el usuario
  const navigate = useNavigate()

  // Inicializar el servicio de fingerprinting
  useEffect(() => {
    async function initializeFingerprinting() {
      try {
        setIsInitializing(true)
        // Generar la huella digital al cargar la página
        await fingerprintService.getFingerprint()
        setIsInitializing(false)
      } catch (error) {
        console.error("Error al inicializar fingerprinting:", error)
        setNotification({
          message: "Error al inicializar la identificación del dispositivo",
          type: "error",
        })
        setIsInitializing(false)
      }
    }

    initializeFingerprinting()
  }, [])

  // Conectar al servidor Socket.io
  useEffect(() => {

    // Esperar a que se inicialice el fingerprinting
    if (isInitializing) return

    // URL del servidor Socket.io (usar la variable de entorno en producción)
    //const SOCKET_SERVER_URL = "http://ipmaquina:5000"
    const SOCKET_SERVER_URL = "https://chatsala-websocket.onrender.com"
    const newSocket = io(SOCKET_SERVER_URL)

    // Manejar eventos de conexión
    newSocket.on("connect", async () => {
      console.log("Conectado al servidor")
      try {
        // Obtener la huella digital
        const fingerprint = await fingerprintService.getFingerprint()

        // Registrar la huella digital en el servidor
        newSocket.emit("register_fingerprint", { fingerprint })

        // Solicitar la lista de salas al conectar
        newSocket.emit("get_rooms")
      } catch (error) {
        console.error("Error al obtener la huella digital:", error)
        setNotification({
          message: "Error al identificar el dispositivo",
          type: "error",
        })
      }
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
      const formattedRooms = roomsList.map((room) => ({
        ...room,
        createdAt: new Date(room.createdAt),
      }))
      setRooms(formattedRooms)
    })

    // Recibir la lista de salas creadas por el usuario
    newSocket.on("creator_rooms", (roomPins: string[]) => {
      setCreatorRooms(roomPins)
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

    // Manejar errores
    newSocket.on("error", (error: { message: string }) => {
      setNotification({ message: error.message, type: "error" })
    })    

    // Guardar la referencia del socket
    setSocket(newSocket)

    // Limpiar al desmontar
    return () => {
      newSocket.disconnect()
    }
  }, [isInitializing])


  const createRoom = async () => {
    if (!roomName.trim()) {
      setNotification({ message: "Por favor ingresa un nombre para la sala", type: "error" })
      return
    }

    const maxPart = Number.parseInt(maxParticipants)
    if (isNaN(maxPart) || maxPart < 2) {
      setNotification({ message: "El número de participantes debe ser al menos 2", type: "error" })
      return
    }
    if (maxPart > 100) {
      setNotification({ message: "El número máximo de participantes por sala es 100", type: "error" })
      return
    }    

    if (socket) {
      try {
        // Enviar solicitud para crear sala
        socket.emit("create_room", {
          name: roomName,
          maxParticipants,
          //encrypted,
          oneConnectionPerMachine,
        })
      } catch (error) {
        console.error("Error al crear la sala:", error)
        setNotification({
          message: "Error al crear la sala",
          type: "error",
        })
      }
    }
  }

  const deleteRoom = (roomPin: string) => {
    if (socket) {
      socket.emit("delete_room", roomPin)
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

        {isInitializing ? (
          <Card className="p-6">
            <Alert className="mb-4">
              <InfoIcon className="h-4 w-4 mr-2" />
              <AlertDescription>Inicializando identificación del dispositivo...</AlertDescription>
            </Alert>
          </Card>
        ) :(
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
                        <TableCell className="font-medium">
                          <div className="flex items-center">
                            {room.name}
                            {room.isCreator && (
                              <Badge variant="outline" className="ml-2 bg-green-50">
                                <ShieldIcon className="h-3 w-3 mr-1" />
                                Creador
                              </Badge>
                            )}
                          </div>                          
                        </TableCell>
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
                            {/* Solo mostrar botón de unirse si es el creador o si la sala no tiene restricción */}
                            {room.isCreator && (
                              <>
                                <Button variant="outline" size="sm" onClick={() => joinRoom(room.pin, room.name)}>
                                  Unirse
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => deleteRoom(room.pin)}>
                                  <XIcon className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                            {!room.isCreator && (
                              <span className="text-sm text-muted-foreground">Solo el creador puede administrar</span>
                            )}
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
        )}
      </div>
    </main>
  )
}
