package dev.anilbeesetti.nextplayer.feature.network.fileflix

import dev.anilbeesetti.nextplayer.core.data.repository.PreferencesRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import org.koin.core.annotation.Single

@Single
class FileFlixRepository(
    private val preferencesRepository: PreferencesRepository,
    val client: FileFlixClient = FileFlixClient(),
) {
    val serverUrl: Flow<String> = preferencesRepository.applicationPreferences.map {
        it.fileflixServerUrl
    }

    suspend fun getServerUrl(): String =
        preferencesRepository.applicationPreferences.first().fileflixServerUrl

    suspend fun setServerUrl(url: String) {
        val normalized = FileFlixClient.normalizeUrl(url)
        preferencesRepository.updateApplicationPreferences {
            it.copy(fileflixServerUrl = normalized)
        }
    }

    suspend fun clearServerUrl() {
        preferencesRepository.updateApplicationPreferences {
            it.copy(fileflixServerUrl = "")
        }
    }

    suspend fun validateAndSave(url: String): Result<FileFlixConfigResponse> {
        val normalized = FileFlixClient.normalizeUrl(url)
        if (!FileFlixClient.isValidUrl(normalized)) {
            return Result.failure(
                IllegalArgumentException("Please enter a valid HTTP or HTTPS address"),
            )
        }
        val result = client.validateServer(normalized)
        if (result.isSuccess) {
            setServerUrl(normalized)
        }
        return result
    }

    suspend fun browse(dir: String = ""): Result<FileFlixBrowseResponse> {
        val url = getServerUrl()
        if (url.isBlank()) {
            return Result.failure(IllegalStateException("No FileFlix server configured"))
        }
        return client.browse(
            url,
            dir,
        )
    }

    suspend fun search(query: String): Result<FileFlixSearchResponse> {
        val url = getServerUrl()
        if (url.isBlank()) {
            return Result.failure(IllegalStateException("No FileFlix server configured"))
        }
        return client.search(
            url,
            query,
        )
    }

    suspend fun getMeta(path: String): Result<FileFlixMetaResponse> {
        val url = getServerUrl()
        if (url.isBlank()) {
            return Result.failure(IllegalStateException("No FileFlix server configured"))
        }
        return client.getMeta(
            url,
            path,
        )
    }
}
