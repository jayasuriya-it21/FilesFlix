package dev.anilbeesetti.nextplayer.feature.network.fileflix

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class FileFlixConfigResponse(val hasMedia: Boolean = false, val rootName: String = "")

@Serializable
data class FileFlixBreadcrumb(val name: String, val rel: String)

@Serializable
data class FileFlixEntry(
    val name: String,
    val dir: Boolean,
    val rel: String,
    val cat: String = "",
    val size: Long = 0,
    val mtimeMs: Long = 0,
    val sourceFormats: List<String> = emptyList(),
) {
    val isDirectory: Boolean get() = dir
    val isVideo: Boolean get() = !dir && cat.startsWith("video")
    val isAudio: Boolean get() = !dir && cat.startsWith("audio")
    val isPlayable: Boolean get() = isVideo || isAudio
}

@Serializable
data class FileFlixBrowseResponse(
    val dir: String = "",
    val breadcrumbs: List<FileFlixBreadcrumb> = emptyList(),
    val entries: List<FileFlixEntry> = emptyList(),
)

@Serializable
data class FileFlixSearchResponse(
    val dir: String = "",
    val results: List<FileFlixEntry> = emptyList(),
)

@Serializable
data class FileFlixSubtitleTrack(
    val index: Int = 0,
    val language: String? = null,
    val title: String? = null,
    val codec: String? = null,
)

@Serializable
data class FileFlixMetaResponse(
    val available: Boolean = false,
    val duration: Double? = null,
    val subtitles: List<FileFlixSubtitleTrack> = emptyList(),
    val sourceFormats: List<String> = emptyList(),
)

@Serializable
data class FileFlixPosterResponse(val matched: Boolean = false, val posterUrl: String? = null)
