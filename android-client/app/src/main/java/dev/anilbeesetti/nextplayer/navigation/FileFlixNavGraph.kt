package dev.anilbeesetti.nextplayer.navigation

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.navigation3.runtime.EntryProviderScope
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import dev.anilbeesetti.nextplayer.feature.network.navigation.fileFlixBrowseEntry
import dev.anilbeesetti.nextplayer.feature.network.navigation.navigateToFileFlixBrowse
import dev.anilbeesetti.nextplayer.feature.player.PlayerActivity
import dev.anilbeesetti.nextplayer.feature.player.utils.PlayerApi

fun EntryProviderScope<NavKey>.fileFlixNavGraph(
    context: Context,
    backStack: NavBackStack<NavKey>,
) {
    fileFlixBrowseEntry(
        onNavigateUp = { backStack.removeLastIfNotRoot() },
        onNavigateToFolder = { dir -> backStack.navigateToFileFlixBrowse(dir = dir) },
        onPlayMedia = { streamUri, playlistUris, playlistNames, title, isAudio, subUris, subNames ->
            context.startFileFlixPlayback(
                streamUri = streamUri,
                playlistUris = playlistUris,
                playlistNames = playlistNames,
                title = title,
                isAudio = isAudio,
                subUris = subUris,
                subNames = subNames,
            )
        },
    )
}

internal fun Context.startFileFlixPlayback(
    streamUri: Uri,
    playlistUris: List<Uri>,
    playlistNames: List<String>,
    title: String,
    isAudio: Boolean,
    subUris: List<Uri>,
    subNames: List<String>,
) {
    val intent = Intent(
        this,
        PlayerActivity::class.java,
    ).apply {
        action = Intent.ACTION_VIEW
        setDataAndType(
            streamUri,
            if (isAudio) "audio/*" else "video/*",
        )
        putExtra(
            "title",
            title,
        )
        putExtra(
            PlayerApi.API_TITLE,
            title,
        )
        if (playlistUris.isNotEmpty()) {
            putExtra(
                "video_list_is_explicit",
                false,
            )
            putParcelableArrayListExtra(
                PlayerApi.API_PLAYLIST,
                ArrayList(playlistUris),
            )
            if (playlistNames.isNotEmpty()) {
                putExtra(
                    "video_list.name",
                    playlistNames.toTypedArray(),
                )
            }
        }
        if (subUris.isNotEmpty()) {
            putExtra(
                PlayerApi.API_SUBS,
                subUris.toTypedArray(),
            )
            if (subNames.isNotEmpty()) {
                putExtra(
                    PlayerApi.API_SUBS_NAME,
                    subNames.toTypedArray(),
                )
            }
        }
    }
    startActivity(intent)
}
