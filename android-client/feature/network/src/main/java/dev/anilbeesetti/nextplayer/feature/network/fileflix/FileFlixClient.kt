package dev.anilbeesetti.nextplayer.feature.network.fileflix

import java.io.IOException
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import org.koin.core.annotation.Single

@Single
class FileFlixClient(
    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(
            10,
            TimeUnit.SECONDS,
        )
        .readTimeout(
            15,
            TimeUnit.SECONDS,
        )
        .build(),
) {
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    companion object {
        fun urlEncode(value: String): String = URLEncoder.encode(
            value,
            StandardCharsets.UTF_8.name(),
        ).replace(
            "+",
            "%20",
        )

        fun normalizeUrl(raw: String): String {
            var url = raw.trim()
            if (url.isEmpty()) return ""
            if (!url.startsWith(
                    "http://",
                    ignoreCase = true,
                ) &&
                !url.startsWith(
                    "https://",
                    ignoreCase = true,
                )
            ) {
                url = "http://$url"
            }
            return url.trimEnd('/')
        }

        fun isValidUrl(raw: String): Boolean {
            val normalized = normalizeUrl(raw)
            return try {
                val uri = URI(normalized)
                (
                    uri.scheme.equals(
                        "http",
                        ignoreCase = true,
                    ) ||
                        uri.scheme.equals(
                            "https",
                            ignoreCase = true,
                        )
                    ) &&
                    !uri.host.isNullOrBlank()
            } catch (_: Exception) {
                false
            }
        }
    }

    suspend fun validateServer(baseUrl: String): Result<FileFlixConfigResponse> =
        withContext(Dispatchers.IO) {
            val root = normalizeUrl(baseUrl)
            if (!isValidUrl(root)) {
                return@withContext Result.failure(IllegalArgumentException("Invalid URL format"))
            }
            val request = Request.Builder()
                .url("$root/api/config")
                .get()
                .build()
            try {
                okHttpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        return@withContext Result.failure(
                            IOException("Server returned HTTP ${response.code}"),
                        )
                    }
                    val body = response.body?.string().orEmpty()
                    val config = json.decodeFromString<FileFlixConfigResponse>(body)
                    Result.success(config)
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    suspend fun browse(baseUrl: String, dir: String = ""): Result<FileFlixBrowseResponse> =
        withContext(Dispatchers.IO) {
            val root = normalizeUrl(baseUrl)
            val encodedDir = urlEncode(dir)
            val url = if (dir.isEmpty()) "$root/api/browse" else "$root/api/browse?dir=$encodedDir"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()
            try {
                okHttpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        return@withContext Result.failure(
                            IOException("HTTP ${response.code} loading folder"),
                        )
                    }
                    val body = response.body?.string().orEmpty()
                    val browseResp = json.decodeFromString<FileFlixBrowseResponse>(body)
                    Result.success(browseResp)
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    suspend fun search(baseUrl: String, query: String): Result<FileFlixSearchResponse> =
        withContext(Dispatchers.IO) {
            val root = normalizeUrl(baseUrl)
            val encodedQ = urlEncode(query.trim())
            val url = "$root/api/search?q=$encodedQ"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()
            try {
                okHttpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        return@withContext Result.failure(
                            IOException("HTTP ${response.code} searching"),
                        )
                    }
                    val body = response.body?.string().orEmpty()
                    val searchResp = json.decodeFromString<FileFlixSearchResponse>(body)
                    Result.success(searchResp)
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    suspend fun getMeta(baseUrl: String, path: String): Result<FileFlixMetaResponse> =
        withContext(Dispatchers.IO) {
            val root = normalizeUrl(baseUrl)
            val encodedPath = urlEncode(path)
            val url = "$root/api/meta?path=$encodedPath"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()
            try {
                okHttpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        return@withContext Result.failure(
                            IOException("HTTP ${response.code} getting metadata"),
                        )
                    }
                    val body = response.body?.string().orEmpty()
                    val metaResp = json.decodeFromString<FileFlixMetaResponse>(body)
                    Result.success(metaResp)
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    suspend fun getPoster(baseUrl: String, name: String): Result<FileFlixPosterResponse> =
        withContext(Dispatchers.IO) {
            val root = normalizeUrl(baseUrl)
            val encodedName = urlEncode(name)
            val url = "$root/api/poster?name=$encodedName"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()
            try {
                okHttpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        return@withContext Result.failure(
                            IOException("HTTP ${response.code} getting poster"),
                        )
                    }
                    val body = response.body?.string().orEmpty()
                    val posterResp = json.decodeFromString<FileFlixPosterResponse>(body)
                    Result.success(posterResp)
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    fun buildStreamUrl(baseUrl: String, rel: String): String {
        val root = normalizeUrl(baseUrl)
        return "$root/api/stream?path=${urlEncode(rel)}"
    }

    fun buildThumbUrl(baseUrl: String, rel: String, mtimeMs: Long? = null): String {
        val root = normalizeUrl(baseUrl)
        val mtParam = if (mtimeMs != null && mtimeMs > 0) "&mt=$mtimeMs" else ""
        return "$root/api/thumb?path=${urlEncode(rel)}$mtParam"
    }

    fun buildSubtitleUrl(
        baseUrl: String,
        rel: String,
        index: Int? = null,
        srtRel: String? = null,
    ): String {
        val root = normalizeUrl(baseUrl)
        return if (!srtRel.isNullOrBlank()) {
            "$root/api/subtitle?srt=${urlEncode(srtRel)}"
        } else {
            "$root/api/subtitle?path=${urlEncode(rel)}&idx=${index ?: 0}"
        }
    }
}
