package com.ventaspro.whatsapp

import android.content.Intent
import android.provider.Settings
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.material3.Checkbox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import com.ventaspro.whatsapp.api.ApiClient
import com.ventaspro.whatsapp.db.AppDatabase
import com.ventaspro.whatsapp.models.ConversationEntity
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private lateinit var apiClient: ApiClient
    private lateinit var db: AppDatabase

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)

        apiClient = ApiClient(this)
        db = AppDatabase.getInstance(this)

        setContent {
            VentasproTheme {
                MainScreen(
                    apiClient = apiClient,
                    db = db,
                    onEnableNotifications = { openNotificationSettings() }
                )
            }
        }
    }

    private fun openNotificationSettings() {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        startActivity(intent)
    }
}

@Composable
fun VentasproTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Color(0xFF00D4FF),
            surface = Color(0xFF1A1A1A),
            background = Color(0xFF0F0F0F)
        )
    ) {
        content()
    }
}

@Composable
fun MainScreen(
    apiClient: ApiClient,
    db: AppDatabase,
    onEnableNotifications: () -> Unit
) {
    var selectedTab by remember { mutableStateOf(0) }
    var conversations by remember { mutableStateOf<List<ConversationEntity>>(emptyList()) }
    var totalMensajes by remember { mutableStateOf(0) }
    var respuestasAutomaticas by remember { mutableStateOf(0) }
    var confianzaPromedio by remember { mutableStateOf(0) }

    LaunchedEffect(Unit) {
        // Cargar conversaciones
        db.conversationDao().getAllConversations().collectLatest {
            conversations = it
        }
    }

    LaunchedEffect(conversations) {
        totalMensajes = conversations.size
        respuestasAutomaticas = conversations.count { it.esAutomatico }
        confianzaPromedio = if (conversations.isNotEmpty()) {
            conversations.map { it.confianza }.average().toInt()
        } else {
            0
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F0F))
    ) {
        // Header
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF1A1A1A))
                .padding(20.dp)
        ) {
            Text(
                "🤖 Ventaspro WhatsApp Bot",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF00D4FF)
            )
            Text(
                "Automatización inteligente de respuestas",
                fontSize = 12.sp,
                color = Color.Gray
            )
        }

        // Tab selector
        TabRow(
            selectedTabIndex = selectedTab,
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF1A1A1A)),
            indicator = { }
        ) {
            listOf("Dashboard", "Conversaciones", "Configuración").forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = {
                        Text(
                            title,
                            color = if (selectedTab == index) Color(0xFF00D4FF) else Color.Gray,
                            fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal
                        )
                    }
                )
            }
        }

        // Contenido
        when (selectedTab) {
            0 -> DashboardTab(totalMensajes, respuestasAutomaticas, confianzaPromedio)
            1 -> ConversationsTab(conversations)
            2 -> SettingsTab(apiClient, onEnableNotifications)
        }
    }
}

@Composable
fun DashboardTab(totalMensajes: Int, respuestasAutomaticas: Int, confianzaPromedio: Int) {
    val automatizacion = if (totalMensajes > 0) (respuestasAutomaticas * 100) / totalMensajes else 0

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                "📊 Estadísticas Hoy",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        }

        item {
            StatsCard("📱 Mensajes Capturados", totalMensajes.toString(), Color(0xFF00D4FF))
        }

        item {
            StatsCard("✅ Respuestas Automáticas", respuestasAutomaticas.toString(), Color(0xFF00FF00))
        }

        item {
            StatsCard("🎯 Tasa de Automatización", "$automatizacion%", Color(0xFFFFAA00))
        }

        item {
            StatsCard("📈 Confianza Promedio", "$confianzaPromedio%", Color(0xFF0088FF))
        }

        item {
            Divider(color = Color(0xFF333333), thickness = 1.dp)
        }

        item {
            Text(
                "💡 El sistema captura notificaciones de WhatsApp y responde automáticamente con confianza >= 75%",
                fontSize = 12.sp,
                color = Color.Gray,
                modifier = Modifier.padding(8.dp)
            )
        }
    }
}

@Composable
fun StatsCard(title: String, value: String, color: Color) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1A1A1A))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(title, fontSize = 16.sp, color = Color.White)
            Text(value, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
fun ConversationsTab(conversations: List<ConversationEntity>) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (conversations.isEmpty()) {
            item {
                Text(
                    "Sin conversaciones aún",
                    fontSize = 16.sp,
                    color = Color.Gray,
                    modifier = Modifier.padding(16.dp)
                )
            }
        } else {
            items(conversations) { conv ->
                ConversationItem(conv)
            }
        }
    }
}

