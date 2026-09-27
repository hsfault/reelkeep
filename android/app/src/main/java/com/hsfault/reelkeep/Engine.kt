package com.hsfault.reelkeep

import android.content.Context
import android.os.Environment
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Starts the Python backend once per app process and reports its port. */
object Engine {
    @Volatile
    private var port = 0
    private val lock = Any()

    /** 0 until the engine has started. */
    val currentPort: Int
        get() = port

    fun ensureStarted(context: Context): Int = synchronized(lock) {
        if (port != 0) return port

        if (!Python.isStarted()) {
            Python.start(AndroidPlatform(context.applicationContext))
        }

        val dataDir = File(context.filesDir, "reelkeep").apply { mkdirs() }
        val downloadsDir = (context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            ?: File(context.filesDir, "downloads")).apply { mkdirs() }

        port = Python.getInstance()
            .getModule("reelkeep_android")
            .callAttr("start", dataDir.absolutePath, downloadsDir.absolutePath)
            .toInt()
        return port
    }

    fun waitUntilReady(port: Int, timeoutMs: Long = 45_000): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            try {
                val conn = URL("http://127.0.0.1:$port/api/health").openConnection() as HttpURLConnection
                conn.connectTimeout = 1_000
                conn.readTimeout = 2_000
                val ok = conn.responseCode == 200
                conn.disconnect()
                if (ok) return true
            } catch (_: Exception) {
                // not up yet
            }
            Thread.sleep(250)
        }
        return false
    }
}