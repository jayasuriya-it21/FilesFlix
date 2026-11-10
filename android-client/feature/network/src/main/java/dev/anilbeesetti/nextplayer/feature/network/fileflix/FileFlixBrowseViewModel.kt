package dev.anilbeesetti.nextplayer.feature.network.fileflix

import android.net.Uri
import androidx.lifecycle.viewModelScope
import dev.anilbeesetti.nextplayer.core.ui.base.MviViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.koin.core.annotation.InjectedParam
import org.koin.core.annotation.KoinViewModel

data class FileFlixBrowseUiState(
    val serverUrl: String = "",
    val isConfigured: Boolean = false,
    val currentDir: String = "",
    val breadcrumbs: List<FileFlixBreadcrumb> = emptyList(),
    val entries: List<FileFlixEntry> = emptyList(),
    val isLoading: Boolean = false,
    val isSearching: Boolean = false,
    val searchQuery: String = "",
    val searchResults: List<FileFlixEntry> = emptyList(),
    val error: String? = null,
    val showConnectDialog: Boolean = false,
    val connectError: String? = null,
    val isConnecting: Boolean = false,
)

sealed interface FileFlixBrowseAction {
    data object NavigateUp : FileFlixBrowseAction
    data class OpenFolder(val rel: String) : FileFlixBrowseAction
    data class PlayMedia(val entry: FileFlixEntry) : FileFlixBrowseAction
    data object PlayAll : FileFlixBrowseAction
    data class Search(val query: String) : FileFlixBrowseAction
    data class ToggleSearch(val enabled: Boolean) : FileFlixBrowseAction
    data class ShowConnectDialog(val show: Boolean) : FileFlixBrowseAction
    data class ConnectServer(val url: String) : FileFlixBrowseAction
    data object Disconnect : FileFlixBrowseAction
    data object Retry : FileFlixBrowseAction
}

