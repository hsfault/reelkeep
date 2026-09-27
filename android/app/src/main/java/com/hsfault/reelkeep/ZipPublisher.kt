package com.hsfault.reelkeep

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/** Moves finished ZIPs into the public Downloads/Reelkeep folder and opens/shares them. */
object ZipPublisher {

    data class Saved(val uri: Uri, val location: String) {
        fun toJson(): JSONObject =
            JSONObject().put("ok", true).put("uri", uri.toString()).put("location", location)
    }

    private val byJob = ConcurrentHashMap<String, Saved>()
    private val knownUris = ConcurrentHashMap.newKeySet<String>()
    private val lock = Any()

    /** Safe to call more than once for the same job (service + app both call it). */
    fun publish(context: Context, jobId: String, path: String, filename: String): Saved {
        byJob[jobId]?.let { return it }
        synchronized(lock) {
            byJob[jobId]?.let { return it }

            val source = File(path).canonicalFile
            require(isInsideAppStorage(context, source)) { "That file isn't one of Reelkeep's downloads." }
            require(source.isFile) { "The ZIP file is missing." }

            val saved = when {
                Build.VERSION.SDK_INT >= 29 ->
                    saveToDownloadsQ(context, source, filename).also { source.delete() }
                hasLegacyPermission(context) ->
                    saveToDownloadsLegacy(context, source, filename).also { source.delete() }
                else ->
                    keepInApp(context, source)
            }

            byJob[jobId] = saved
            knownUris.add(saved.uri.toString())
            return saved
        }
    }

    fun open(context: Context, uriString: String) {
        if (uriString !in knownUris) return
        val view = Intent(Intent.ACTION_VIEW)
            .setDataAndType(Uri.parse(uriString), "application/zip")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching { context.startActivity(Intent.createChooser(view, "Open ZIP with")) }
    }

    fun share(context: Context, uriString: String) {
        if (uriString !in knownUris) return
        val send = Intent(Intent.ACTION_SEND)
            .setType("application/zip")
            .putExtra(Intent.EXTRA_STREAM, Uri.parse(uriString))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching { context.startActivity(Intent.createChooser(send, "Share ZIP")) }
    }

    // ---- helpers ----

    private fun isInsideAppStorage(context: Context, file: File): Boolean {
        val roots = listOfNotNull(context.getExternalFilesDir(null), context.filesDir)
            .map { it.canonicalFile.path + File.separator }
        return roots.any { file.path.startsWith(it) }
    }

    private fun hasLegacyPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            PackageManager.PERMISSION_GRANTED

    /** Android 10+: MediaStore, no permission needed. */
    @RequiresApi(29)
    private fun saveToDownloadsQ(context: Context, source: File, filename: String): Saved {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, filename)
            put(MediaStore.Downloads.MIME_TYPE, "application/zip")
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Reelkeep")
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: error("Couldn't create the file in Downloads.")
        try {
            val out = resolver.openOutputStream(uri) ?: error("Couldn't write to Downloads.")
            out.use { stream -> source.inputStream().use { it.copyTo(stream, 256 * 1024) } }
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }
        return Saved(uri, "Downloads/Reelkeep/$filename")
    }

    /** Android 7–9 with storage permission. */
    @Suppress("DEPRECATION")
    private fun saveToDownloadsLegacy(context: Context, source: File, filename: String): Saved {
        val dir = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            "Reelkeep",
        ).apply { mkdirs() }
        val target = File(dir, filename)
        source.copyTo(target, overwrite = true)
        MediaScannerConnection.scanFile(context, arrayOf(target.absolutePath), arrayOf("application/zip"), null)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", target)
        return Saved(uri, "Downloads/Reelkeep/$filename")
    }

    /** Android 7–9 without permission: keep it in the app, Share still works. */
    private fun keepInApp(context: Context, source: File): Saved {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", source)
        return Saved(uri, "App storage (use Share)")
    }
}