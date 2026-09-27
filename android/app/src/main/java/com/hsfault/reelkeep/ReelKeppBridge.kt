package com.hsfault.reelkeep

import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import kotlin.concurrent.thread

/** Methods the React app can call as window.ReelkeepAndroid.*  */
class ReelkeepBridge(
    private val activity: MainActivity,
    private val webView: WebView,
) {

    @JavascriptInterface
    fun openLogin() {
        activity.runOnUiThread { activity.openLogin() }
    }

    @JavascriptInterface
    fun clearLogin() {
        activity.runOnUiThread {
            CookieManager.getInstance().removeAllCookies(null)
            CookieManager.getInstance().flush()
        }
    }

    @JavascriptInterface
    fun trackJob(jobId: String) {
        activity.runOnUiThread { activity.startDownloadTracking(jobId) }
    }

    /** Copies the finished ZIP into Downloads/Reelkeep, then answers the JS promise. */
    @JavascriptInterface
    fun publishZip(callbackId: String, jobId: String, path: String, filename: String) {
        thread(name = "reelkeep-publish") {
            val json = runCatching {
                ZipPublisher.publish(activity.applicationContext, jobId, path, filename).toJson()
            }.getOrElse { e ->
                JSONObject().put("ok", false).put("error", e.message ?: "Couldn't save the ZIP.")
            }
            activity.runOnUiThread {
                if (activity.isDestroyed) return@runOnUiThread
                webView.evaluateJavascript(
                    "window.__reelkeepResolve && window.__reelkeepResolve(${JSONObject.quote(callbackId)}, $json)",
                    null,
                )
            }
        }
    }

    @JavascriptInterface
    fun openZip(uri: String) {
        activity.runOnUiThread { ZipPublisher.open(activity, uri) }
    }

    @JavascriptInterface
    fun shareZip(uri: String) {
        activity.runOnUiThread { ZipPublisher.share(activity, uri) }
    }
}