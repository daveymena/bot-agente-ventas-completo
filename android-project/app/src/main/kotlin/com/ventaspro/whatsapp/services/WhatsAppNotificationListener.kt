package com.ventaspro.whatsapp.services

import android.app.Notification
import android.app.RemoteInput
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.ventaspro.whatsapp.api.ApiClient
import com.ventaspro.whatsapp.db.AppDatabase
import com.ventaspro.whatsapp.models.AnalyticsEntity
import com.ventaspro.whatsapp.models.ConversationEntity
import com.ventaspro.whatsapp.models.WhatsAppMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.min

class WhatsAppNotificationListener : NotificationListenerService() {

    private lateinit var apiClient: ApiClient
    private lateinit var db: AppDatabase
    private val scope = CoroutineScope(Dispatchers.Main)
    private val TAG = "WhatsAppListener"

    override fun onCreate() {
        super.onCreate()
        apiClient = ApiClient(this)
        db = AppDatabase.getInstance(this)
        Log.d(TAG, "✅ WhatsApp Notification Listener iniciado")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        // Solo procesar si la app está en la lista de monitoreadas
        if (!apiClient.isAppMonitored(sbn.packageName)) return

        val notification = sbn.notification ?: return

        try {
            // Extraer datos de la notificación
            val titulo = notification.extras.getString(Notification.EXTRA_TITLE) ?: return
            val texto = notification.extras.getString(Notification.EXTRA_TEXT) ?: return

            Log.d(TAG, "📱 Notificación recibida de $titulo: $texto")

            // Extraer número de teléfono del título
            val phone = extraerNumero(titulo)
            if (phone.isEmpty()) {
                Log.w(TAG, "⚠️ No se pudo extraer número de: $titulo")
                return
            }

            // Crear mensaje
            val mensaje = WhatsAppMessage(
                phone = phone,
                message = texto,
                timestamp = System.currentTimeMillis().toString()
            )

            // Procesar en background
            scope.launch {
                    procesarMensaje(mensaje, titulo, notification)
            }

        } catch (e: Exception) {
            Log.e(TAG, "❌ Error procesando notificación", e)
        }
    }

    private suspend fun procesarMensaje(mensaje: WhatsAppMessage, titulo: String, notification: Notification) {
        try {
            // Verificar autenticación
            if (!apiClient.isLoggedIn()) {
                Log.w(TAG, "⚠️ Usuario no autenticado, ignorando mensaje")
                return
            }

            Log.d(TAG, "🔄 Enviando mensaje al backend...")

            // 1. Enviar al backend para análisis
            val analisis = apiClient.captureMessage(mensaje)
            if (analisis == null) {
                Log.e(TAG, "❌ Error obteniendo análisis del backend")
                return
            }

            Log.d(TAG, "✅ Análisis recibido: debeResponder=${analisis.debeResponder}, confianza=${analisis.confianza}")

            // 2. Guardar en BD local
            val conversacion = ConversationEntity(
                phone = mensaje.phone,
                message = mensaje.message,
                response = analisis.respuesta,
                confianza = analisis.confianza,
                esAutomatico = analisis.debeResponder,
                tipoMensaje = analisis.tipoMensaje,
                timestamp = System.currentTimeMillis()
            )
            val convId = db.conversationDao().insert(conversacion).toInt()

            // 3. Guardar analytics
            val analytics = AnalyticsEntity(
                tipoMensaje = analisis.tipoMensaje,
                confianza = analisis.confianza,
                fueAutomatico = analisis.debeResponder
            )
            db.analyticsDao().insert(analytics)

            // 4. Si debe responder automáticamente
            if (analisis.debeResponder && analisis.respuesta != null) {
                Log.d(TAG, "💬 Enviando respuesta automática...")

                // Confirmar en backend
                val enviado = apiClient.executeResponse(
                    conversationId = analisis.conversationId,
                    message = analisis.respuesta,
                    phone = mensaje.phone
                )

                if (enviado) {
                    Log.d(TAG, "✅ Respuesta registrada en backend")

                    // Actualizar conversación
                    val updated = conversacion.copy(
                        id = convId,
                        response = analisis.respuesta,
                        esAutomatico = true,
                        synced = true
                    )
                    db.conversationDao().update(updated)

                    enviarRespuestaEnNotificacion(notification, analisis.respuesta)
                } else {
                    Log.w(TAG, "⚠️ No se pudo confirmar respuesta en backend")
                }
            } else {
                Log.d(TAG, "⚠️ No se enviará respuesta automática (confianza < 75%)")
            }

        } catch (e: Exception) {
            Log.e(TAG, "❌ Error procesando mensaje", e)
        }
    }

    private fun extraerNumero(titulo: String): String {
        // Patrones posibles: "+573001234567", "+57 300 1234567", "3001234567", etc.
        val patrones = listOf(
            "\\+\\d{1,3}\\s?\\d{1,14}",  // Formato internacional
            "^\\d{10,}$",                  // Solo dígitos
        )

        for (patron in patrones) {
            val regex = Regex(patron)
            val match = regex.find(titulo.replace(" ", "").replace("-", ""))
            if (match != null) {
                var numero = match.value.replace(" ", "").replace("-", "")
                // Asegurar formato +57...
                if (!numero.startsWith("+")) {
                    numero = if (numero.startsWith("57")) "+$numero" else "+57$numero"
                }
                return numero
            }
        }

        // Some WhatsApp versions show the contact name instead of the number.
        // Keep a stable identifier rather than silently dropping the message.
        return titulo.trim()
    }

    private fun enviarRespuestaEnNotificacion(notification: Notification, respuesta: String) {
        val actions = notification.actions ?: return
        val replyAction = actions.firstOrNull { action ->
            !action.remoteInputs.isNullOrEmpty()
        } ?: return
        try {
            val intent = Intent()
            val results = android.os.Bundle().apply {
                putCharSequence(replyAction.remoteInputs[0].resultKey, respuesta)
            }
            RemoteInput.addResultsToIntent(replyAction.remoteInputs, intent, results)
            replyAction.actionIntent.send(this, 0, intent)
            Log.d(TAG, "✅ Respuesta enviada mediante la acción de WhatsApp")
        } catch (e: Exception) {
            Log.e(TAG, "❌ WhatsApp no permitió respuesta desde la notificación", e)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // Ignorar remociones
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.d(TAG, "✅ Listener conectado")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "❌ Listener desconectado")
    }
}
