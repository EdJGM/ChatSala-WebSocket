import { useState, useEffect } from "react"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import { Alert, AlertDescription } from "../components/ui/alert"
import { InfoIcon } from "lucide-react"
import { useNavigate, useLocation } from "react-router-dom"
import fingerprintService from "../services/fingerprint-service"

export default function Home() {
  const [nickname, setNickname] = useState("")
  const [roomPin, setRoomPin] = useState("")
  const [roomName, setRoomName] = useState("")
  const [notification, setNotification] = useState<{ message: string; type: "info" | "error" | "success" } | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

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

  // Verificar si hay parámetros en la URL (por ejemplo, desde el panel de administrador)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const pinParam = params.get("pin")
    const roomNameParam = params.get("roomName")

    if (pinParam) {
      setRoomPin(pinParam)
    }

    if (roomNameParam) {
      setRoomName(roomNameParam)
      setNotification({
        message: `Listo para unirte a la sala "${roomNameParam}"`,
        type: "info"
      })
    }
  }, [location])

  const handleJoinRoom = () => {
    if (!nickname.trim()) {
      setNotification({ message: "Por favor ingresa un nickname", type: "error" })
      return
    }

    if (!roomPin.trim() || roomPin.length !== 6 || !/^\d+$/.test(roomPin)) {
      setNotification({ message: "El PIN debe ser de 6 dígitos numéricos", type: "error" })
      return
    }

    // Redirigir a la sala de chat
    navigate(`/room/${roomPin}?nickname=${encodeURIComponent(nickname)}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="w-full max-w-md">
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Chat en Tiempo Real</CardTitle>
            <CardDescription>Conéctate a una sala de chat existente o crea una nueva</CardDescription>
          </CardHeader>
          <CardContent>
            {isInitializing ? (
              <Alert className="mb-4">
                <InfoIcon className="h-4 w-4 mr-2" />
                <AlertDescription>Inicializando identificación del dispositivo...</AlertDescription>
              </Alert>
            ) : (
              <Tabs defaultValue="join" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="join">Unirse a Sala</TabsTrigger>
                  <TabsTrigger value="admin">Administrador</TabsTrigger>
                </TabsList>

                <TabsContent value="join">
                  <div className="space-y-4">
                    {notification && (
                      <Alert variant={notification.type === "error" ? "destructive" : "default"} className="mb-4">
                        <InfoIcon className="h-4 w-4 mr-2" />
                        <AlertDescription>{notification.message}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <label htmlFor="nickname" className="text-sm font-medium">
                        Nickname
                      </label>
                      <Input
                        id="nickname"
                        placeholder="Ingresa tu nickname"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="pin" className="text-sm font-medium">
                        PIN de la Sala {roomName && `(${roomName})`}
                      </label>
                      <Input
                        id="pin"
                        placeholder="Ingresa el PIN de 6 dígitos"
                        value={roomPin}
                        onChange={(e) => setRoomPin(e.target.value)}
                        maxLength={6}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="admin">
                  <div className="flex items-center justify-center h-32">
                    <Button onClick={() => (window.location.href = "/admin")}>Ir al Panel de Administrador</Button>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={handleJoinRoom}>
              Ingresar a la Sala
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
