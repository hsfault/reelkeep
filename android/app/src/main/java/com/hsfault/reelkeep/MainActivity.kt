package com.hsfault.reelkeep

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
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
import kotlin.concurrent.thread

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var message: TextView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    // File picker for <input type="file"> (cookies.txt upload in Settings)
    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        fileCallback?.onReceiveValue(uri?.let { arrayOf(it) })
        fileCallback = null
    }

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
        startEngine()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true               // recent profiles (localStorage)
            mediaPlaybackRequiresUserGesture = false // video preview autoplay
            allowFileAccess = false
            userAgentString = "$userAgentString ReelkeepApp"
        }

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

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private val BONE = Color.parseColor("#EFEDE8")
        private val INK = Color.parseColor("#111111")
    }
}