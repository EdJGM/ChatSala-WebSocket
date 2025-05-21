// Este servicio permite compartir datos entre diferentes navegadores en la misma máquina

class CrossBrowserStorage {
    private static instance: CrossBrowserStorage
    private broadcastChannel: BroadcastChannel | null = null
    private localStorageKey = "machine_fingerprint_shared"
    private sharedFingerprint: string | null = null
    private callbacks: Array<(fingerprint: string) => void> = []

    private constructor() {
        // Intentar usar BroadcastChannel para comunicación entre pestañas/navegadores
        this.initBroadcastChannel()

        // Intentar usar localStorage para almacenamiento persistente
        this.initLocalStorage()

        // Intentar usar IndexedDB como método alternativo
        this.initIndexedDB()
    }

    public static getInstance(): CrossBrowserStorage {
        if (!CrossBrowserStorage.instance) {
            CrossBrowserStorage.instance = new CrossBrowserStorage()
        }
        return CrossBrowserStorage.instance
    }

    // Inicializar BroadcastChannel para comunicación entre pestañas
    private initBroadcastChannel(): void {
        try {
            if ("BroadcastChannel" in window) {
                this.broadcastChannel = new BroadcastChannel("machine_fingerprint_channel")

                this.broadcastChannel.onmessage = (event) => {
                    if (event.data && event.data.fingerprint) {
                        this.setSharedFingerprint(event.data.fingerprint)
                    }
                }
            }
        } catch (error) {
            console.error("Error al inicializar BroadcastChannel:", error)
        }
    }

    // Inicializar localStorage
    private initLocalStorage(): void {
        try {
            const storedFingerprint = localStorage.getItem(this.localStorageKey)
            if (storedFingerprint) {
                this.setSharedFingerprint(storedFingerprint)
            }

            // Escuchar cambios en localStorage de otras pestañas
            window.addEventListener("storage", (event) => {
                if (event.key === this.localStorageKey && event.newValue) {
                    this.setSharedFingerprint(event.newValue)
                }
            })
        } catch (error) {
            console.error("Error al inicializar localStorage:", error)
        }
    }

    // Inicializar IndexedDB como método alternativo
    private initIndexedDB(): void {
        try {
            const request = indexedDB.open("FingerprintDB", 1)

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result
                if (!db.objectStoreNames.contains("fingerprints")) {
                    db.createObjectStore("fingerprints", { keyPath: "id" })
                }
            }

            request.onsuccess = (event) => {
                const db = (event.target as IDBOpenDBRequest).result
                const transaction = db.transaction(["fingerprints"], "readonly")
                const store = transaction.objectStore("fingerprints")
                const getRequest = store.get("main")

                getRequest.onsuccess = () => {
                    if (getRequest.result && getRequest.result.value) {
                        this.setSharedFingerprint(getRequest.result.value)
                    }
                }
            }
        } catch (error) {
            console.error("Error al inicializar IndexedDB:", error)
        }
    }

    // Establecer y compartir la huella digital
    public setFingerprint(fingerprint: string): void {
        this.setSharedFingerprint(fingerprint)

        // Guardar en localStorage
        try {
            localStorage.setItem(this.localStorageKey, fingerprint)
        } catch (error) {
            console.error("Error al guardar en localStorage:", error)
        }

        // Compartir a través de BroadcastChannel
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({ fingerprint })
            } catch (error) {
                console.error("Error al enviar mensaje por BroadcastChannel:", error)
            }
        }

        // Guardar en IndexedDB
        try {
            const request = indexedDB.open("FingerprintDB", 1)
            request.onsuccess = (event) => {
                const db = (event.target as IDBOpenDBRequest).result
                const transaction = db.transaction(["fingerprints"], "readwrite")
                const store = transaction.objectStore("fingerprints")
                store.put({ id: "main", value: fingerprint })
            }
        } catch (error) {
            console.error("Error al guardar en IndexedDB:", error)
        }
    }

    // Establecer la huella compartida y notificar a los callbacks
    private setSharedFingerprint(fingerprint: string): void {
        this.sharedFingerprint = fingerprint
        this.callbacks.forEach((callback) => callback(fingerprint))
    }

    // Obtener la huella digital compartida
    public getFingerprint(): string | null {
        return this.sharedFingerprint
    }

    // Registrar un callback para cuando la huella cambie
    public onFingerprintChange(callback: (fingerprint: string) => void): void {
        this.callbacks.push(callback)
        if (this.sharedFingerprint) {
            callback(this.sharedFingerprint)
        }
    }
}

export default CrossBrowserStorage.getInstance()
  