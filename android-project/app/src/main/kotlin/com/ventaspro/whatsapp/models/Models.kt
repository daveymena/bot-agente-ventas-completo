package com.ventaspro.whatsapp.models

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName

// ════════════════════════════════════════════════════════════════════
// API MODELS
// ════════════════════════════════════════════════════════════════════

data class WhatsAppMessage(
    val phone: String,
    val message: String,
    val timestamp: String = System.currentTimeMillis().toString()
)

data class ApiCapturerResponse(
    val ok: Boolean,
    @SerializedName("conversationId")
    val conversationId: Int,
    @SerializedName("debe_responder")
    val debeResponder: Boolean,
    val respuesta: String?,
    val confianza: Int,
    @SerializedName("tipo_mensaje")
    val tipoMensaje: String,
    val razonamiento: String,
    val timestamp: String
)

data class ExecuteResponseRequest(
    @SerializedName("conversationId")
    val conversationId: Int,
    val mensaje: String,
    val phone: String
)

data class ContextResponse(
    val ok: Boolean,
    val tenantId: Int,
    val productos: List<Product>,
    val timestamp: String
)

data class Product(
    val id: Int,
    val nombre: String,
    val precio: Double,
    val descripcion: String?
)

// ════════════════════════════════════════════════════════════════════
// DATABASE ENTITIES
// ════════════════════════════════════════════════════════════════════

@Entity(tableName = "conversations")
data class ConversationEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,
    val phone: String,
    val message: String,
    val response: String? = null,
    val confianza: Int = 0,
    val esAutomatico: Boolean = false,
    val tipoMensaje: String = "otro",
    val timestamp: Long = System.currentTimeMillis(),
    val synced: Boolean = false
)

@Entity(tableName = "analytics")
data class AnalyticsEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,
    val tipoMensaje: String,
    val confianza: Int,
    val fueAutomatico: Boolean,
    val timestamp: Long = System.currentTimeMillis(),
    val synced: Boolean = false
)

@Entity(tableName = "auth")
data class AuthEntity(
    @PrimaryKey
    val id: Int = 1,
    val tenantToken: String = "",
    val tenantId: Int = 0,
    val email: String = ""
)

// ════════════════════════════════════════════════════════════════════
// UI MODELS
// ════════════════════════════════════════════════════════════════════

data class ConversationUI(
    val id: Int,
    val phone: String,
    val message: String,
    val response: String?,
    val confianza: Int,
    val esAutomatico: Boolean,
    val tipoMensaje: String,
    val timestamp: Long
)

data class AnalyticsUIState(
    val totalMensajes: Int = 0,
    val respuestasAutomaticas: Int = 0,
    val confianzaPromedio: Int = 0,
    val tasaAutomatizacion: Int = 0,
    val tiposComunes: Map<String, Int> = emptyMap()
)

data class AutomationSettings(
    val enabled: Boolean = true,
    val minConfidencia: Int = 75,
    val autoResponderPrecio: Boolean = true,
    val autoResponderProducto: Boolean = true,
    val autoResponderCompra: Boolean = true,
    val autoResponderHorario: Boolean = true
)
