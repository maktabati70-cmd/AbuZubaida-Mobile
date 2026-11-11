package com.abuzubaida.mobile

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.Charset
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.zip.GZIPInputStream

/**
 * مركز أبو زبيدة للتتبع والرصد — نسخة الجوال.
 * الواجهة والتحليل في assets (HTML/JS)، وهذا الملف يوفّر لها الاتصال بالمصادر دون قيود المتصفح.
 * تطوير أبو عبدالله الشامي
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private val pool: ExecutorService = Executors.newFixedThreadPool(8)
    private val main = Handler(Looper.getMainLooper())

    companion object {
        private const val UA = "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
        private const val MAX_BYTES = 3_000_000
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        web.setBackgroundColor(0xFF050A12.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            textZoom = 100
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.scheme == "file") return false
                openExternal(u.toString())
                return true
            }
        }
        web.webChromeClient = WebChromeClient()
        web.addJavascriptInterface(Bridge(), "Android")
        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl("file:///android_asset/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(window.onBack&&window.onBack())?'1':'0'") { r ->
                    if (r == null || !r.contains("1")) finish()
                }
            }
        })
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        pool.shutdownNow()
        super.onDestroy()
    }

    private fun openExternal(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: Exception) {
        }
    }

    private fun deliver(id: String, ok: Boolean, status: Int, body: String) {
        val js = "window.__net&&window.__net(" + JSONObject.quote(id) + "," + ok + "," + status + "," +
                JSONObject.quote(body) + ")"
        main.post { web.evaluateJavascript(js, null) }
    }

    private fun readCapped(input: InputStream): ByteArray {
        val out = ByteArrayOutputStream()
        val buf = ByteArray(16384)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            if (out.size() > MAX_BYTES) break
        }
        return out.toByteArray()
    }

    /** يحدد ترميز النص: من رأس الاستجابة، أو من تعريف XML/HTML، وإلا UTF-8 */
    private fun decode(bytes: ByteArray, contentType: String): String {
        var cs: String? = Regex("charset=([\\w\\-]+)", RegexOption.IGNORE_CASE).find(contentType)?.groupValues?.get(1)
        if (cs == null) {
            val head = String(bytes, 0, minOf(bytes.size, 1024), Charsets.ISO_8859_1)
            cs = Regex("encoding=[\"']([\\w\\-]+)[\"']", RegexOption.IGNORE_CASE).find(head)?.groupValues?.get(1)
                ?: Regex("charset=[\"']?([\\w\\-]+)", RegexOption.IGNORE_CASE).find(head)?.groupValues?.get(1)
        }
        val charset = try {
            if (cs != null) Charset.forName(cs) else Charsets.UTF_8
        } catch (e: Exception) {
            Charsets.UTF_8
        }
        return String(bytes, charset)
    }

    private fun request(start: String, method: String, body: String?): Pair<Int, String> {
        var url = start
        var redirects = 0
        while (true) {
            val c = URL(url).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 15000
            c.readTimeout = 25000
            c.requestMethod = method
            c.setRequestProperty("User-Agent", UA)
            c.setRequestProperty("Accept", "*/*")
            c.setRequestProperty("Accept-Language", "ar,en;q=0.8")
            c.setRequestProperty("Accept-Encoding", "gzip")
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
                c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = c.responseCode
            if (code in 300..399 && redirects < 6) {
                val loc = c.getHeaderField("Location")
                c.disconnect()
                if (loc == null) return Pair(code, "")
                url = URL(URL(url), loc).toString()
                redirects++
                continue
            }
            val stream = (if (code >= 400) c.errorStream else c.inputStream) ?: return Pair(code, "")
            val input = if ("gzip".equals(c.contentEncoding, ignoreCase = true)) GZIPInputStream(stream) else stream
            val bytes = input.use { readCapped(it) }
            val ct = c.contentType ?: ""
            c.disconnect()
            return Pair(code, decode(bytes, ct))
        }
    }

    inner class Bridge {
        /** يجلب رابطاً في الخلفية ويعيد النتيجة إلى الواجهة عبر window.__net */
        @JavascriptInterface
        fun fetch(id: String, url: String, method: String, body: String) {
            pool.execute {
                try {
                    val r = request(url, if (method.isEmpty()) "GET" else method, if (body.isEmpty()) null else body)
                    deliver(id, r.first in 200..299, r.first, r.second)
                } catch (e: Exception) {
                    deliver(id, false, 0, e.toString())
                }
            }
        }

        @JavascriptInterface
        fun open(url: String) {
            main.post { openExternal(url) }
        }

        @JavascriptInterface
        fun share(text: String) {
            main.post {
                try {
                    val i = Intent(Intent.ACTION_SEND)
                    i.type = "text/plain"
                    i.putExtra(Intent.EXTRA_TEXT, text)
                    startActivity(Intent.createChooser(i, "مشاركة"))
                } catch (e: Exception) {
                }
            }
        }

        @JavascriptInterface
        fun version(): String {
            return try {
                @Suppress("DEPRECATION")
                packageManager.getPackageInfo(packageName, 0).versionName ?: ""
            } catch (e: Exception) {
                ""
            }
        }
    }
}
