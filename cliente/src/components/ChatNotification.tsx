import { Alert, AlertDescription } from "@/components/ui/alert"
import { InfoIcon, AlertCircleIcon, CheckCircleIcon } from "lucide-react"

interface ChatNotificationProps {
  message: string
  type: "info" | "error" | "success"
}

export function ChatNotification({ message, type }: ChatNotificationProps) {
  const getIcon = () => {
    switch (type) {
      case "error":
        return <AlertCircleIcon className="h-4 w-4 mr-2" />
      case "success":
        return <CheckCircleIcon className="h-4 w-4 mr-2" />
      default:
        return <InfoIcon className="h-4 w-4 mr-2" />
    }
  }

  return (
    <Alert variant={type === "error" ? "destructive" : "default"} className="mb-4">
      {getIcon()}
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
