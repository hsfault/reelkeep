package com.hsfault.reelkeep

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import kotlin.concurrent.thread

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var message: TextView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    // File picker for <input type="file"> (cookies.txt upload under Advanced)
    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        fileCallback?.onReceiveValue(uri?.let { arrayOf(it) })
        fileCallback = null
    }

    // In-app Instagram login; tells the React app when it succeeded
    private val loginFlow = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == RESULT_OK) {
            webView.evaluateJavascript("window.dispatchEvent(new Event('reelkeep:login'))", null)
        }
    }

    private val askPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this).apply { setBackgroundColor(BONE) }
        webView = WebView(this).apply {
            setBackgroundColor(BONE)
            visibility = View.INVISIBLE
        }
        message = TextView(this).apply {
            text = "STARTING REELKEEP…\n\nFirst launch takes a little longer."
            setTextColor(INK)
            textSize = 12f
            letterSpacing = 0.08f
            typeface = Typeface.MONOSPACE
            gravity = Gravity.CENTER
            setPadding(64, 64, 64, 64)
        }
        root.addView(webView, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        root.addView(message, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)

        setupWebView()
        setupBackButton()
        requestLegacyStorageIfNeeded()
        startEngine()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true                 // recent profiles (localStorage)
            mediaPlaybackRequiresUserGesture = false // video preview autoplay
            allowFileAccess = false
            userAgentString = "$userAgentString ReelkeepApp"
        }

        // window.ReelkeepAndroid in the React app
        webView.addJavascriptInterface(ReelkeepBridge(this, webView), "ReelkeepAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == "127.0.0.1") return false
                // Anything else (e.g. "Open on Instagram") goes to the real app/browser
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                view.visibility = View.VISIBLE
                message.visibility = View.GONE
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    pickFile.launch("*/*")
                    true
                } catch (_: Exception) {
                    fileCallback = null
                    false
                }
            }
        }
    }

    private fun setupBackButton() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    private fun requestLegacyStorageIfNeeded() {
        if (Build.VERSION.SDK_INT < 29 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            askPermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
    }

    private fun startEngine() {
        thread(name = "reelkeep-start") {
            val result = runCatching {
                val port = Engine.ensureStarted(applicationContext)
                check(Engine.waitUntilReady(port)) { "The engine didn't respond in time." }
                port
            }
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                result
                    .onSuccess { port -> webView.loadUrl("http://127.0.0.1:$port/") }
                    .onFailure { e -> message.text = "COULDN'T START REELKEEP\n\n${e.message ?: e}" }
            }
        }
    }

    // ---- Called by ReelkeepBridge (always on the UI thread) ----

    fun openLogin() {
        loginFlow.launch(Intent(this, LoginActivity::class.java))
    }

    fun startDownloadTracking(jobId: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            askPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        val intent = Intent(this, DownloadService::class.java)
            .putExtra(DownloadService.EXTRA_JOB_ID, jobId)
        runCatching { ContextCompat.startForegroundService(this, intent) }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private val BONE = Color.parseColor("#EFEDE8")
        private val INK = Color.parseColor("#111111")
    }
}