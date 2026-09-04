package com.ventaspro.whatsapp.services

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

/**
 * Servicio de accesibilidad para enviar mensajes automáticos a WhatsApp.
 * Stub funcional: cuando el backend notifica que debe_responder=true,
 * este service (habiéndolo activado el usuario en Ajustes → Accesibilidad)
 * puede performar clicks/teclado en la UI de WhatsApp.
 *
 * La lógica actual se limita a capturar el evento; el envío automático
 * se realiza vía PendingIntent/notification reply o por la propia app
 * abriendo WhatsApp con el texto pre-cargado.
 */
class AutoResponseAccessibility : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // No-op por ahora. La lógica de envío se invoca desde
        // WhatsAppNotificationListener.sendReply() vía Intent a WhatsApp.
    }

    override fun onInterrupt() {
        // No-op
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        // Placeholder para futura configuración dinámica del service.
    }
}
