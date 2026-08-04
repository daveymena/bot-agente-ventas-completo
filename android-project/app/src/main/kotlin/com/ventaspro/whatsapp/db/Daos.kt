package com.ventaspro.whatsapp.db

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.ventaspro.whatsapp.models.AnalyticsEntity
import com.ventaspro.whatsapp.models.AuthEntity
import com.ventaspro.whatsapp.models.ConversationEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ConversationDao {
    @Insert
    suspend fun insert(conversation: ConversationEntity): Long

    @Update
    suspend fun update(conversation: ConversationEntity)

    @Delete
    suspend fun delete(conversation: ConversationEntity)

    @Query("SELECT * FROM conversations ORDER BY timestamp DESC")
    fun getAllConversations(): Flow<List<ConversationEntity>>

    @Query("SELECT * FROM conversations WHERE phone = :phone ORDER BY timestamp DESC LIMIT 1")
    suspend fun getLatestByPhone(phone: String): ConversationEntity?

    @Query("SELECT * FROM conversations WHERE synced = 0 ORDER BY timestamp ASC")
    suspend fun getUnsynced(): List<ConversationEntity>

    @Query("UPDATE conversations SET synced = 1 WHERE id IN (:ids)")
    suspend fun markSynced(ids: List<Int>)

    @Query("SELECT COUNT(*) FROM conversations")
    fun getTotalCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM conversations WHERE esAutomatico = 1")
    fun getAutomaticCount(): Flow<Int>
}

@Dao
interface AnalyticsDao {
    @Insert
    suspend fun insert(analytics: AnalyticsEntity): Long

    @Query("SELECT * FROM analytics WHERE synced = 0 ORDER BY timestamp ASC")
    suspend fun getUnsynced(): List<AnalyticsEntity>

    @Query("UPDATE analytics SET synced = 1 WHERE id IN (:ids)")
    suspend fun markSynced(ids: List<Int>)

    @Query("SELECT AVG(confianza) FROM analytics WHERE synced = 0")
    fun getAverageConfidence(): Flow<Int>

    @Query("SELECT tipoMensaje, COUNT(*) as count FROM analytics GROUP BY tipoMensaje")
    fun getMessageTypeStats(): Flow<List<MessageTypeStat>>
}

data class MessageTypeStat(
    val tipoMensaje: String,
    val count: Int
)

@Dao
interface AuthDao {
    @Insert
    suspend fun insert(auth: AuthEntity)

    @Update
    suspend fun update(auth: AuthEntity)

    @Query("SELECT * FROM auth WHERE id = 1")
    suspend fun getAuth(): AuthEntity?

    @Query("SELECT * FROM auth WHERE id = 1")
    fun getAuthFlow(): Flow<AuthEntity?>

    @Query("DELETE FROM auth")
    suspend fun clearAuth()
}
