import FingerprintJS from "@fingerprintjs/fingerprintjs"

// Clase para manejar la generación y almacenamiento de la huella digital
class FingerprintService {
    private static instance: FingerprintService
    private fingerprint: string | null = null
    private fingerprintPromise: Promise<string> | null = null

    private constructor() { }

    // Patrón Singleton para asegurar una sola instancia
    public static getInstance(): FingerprintService {
        if (!FingerprintService.instance) {
            FingerprintService.instance = new FingerprintService()
        }
        return FingerprintService.instance
    }

    // Obtener la huella digital (genera una nueva si no existe)
    public async getFingerprint(): Promise<string> {
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
            const fp = await FingerprintJS.load()

            // Obtener la información del visitante
            const result = await fp.get()

            // Obtener información adicional del dispositivo
            const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
            const languages = navigator.languages.join(",")
            const cpuCores = navigator.hardwareConcurrency || "unknown"
            const deviceMemory = (navigator as any).deviceMemory || "unknown"
            const platform = navigator.platform
            const userAgent = navigator.userAgent

            // Combinar toda la información para crear una huella más única
            const combinedFingerprint = `${result.visitorId}_${screenInfo}_${timeZone}_${cpuCores}_${deviceMemory}_${platform}`

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

    // Método de respaldo para generar una huella más simple
    private generateFallbackFingerprint(): string {
        const canvas = document.createElement("canvas")
        const gl = canvas.getContext("webgl")

        let fingerprint = ""

        // Información del navegador
        fingerprint += navigator.userAgent

        // Información de la pantalla
        fingerprint += `_${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`

        // Zona horaria
        fingerprint += `_${new Date().getTimezoneOffset()}`

        // Idiomas
        fingerprint += `_${navigator.language || (navigator as any).userLanguage}`

        // Información de WebGL si está disponible
        if (gl) {
            const debugInfo = gl.getExtension("WEBGL_debug_renderer_info")
            if (debugInfo) {
                fingerprint += `_${gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)}`
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
