package com.ventaspro.whatsapp.api

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.ventaspro.whatsapp.models.ApiCapturerResponse
import com.ventaspro.whatsapp.models.ContextResponse
import com.ventaspro.whatsapp.models.ExecuteResponseRequest
import com.ventaspro.whatsapp.models.WhatsAppMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class ApiClient(private val context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("auth", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val baseUrl = "https://ventasproia.com"

    suspend fun login(email: String, password: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val json = gson.toJson(mapOf("email" to email, "password" to password))
            val request = Request.Builder()
                .url("$baseUrl/api/auth/login")
                .post(json.toRequestBody("application/json".toMediaType()))
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext false
                val cookie = response.headers["Set-Cookie"]?.substringBefore(";")
                    ?: return@withContext false
                prefs.edit()
                    .putString("session_cookie", cookie)
                    .putString("email", email)
                    .apply()
                true
            }
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun captureMessage(message: WhatsAppMessage): ApiCapturerResponse? = withContext(Dispatchers.IO) {
        try {
            val json = gson.toJson(message)
            val body = json.toRequestBody("application/json".toMediaType())

            val request = Request.Builder()
                .url("$baseUrl/api/whatsapp/capture")
                .post(body)
                .addHeader("Authorization", "Bearer ${getTenantToken()}")
                .addHeader("Cookie", getSessionCookie())
                .addHeader("Content-Type", "application/json")
                .build()

            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val data = response.body?.string() ?: return@withContext null
                gson.fromJson(data, ApiCapturerResponse::class.java)
            } else {
                null
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun executeResponse(
        conversationId: Int,
        message: String,
        phone: String
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val request = ExecuteResponseRequest(
                conversationId = conversationId,
                mensaje = message,
                phone = phone
            )
            val json = gson.toJson(request)
            val body = json.toRequestBody("application/json".toMediaType())

            val httpRequest = Request.Builder()
                .url("$baseUrl/api/whatsapp/execute")
                .post(body)
                .addHeader("Authorization", "Bearer ${getTenantToken()}")
                .addHeader("Cookie", getSessionCookie())
                .addHeader("Content-Type", "application/json")
                .build()

            val response = client.newCall(httpRequest).execute()
            response.isSuccessful
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun getContext(): ContextResponse? = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$baseUrl/api/whatsapp/context")
                .get()
                .addHeader("Authorization", "Bearer ${getTenantToken()}")
                .addHeader("Cookie", getSessionCookie())
                .build()

            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val data = response.body?.string() ?: return@withContext null
                gson.fromJson(data, ContextResponse::class.java)
            } else {
                null
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    fun setTenantToken(token: String, tenantId: Int, email: String) {
        prefs.edit()
            .putString("tenant_token", token)
            .putInt("tenant_id", tenantId)
            .putString("email", email)
            .apply()
    }

    private fun getTenantToken(): String {
        return prefs.getString("tenant_token", "") ?: ""
    }

    fun getTenantId(): Int {
        return prefs.getInt("tenant_id", 0)
    }

    fun getEmail(): String {
        return prefs.getString("email", "") ?: ""
    }

    fun isLoggedIn(): Boolean {
        return getSessionCookie().isNotEmpty() || getTenantToken().isNotEmpty()
    }

    private fun getSessionCookie(): String = prefs.getString("session_cookie", "") ?: ""

    fun logout() {
        prefs.edit()
            .remove("tenant_token")
            .remove("session_cookie")
            .remove("tenant_id")
            .remove("email")
            .apply()
    }

    // Configuración de apps monitoreadas
    fun setMonitoredApps(apps: Set<String>) {
        prefs.edit()
            .putStringSet("monitored_apps", apps)
            .apply()
    }

    fun getMonitoredApps(): Set<String> {
        return prefs.getStringSet("monitored_apps", setOf("com.whatsapp", "com.whatsapp.w4b")) ?: setOf("com.whatsapp", "com.whatsapp.w4b")
    }

    fun isAppMonitored(packageName: String): Boolean {
        return getMonitoredApps().contains(packageName)
    }
}