@KoinViewModel
class FileFlixBrowseViewModel(
    @InjectedParam private val input: Input,
    @InjectedParam internal var output: Output,
    private val repository: FileFlixRepository,
) : MviViewModel<FileFlixBrowseUiState, FileFlixBrowseAction>() {

    data class Input(val dir: String? = null)
    data class Output(
        val navigateUp: () -> Unit,
        val openFolder: (String) -> Unit,
        val playMedia: (
            streamUri: Uri,
            playlistUris: List<Uri>,
            playlistNames: List<String>,
            title: String,
            isAudio: Boolean,
            subUris: List<Uri>,
            subNames: List<String>,
        ) -> Unit,
    )

    private val targetDir = input.dir.orEmpty()
    private val stateInternal = MutableStateFlow(FileFlixBrowseUiState(currentDir = targetDir))
    override val state: StateFlow<FileFlixBrowseUiState> = stateInternal.asStateFlow()

    init {
        viewModelScope.launch {
            repository.serverUrl.collect { url ->
                val configured = url.isNotBlank()
                stateInternal.update {
                    it.copy(
                        serverUrl = url,
                        isConfigured = configured,
                        showConnectDialog = !configured && targetDir.isEmpty(),
                    )
                }
                if (configured) {
                    loadDirectory(targetDir)
                }
            }
        }
    }

    private fun loadDirectory(dir: String) {
        stateInternal.update {
            it.copy(
                isLoading = true,
                error = null,
            )
        }
        viewModelScope.launch {
            repository.browse(dir).fold(
                onSuccess = { resp ->
                    stateInternal.update {
                        it.copy(
                            currentDir = resp.dir,
                            breadcrumbs = resp.breadcrumbs,
                            entries = resp.entries,
                            isLoading = false,
                            error = null,
                        )
                    }
                },
                onFailure = { err ->
                    stateInternal.update {
                        it.copy(
                            isLoading = false,
                            error = err.message ?: "Failed to connect to FileFlix server",
                        )
                    }
                },
            )
        }
    }

    private fun executeSearch(query: String) {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) {
            stateInternal.update {
                it.copy(
                    searchQuery = "",
                    searchResults = emptyList(),
                )
            }
            return
        }
        stateInternal.update {
            it.copy(
                searchQuery = trimmed,
                isLoading = true,
            )
        }
        viewModelScope.launch {
            repository.search(trimmed).fold(
                onSuccess = { resp ->
                    stateInternal.update {
                        it.copy(
                            searchResults = resp.results,
                            isLoading = false,
                            error = null,
                        )
                    }
                },
                onFailure = { err ->
                    stateInternal.update {
                        it.copy(
                            isLoading = false,
                            error = err.message ?: "Search failed",
                        )
                    }
                },
            )
        }
    }

    override fun onAction(action: FileFlixBrowseAction) {
        when (action) {
            is FileFlixBrowseAction.NavigateUp -> output.navigateUp()

            is FileFlixBrowseAction.OpenFolder -> output.openFolder(action.rel)

            is FileFlixBrowseAction.PlayMedia -> playMediaItem(action.entry)

            is FileFlixBrowseAction.PlayAll -> {
                val current = if (state.value.isSearching) {
                    state.value.searchResults
                } else {
                    state.value.entries
                }
                current.firstOrNull { it.isPlayable }?.let { playMediaItem(it) }
            }

            is FileFlixBrowseAction.Search -> executeSearch(action.query)

            is FileFlixBrowseAction.ToggleSearch -> {
                stateInternal.update {
                    it.copy(
                        isSearching = action.enabled,
                        searchQuery = if (!action.enabled) "" else it.searchQuery,
                        searchResults = if (!action.enabled) emptyList() else it.searchResults,
                    )
                }
            }

            is FileFlixBrowseAction.ShowConnectDialog -> {
                stateInternal.update {
                    it.copy(
                        showConnectDialog = action.show,
                        connectError = null,
                    )
                }
            }

            is FileFlixBrowseAction.ConnectServer -> connectToServer(action.url)

            is FileFlixBrowseAction.Disconnect -> {
                viewModelScope.launch {
                    repository.clearServerUrl()
                    stateInternal.update {
                        it.copy(
                            serverUrl = "",
                            isConfigured = false,
                            entries = emptyList(),
                            breadcrumbs = emptyList(),
                            showConnectDialog = true,
                        )
                    }
                }
            }

            is FileFlixBrowseAction.Retry -> {
                if (state.value.isSearching) {
                    executeSearch(state.value.searchQuery)
                } else {
                    loadDirectory(targetDir)
                }
            }
        }
    }

    private fun connectToServer(url: String) {
        stateInternal.update {
            it.copy(
                isConnecting = true,
                connectError = null,
            )
        }
        viewModelScope.launch {
            repository.validateAndSave(url).fold(
                onSuccess = {
                    stateInternal.update {
                        it.copy(
                            isConnecting = false,
                            showConnectDialog = false,
                            connectError = null,
                        )
                    }
                    loadDirectory(targetDir)
                },
                onFailure = { err ->
                    stateInternal.update {
                        it.copy(
                            isConnecting = false,
                            connectError = err.message ?: "Could not connect to FileFlix server",
                        )
                    }
                },
            )
        }
    }

    private fun playMediaItem(entry: FileFlixEntry) {
        val serverUrl = state.value.serverUrl
        if (serverUrl.isBlank()) return
        val currentList = if (state.value.isSearching) {
            state.value.searchResults
        } else {
            state.value.entries
        }
        val playableItems = currentList.filter { it.isPlayable }

        val streamUrl = repository.client.buildStreamUrl(
            serverUrl,
            entry.rel,
        )
        val streamUri = Uri.parse(streamUrl)

        val playlistUris = playableItems.map {
            Uri.parse(
                repository.client.buildStreamUrl(
                    serverUrl,
                    it.rel,
                ),
            )
        }
        val playlistNames = playableItems.map { it.name }

        // Find sibling subtitle file if present (e.g. demo.mp4 with demo.srt)
        val subUris = mutableListOf<Uri>()
        val subNames = mutableListOf<String>()

        val baseName = entry.name.substringBeforeLast('.')
        val siblingSrt = currentList.firstOrNull {
            !it.dir && it.name.startsWith(
                baseName,
                ignoreCase = true,
            ) &&
                (
                    it.name.endsWith(
                        ".srt",
                        ignoreCase = true,
                    ) ||
                        it.name.endsWith(
                            ".vtt",
                            ignoreCase = true,
                        )
                    )
        }

        if (siblingSrt != null) {
            val subUrl = repository.client.buildSubtitleUrl(
                serverUrl,
                entry.rel,
                srtRel = siblingSrt.rel,
            )
            subUris.add(Uri.parse(subUrl))
            subNames.add(siblingSrt.name)
        } else {
            // Also add default embedded track endpoint
            val embeddedSubUrl = repository.client.buildSubtitleUrl(
                serverUrl,
                entry.rel,
                index = 0,
            )
            subUris.add(Uri.parse(embeddedSubUrl))
            subNames.add("Track 1")
        }

        output.playMedia(
            streamUri,
            playlistUris,
            playlistNames,
            entry.name,
            entry.isAudio,
            subUris,
            subNames,
        )
    }
}
