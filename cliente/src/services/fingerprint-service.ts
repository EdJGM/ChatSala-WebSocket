// Importar el servicio de almacenamiento entre navegadores
import CrossBrowserStorage from "./cross-browser-storage"
import FingerprintJS from "@fingerprintjs/fingerprintjs"

// Clase para manejar la generación y almacenamiento de la huella digital
class FingerprintService {
    private static instance: FingerprintService
    private fingerprint: string | null = null
    private fingerprintPromise: Promise<string> | null = null

    private constructor() {
        // Escuchar cambios en la huella compartida entre navegadores
        CrossBrowserStorage.onFingerprintChange((fingerprint) => {
            this.fingerprint = fingerprint
        })
    }

    // Patrón Singleton para asegurar una sola instancia
    public static getInstance(): FingerprintService {
        if (!FingerprintService.instance) {
            FingerprintService.instance = new FingerprintService()
        }
        return FingerprintService.instance
    }

    // Obtener la huella digital (genera una nueva si no existe)
    public async getFingerprint(): Promise<string> {
        // Verificar si ya tenemos una huella compartida entre navegadores
        const sharedFingerprint = CrossBrowserStorage.getFingerprint()
        if (sharedFingerprint) {
            this.fingerprint = sharedFingerprint
            return sharedFingerprint
        }

        // Si ya tenemos la huella, la devolvemos inmediatamente
        if (this.fingerprint) {
            return this.fingerprint
        }

        // Si ya estamos generando la huella, devolvemos la promesa existente
        if (this.fingerprintPromise) {
            return this.fingerprintPromise
        }

        // Generamos una nueva huella
        this.fingerprintPromise = this.generateFingerprint()
        this.fingerprint = await this.fingerprintPromise
        this.fingerprintPromise = null

        // Compartir la huella entre navegadores
        CrossBrowserStorage.setFingerprint(this.fingerprint)

        return this.fingerprint
    }

    // Método privado para generar la huella digital
    private async generateFingerprint(): Promise<string> {
        try {
            // Intentar obtener la huella del localStorage primero
            const cachedFingerprint = localStorage.getItem("machine_fingerprint")
            if (cachedFingerprint) {
                console.log("Usando huella digital almacenada")
                return cachedFingerprint
            }

            // Cargar la instancia de FingerprintJS
            const fp = await FingerprintJS.load({
                monitoring: false, // Desactivar monitoreo para evitar diferencias
            })

            // Obtener la información del visitante con opciones para maximizar consistencia
            const result = await fp.get({
                // Usar solo componentes que sean estables entre navegadores
                components: {
                    screenResolution: true,
                    colorDepth: true,
                    timezone: true,
                    platform: true,
                    webglRenderer: true,
                    hardwareConcurrency: true,
                    deviceMemory: true,
                    // Evitar componentes que varían entre navegadores
                    userAgent: false,
                    language: false,
                    fonts: false,
                    plugins: false,
                    localStorage: false,
                    sessionStorage: false,
                    cookies: false,
                    canvas: false,
                    audio: false,
                },
            })

            // Obtener información adicional del dispositivo
            const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
            const platform = navigator.platform

            // Intentar obtener información de hardware más específica
            const hardwareInfo = await this.getHardwareSpecificInfo()

            // Combinar información que sea más estable entre navegadores
            const combinedFingerprint = `${result.visitorId}_${screenInfo}_${timeZone}_${platform}_${hardwareInfo}`

            // Guardar en localStorage para futuras sesiones
            localStorage.setItem("machine_fingerprint", combinedFingerprint)

            console.log("Nueva huella digital generada")
            return combinedFingerprint
        } catch (error) {
            console.error("Error al generar la huella digital:", error)

            // Método de respaldo si falla FingerprintJS
            const fallbackFingerprint = this.generateFallbackFingerprint()
            localStorage.setItem("machine_fingerprint", fallbackFingerprint)

            return fallbackFingerprint
        }
    }

    // Método para obtener información específica del hardware
    private async getHardwareSpecificInfo(): Promise<string> {
        let hardwareInfo = ""

        try {
            // Información de CPU
            const cpuCores = navigator.hardwareConcurrency || "unknown"
            hardwareInfo += `_cores${cpuCores}`

            // Información de memoria
            const deviceMemory = (navigator as any).deviceMemory || "unknown"
            hardwareInfo += `_mem${deviceMemory}`

            // Información de GPU mediante WebGL
            const canvas = document.createElement("canvas")
            const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl")

            if (gl) {
                const debugInfo = gl.getExtension("WEBGL_debug_renderer_info")
                if (debugInfo) {
                    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
                    // Solo usamos el renderer (GPU) ya que es más específico de la máquina
                    hardwareInfo += `_gpu${renderer.replace(/\s+/g, "")}`
                }
            }

            return hardwareInfo
        } catch (error) {
            console.error("Error al obtener información de hardware:", error)
            return "hardware_error"
        }
    }

    // Método de respaldo para generar una huella más simple
    private generateFallbackFingerprint(): string {
        const canvas = document.createElement("canvas")
        const gl = canvas.getContext("webgl")

        let fingerprint = ""

        // Información de la pantalla (más consistente entre navegadores)
        fingerprint += `_${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`

        // Zona horaria
        fingerprint += `_${new Date().getTimezoneOffset()}`

        // Información de WebGL si está disponible
        if (gl) {
            const debugInfo = gl.getExtension("WEBGL_debug_renderer_info")
            if (debugInfo) {
                fingerprint += `_${gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)}`
            }
        }

        // Convertir a hash para tener una longitud fija
        let hash = 0
        for (let i = 0; i < fingerprint.length; i++) {
            const char = fingerprint.charCodeAt(i)
            hash = (hash << 5) - hash + char
            hash = hash & hash // Convertir a entero de 32 bits
        }

        return `fallback_${hash}`
    }

    // Limpiar la huella (útil para pruebas)
    public clearFingerprint(): void {
        localStorage.removeItem("machine_fingerprint")
        this.fingerprint = null
    }
}

export default FingerprintService.getInstance()
