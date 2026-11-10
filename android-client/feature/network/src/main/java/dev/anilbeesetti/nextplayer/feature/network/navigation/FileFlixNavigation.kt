package dev.anilbeesetti.nextplayer.feature.network.navigation

import android.net.Uri
import androidx.compose.runtime.SideEffect
import androidx.navigation3.runtime.EntryProviderScope
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import dev.anilbeesetti.nextplayer.feature.network.LocalNetworkPermission
import dev.anilbeesetti.nextplayer.feature.network.fileflix.FileFlixBrowseScreen
import dev.anilbeesetti.nextplayer.feature.network.fileflix.FileFlixBrowseViewModel
import kotlinx.serialization.Serializable
import org.koin.compose.viewmodel.koinViewModel
import org.koin.core.parameter.parametersOf

@Serializable
data class FileFlixBrowseRoute(val dir: String? = null) : NavKey

fun NavBackStack<NavKey>.navigateToFileFlixBrowse(dir: String? = null) {
    add(element = FileFlixBrowseRoute(dir = dir))
}

fun EntryProviderScope<NavKey>.fileFlixBrowseEntry(
    onNavigateUp: () -> Unit,
    onNavigateToFolder: (dir: String) -> Unit,
    onPlayMedia: (
        streamUri: Uri,
        playlistUris: List<Uri>,
        playlistNames: List<String>,
        title: String,
        isAudio: Boolean,
        subUris: List<Uri>,
        subNames: List<String>,
    ) -> Unit,
) {
    entry<FileFlixBrowseRoute> { key ->
        LocalNetworkPermission {
            val output = FileFlixBrowseViewModel.Output(
                navigateUp = onNavigateUp,
                openFolder = onNavigateToFolder,
                playMedia = onPlayMedia,
            )
            val viewModel = koinViewModel<FileFlixBrowseViewModel>(
                parameters = {
                    parametersOf(
                        FileFlixBrowseViewModel.Input(dir = key.dir),
                        output,
                    )
                },
            )
            SideEffect { viewModel.output = output }
            FileFlixBrowseScreen(viewModel = viewModel)
        }
    }
}
