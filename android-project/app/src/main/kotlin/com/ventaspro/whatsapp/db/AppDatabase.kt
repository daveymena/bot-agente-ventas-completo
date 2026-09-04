package com.ventaspro.whatsapp.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.ventaspro.whatsapp.models.AnalyticsEntity
import com.ventaspro.whatsapp.models.AuthEntity
import com.ventaspro.whatsapp.models.ConversationEntity

@Database(
    entities = [ConversationEntity::class, AnalyticsEntity::class, AuthEntity::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun conversationDao(): ConversationDao
    abstract fun analyticsDao(): AnalyticsDao
    abstract fun authDao(): AuthDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "ventaspro_whatsapp.db"
                ).build().also { instance = it }
            }
        }
    }
}
