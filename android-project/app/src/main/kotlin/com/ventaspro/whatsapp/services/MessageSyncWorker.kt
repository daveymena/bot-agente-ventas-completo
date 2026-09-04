package com.ventaspro.whatsapp.services

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/**
 * Worker que sincroniza mensajes locales con el backend ventasproia.com.
 * Stub funcional: deja el esqueleto listo para encolar uploads
 * cuando vuelva la conexión. No rompe el build ni el runtime.
 */
class MessageSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        // TODO: implementar sincronización con backend cuando se requiera.
        return Result.success()
    }
}
