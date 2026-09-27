package com.hsfault.reelkeep

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** Keeps the app alive while a ZIP is being built and shows its progress. */
class DownloadService : Service() {

    @Volatile
    private var jobId: String? = null
    private var worker: Thread? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val id = intent?.getStringExtra(EXTRA_JOB_ID)
        if (id.isNullOrBlank()) {
            stopSelf()
            return START_NOT_STICKY
        }

        createChannels()
        val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
        ServiceCompat.startForeground(this, NOTIFY_PROGRESS, progress("Preparing…", 0, 0), type)
        acquireWakeLock()

        jobId = id
        if (worker?.isAlive != true) {
            worker = thread(name = "reelkeep-download-watch") { watch() }
        }
        return START_NOT_STICKY
    }

    private fun watch() {
        var misses = 0
        while (true) {
            val id = jobId ?: return
            val job = runCatching { fetchJob(id) }.getOrNull()

            if (job == null) {
                if (++misses > 30) {
                    finish(null, "Lost contact with the download.")
                    return
                }
                Thread.sleep(1_000)
                continue
            }
            misses = 0

            when (job.optString("status")) {
                "running" -> {
                    val done = job.optInt("done")
                    val total = job.optInt("total")
                    notify(NOTIFY_PROGRESS, progress("$done of $total videos", done, total))
                }
                "done" -> {
                    if (id != jobId) continue // a newer download took over
                    val saved = runCatching {
                        ZipPublisher.publish(
                            applicationContext, id, job.getString("saved_to"), job.getString("filename"),
                        )
                    }
                    val count = job.optInt("total") - (job.optJSONArray("failed")?.length() ?: 0)
                    finish(saved.getOrNull()?.let { "$count videos · ${it.location}" }, saved.exceptionOrNull()?.message)
                    return
                }
                "cancelled" -> {
                    if (id == jobId) {
                        finish(null, null)
                        return
                    }
                }
                else -> {
                    if (id == jobId) {
                        finish(null, job.optString("error").ifBlank { "The download failed." })
                        return
                    }
                }
            }
            Thread.sleep(1_000)
        }
    }

    private fun fetchJob(id: String): JSONObject {
        val port = Engine.currentPort
        check(port != 0) { "Engine not running" }
        val conn = URL("http://127.0.0.1:$port/api/zip/$id").openConnection() as HttpURLConnection
        conn.connectTimeout = 2_000
        conn.readTimeout = 5_000
        try {
            check(conn.responseCode == 200) { "HTTP ${conn.responseCode}" }
            return JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        } finally {
            conn.disconnect()
        }
    }

    private fun finish(savedText: String?, error: String?) {
        jobId = null
        releaseWakeLock()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        when {
            savedText != null -> notify(NOTIFY_DONE, done("ZIP saved", savedText))
            error != null -> notify(NOTIFY_DONE, done("Download failed", error))
        }
        stopSelf()
    }

    // ---- notifications ----

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_PROGRESS, "Downloads in progress", NotificationManager.IMPORTANCE_LOW),
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_DONE, "Finished downloads", NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    private fun openApp(): PendingIntent = PendingIntent.getActivity(
        this,
        0,
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun progress(text: String, done: Int, total: Int): Notification =
        NotificationCompat.Builder(this, CHANNEL_PROGRESS)
            .setSmallIcon(R.drawable.ic_stat_reelkeep)
            .setContentTitle("Packing your ZIP")
            .setContentText(text)
            .setProgress(total.coerceAtLeast(0), done.coerceAtLeast(0), total == 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(openApp())
            .build()

    private fun done(title: String, text: String): Notification =
        NotificationCompat.Builder(this, CHANNEL_DONE)
            .setSmallIcon(R.drawable.ic_stat_reelkeep)
            .setContentTitle(title)
            .setContentText(text)
            .setAutoCancel(true)
            .setContentIntent(openApp())
            .build()

    private fun notify(id: Int, notification: Notification) {
        runCatching { getSystemService(NotificationManager::class.java).notify(id, notification) }
    }

    // ---- keep the CPU awake while downloading with the screen off ----

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val power = getSystemService(PowerManager::class.java)
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Reelkeep:download").apply {
            setReferenceCounted(false)
            acquire(2 * 60 * 60 * 1000L) // safety limit: 2 hours
        }
    }

    private fun releaseWakeLock() {
        runCatching { if (wakeLock?.isHeld == true) wakeLock?.release() }
        wakeLock = null
    }

    override fun onDestroy() {
        releaseWakeLock()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_JOB_ID = "job_id"
        private const val CHANNEL_PROGRESS = "downloads"
        private const val CHANNEL_DONE = "saved"
        private const val NOTIFY_PROGRESS = 1
        private const val NOTIFY_DONE = 2
    }
}