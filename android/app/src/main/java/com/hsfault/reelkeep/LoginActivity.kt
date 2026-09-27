package com.hsfault.reelkeep

import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.chaquo.python.Python
import kotlin.concurrent.thread

/**
 * Shows the normal Instagram login page. As soon as Instagram sets the
 * "sessionid" cookie, the login is saved for the engine and this screen closes.
 */
class LoginActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var status: TextView
    private val handler = Handler(Looper.getMainLooper())
    private var saving = false
    private var failedSession: String? = null

    private val poll = object : Runnable {
        override fun run() {
            checkLogin()
            handler.postDelayed(this, 1_500)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dp = resources.displayMetrics.density

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(BONE)
        }

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding((20 * dp).toInt(), (6 * dp).toInt(), (8 * dp).toInt(), (6 * dp).toInt())
        }
        val title = TextView(this).apply {
            text = "LOG IN TO INSTAGRAM"
            setTextColor(INK)
            textSize = 12f
            letterSpacing = 0.12f
            typeface = Typeface.MONOSPACE
        }
        val close = TextView(this).apply {
            text = "CLOSE"
            setTextColor(INK)
            textSize = 12f
            letterSpacing = 0.12f
            typeface = Typeface.MONOSPACE
            gravity = Gravity.CENTER
            minHeight = (44 * dp).toInt()
            setPadding((16 * dp).toInt(), 0, (16 * dp).toInt(), 0)
            setOnClickListener { finish() }
        }
        bar.addView(title, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        bar.addView(close)

        status = TextView(this).apply {
            text = "Your login stays on this phone. Reelkeep only keeps the session, never your password."
            setTextColor(Color.parseColor("#8F111111"))
            textSize = 13f
            setPadding((20 * dp).toInt(), 0, (20 * dp).toInt(), (12 * dp).toInt())
        }

        webView = WebView(this)

        root.addView(bar, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        root.addView(status, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        root.addView(webView, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        setContentView(root)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            // Look like normal mobile Chrome, not an embedded WebView
            userAgentString = userAgentString
                .replace("; wv", "")
                .replace(Regex("Version/[\\d.]+ "), "")
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Keep web pages inside; block app links like instagram:// or intent://
                val scheme = request.url.scheme ?: return true
                return scheme != "http" && scheme != "https"
            }

            override fun onPageFinished(view: WebView, url: String) {
                checkLogin()
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        webView.loadUrl("https://www.instagram.com/accounts/login/")
    }

    override fun onResume() {
        super.onResume()
        handler.postDelayed(poll, 1_500)
    }

    override fun onPause() {
        handler.removeCallbacks(poll)
        super.onPause()
    }

    private fun checkLogin() {
        if (saving) return
        val raw = CookieManager.getInstance().getCookie("https://www.instagram.com") ?: return
        val cookies = parseCookies(raw)
        val session = cookies["sessionid"]
        if (session.isNullOrBlank() || session == failedSession) return

        saving = true
        status.text = "Logged in. Saving your session…"
        CookieManager.getInstance().flush()

        thread(name = "reelkeep-login-save") {
            val result = runCatching {
                Engine.ensureStarted(applicationContext)
                Python.getInstance()
                    .getModule("cookie_store")
                    .callAttr("save", toNetscape(cookies))
            }
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                result
                    .onSuccess {
                        setResult(RESULT_OK)
                        finish()
                    }
                    .onFailure { e ->
                        saving = false
                        failedSession = session
                        status.text = "Couldn't save the login: ${e.message ?: e}"
                    }
            }
        }
    }

    private fun parseCookies(raw: String): Map<String, String> =
        raw.split(";")
            .mapNotNull { part ->
                val trimmed = part.trim()
                val eq = trimmed.indexOf('=')
                if (eq <= 0) null else trimmed.substring(0, eq) to trimmed.substring(eq + 1)
            }
            .toMap()

    /** The same cookies.txt format the engine already understands. */
    private fun toNetscape(cookies: Map<String, String>): String {
        val expires = System.currentTimeMillis() / 1000 + 180L * 24 * 3600
        return buildString {
            append("# Netscape HTTP Cookie File\n")
            for ((name, value) in cookies) {
                append(".instagram.com\tTRUE\t/\tTRUE\t$expires\t$name\t$value\n")
            }
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(poll)
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private val BONE = Color.parseColor("#EFEDE8")
        private val INK = Color.parseColor("#111111")
    }
}