@Composable
fun ConversationItem(conv: ConversationEntity) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(4.dp),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1A1A1A))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(conv.phone, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.White)
                if (conv.esAutomatico) {
                    Icon(
                        Icons.Filled.Check,
                        contentDescription = "Automático",
                        tint = Color(0xFF00FF00),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            Text(
                conv.message,
                fontSize = 12.sp,
                color = Color.Gray,
                modifier = Modifier.padding(top = 4.dp)
            )
            if (conv.response != null) {
                Text(
                    "Respuesta: ${conv.response.take(50)}...",
                    fontSize = 11.sp,
                    color = Color(0xFF00D4FF),
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
            Text(
                "Confianza: ${conv.confianza}%",
                fontSize = 10.sp,
                color = Color.Gray,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
    }
}

@Composable
fun SettingsTab(apiClient: ApiClient, onEnableNotifications: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    var isLoggedIn by remember { mutableStateOf(apiClient.isLoggedIn()) }
    var showMessage by remember { mutableStateOf("") }
    val loginScope = rememberCoroutineScope()
    var loggingIn by remember { mutableStateOf(false) }
    var monitorWhatsApp by remember { mutableStateOf(apiClient.getMonitoredApps().contains("com.whatsapp")) }
    var monitorBusiness by remember { mutableStateOf(apiClient.getMonitoredApps().contains("com.whatsapp.w4b")) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("⚙️ Configuración", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)

        if (isLoggedIn) {
            Text("✅ Autenticado como: ${apiClient.getEmail()}", color = Color(0xFF00FF00))
            Button(
                onClick = {
                    apiClient.logout()
                    isLoggedIn = false
                    showMessage = "Sesión cerrada"
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Cerrar sesión")
            }
        } else {
            TextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                modifier = Modifier.fillMaxWidth()
            )
            TextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("Contraseña") },
                modifier = Modifier.fillMaxWidth()
            )
            Button(
                onClick = {
                    if (email.isNotEmpty() && token.isNotEmpty()) {
                        loggingIn = true
                        loginScope.launch {
                            val success = apiClient.login(email.trim(), token)
                            loggingIn = false
                            isLoggedIn = success
                            showMessage = if (success) "Autenticado correctamente" else "Correo o contraseña incorrectos"
                        }
                    } else {
                        showMessage = "Llena todos los campos"
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !loggingIn
            ) {
                Text(if (loggingIn) "Conectando..." else "Iniciar sesión")
            }
        }

        Divider(color = Color(0xFF333333))

        Button(
            onClick = { onEnableNotifications() },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("🔔 Habilitar Notificaciones de WhatsApp")
        }

        Text(
            "1. Click en el botón arriba\n2. Busca 'Ventaspro WhatsApp Bot'\n3. Marca el checkbox\n4. Presiona 'Permitir'",
            fontSize = 12.sp,
            color = Color.Gray
        )

        Divider(color = Color(0xFF333333))

        Text(
            "📱 Monitorear aplicaciones:",
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("WhatsApp Normal", fontSize = 12.sp, color = Color.Gray)
            Checkbox(
                checked = monitorWhatsApp,
                onCheckedChange = { checked ->
                    monitorWhatsApp = checked
                    val selected = mutableSetOf<String>()
                    if (monitorWhatsApp) selected.add("com.whatsapp")
                    if (monitorBusiness) selected.add("com.whatsapp.w4b")
                    apiClient.setMonitoredApps(selected)
                    showMessage = "✅ Configuración guardada"
                }
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("WhatsApp Business", fontSize = 12.sp, color = Color.Gray)
            Checkbox(
                checked = monitorBusiness,
                onCheckedChange = { checked ->
                    monitorBusiness = checked
                    val selected = mutableSetOf<String>()
                    if (monitorWhatsApp) selected.add("com.whatsapp")
                    if (monitorBusiness) selected.add("com.whatsapp.w4b")
                    apiClient.setMonitoredApps(selected)
                    showMessage = "✅ Configuración guardada"
                }
            )
        }

        if (showMessage.isNotEmpty()) {
            Text(showMessage, color = Color(0xFF00FF00))
        }
    }
}
