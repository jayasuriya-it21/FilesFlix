package dev.anilbeesetti.nextplayer.feature.network.fileflix

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import dev.anilbeesetti.nextplayer.core.common.Utils
import dev.anilbeesetti.nextplayer.core.common.extensions.isTelevision
import dev.anilbeesetti.nextplayer.core.ui.R
import dev.anilbeesetti.nextplayer.core.ui.components.LocalNavigationBottomPadding
import dev.anilbeesetti.nextplayer.core.ui.components.NextOutlinedTextField
import dev.anilbeesetti.nextplayer.core.ui.components.NextSegmentedListItem
import dev.anilbeesetti.nextplayer.core.ui.components.NextTopAppBar
import dev.anilbeesetti.nextplayer.core.ui.components.tvFocusRing
import dev.anilbeesetti.nextplayer.core.ui.components.tvListFocus
import dev.anilbeesetti.nextplayer.core.ui.designsystem.NextIcons
import dev.anilbeesetti.nextplayer.core.ui.extensions.copy

@Composable
fun FileFlixBrowseScreen(viewModel: FileFlixBrowseViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    FileFlixBrowseScreenContent(
        state = state,
        onAction = viewModel::onAction,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FileFlixBrowseScreenContent(
    state: FileFlixBrowseUiState,
    onAction: (FileFlixBrowseAction) -> Unit,
) {
    val context = LocalContext.current
    val isTv = remember { context.isTelevision }
    val navigationBottomPadding = LocalNavigationBottomPadding.current

    val title = when {
        state.isSearching -> stringResource(R.string.search)
        state.breadcrumbs.isNotEmpty() -> state.breadcrumbs.last().name
        else -> stringResource(R.string.fileflix)
    }

    val displayEntries = if (state.isSearching) state.searchResults else state.entries

    Scaffold(
        topBar = {
            NextTopAppBar(
                title = title,
                navigationIcon = {
                    if (state.currentDir.isNotEmpty() || state.isSearching) {
                        FilledTonalIconButton(
                            onClick = {
                                if (state.isSearching) {
                                    onAction(FileFlixBrowseAction.ToggleSearch(false))
                                } else {
                                    onAction(FileFlixBrowseAction.NavigateUp)
                                }
                            },
                            modifier = Modifier.tvFocusRing(),
                        ) {
                            Icon(
                                imageVector = NextIcons.ArrowBack,
                                contentDescription = stringResource(R.string.navigate_up),
                            )
                        }
                    }
                },
                actions = {
                    if (state.isConfigured && !state.isSearching) {
                        FilledTonalIconButton(
                            onClick = { onAction(FileFlixBrowseAction.ToggleSearch(true)) },
                            modifier = Modifier.tvFocusRing(),
                        ) {
                            Icon(
                                imageVector = NextIcons.Search,
                                contentDescription = stringResource(R.string.search),
                            )
                        }
                    }

                    if (displayEntries.any { it.isPlayable }) {
                        FilledTonalIconButton(
                            onClick = { onAction(FileFlixBrowseAction.PlayAll) },
                            modifier = Modifier.tvFocusRing(),
                        ) {
                            Icon(
                                imageVector = NextIcons.Play,
                                contentDescription = stringResource(R.string.play_all),
                            )
                        }
                    }

                    FilledTonalIconButton(
                        onClick = { onAction(FileFlixBrowseAction.ShowConnectDialog(true)) },
                        modifier = Modifier.tvFocusRing(),
                    ) {
                        Icon(
                            imageVector = NextIcons.Dns,
                            contentDescription = stringResource(R.string.fileflix_change_server),
                        )
                    }
                },
            )
        },
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) { scaffoldPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(scaffoldPadding.copy(bottom = 0.dp)),
        ) {
            // Search Input Row
            if (state.isSearching) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            horizontal = 16.dp,
                            vertical = 8.dp,
                        ),
                ) {
                    NextOutlinedTextField(
                        value = state.searchQuery,
                        onValueChange = { onAction(FileFlixBrowseAction.Search(it)) },
                        placeholder = {
                            Text(text = stringResource(R.string.fileflix_search_hint))
                        },
                        trailingIcon = {
                            if (state.searchQuery.isNotEmpty()) {
                                IconButton(
                                    onClick = { onAction(FileFlixBrowseAction.Search("")) },
                                    modifier = Modifier.tvFocusRing(),
                                ) {
                                    Icon(
                                        NextIcons.Close,
                                        contentDescription = stringResource(R.string.close),
                                    )
                                }
                            }
                        },
                        singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .tvFocusRing(),
                    )
                }
            }

            // Breadcrumbs Row
            if (!state.isSearching && state.breadcrumbs.size > 1) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(
                            horizontal = 16.dp,
                            vertical = 4.dp,
                        ),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    state.breadcrumbs.forEachIndexed { index, crumb ->
                        val isLast = index == state.breadcrumbs.lastIndex
                        SuggestionChip(
                            onClick = {
                                if (!isLast) {
                                    onAction(FileFlixBrowseAction.OpenFolder(crumb.rel))
                                }
                            },
                            label = { Text(text = crumb.name) },
                            enabled = !isLast,
                            modifier = Modifier.tvFocusRing(),
                        )
                    }
                }
            }

            // Main Content Area
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(
                        RoundedCornerShape(
                            topStart = 24.dp,
                            topEnd = 24.dp,
                        ),
                    )
                    .background(MaterialTheme.colorScheme.background),
            ) {
                when {
                    !state.isConfigured -> {
                        NotConfiguredContent(
                            onConnectClick = {
                                onAction(FileFlixBrowseAction.ShowConnectDialog(true))
                            },
                        )
                    }

                    state.isLoading && displayEntries.isEmpty() -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator()
                        }
                    }

                    state.error != null && displayEntries.isEmpty() -> {
                        ErrorContent(
                            errorMessage = state.error,
                            onRetry = { onAction(FileFlixBrowseAction.Retry) },
                            onChangeServer = {
                                onAction(FileFlixBrowseAction.ShowConnectDialog(true))
                            },
                        )
                    }

                    displayEntries.isEmpty() -> {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(32.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = if (state.isSearching) {
                                    stringResource(R.string.no_results_found)
                                } else {
                                    stringResource(R.string.fileflix_no_media)
                                },
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    else -> {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxSize()
                                .tvListFocus(),
                            contentPadding = PaddingValues(8.dp).copy(
                                bottom =
                                    scaffoldPadding.calculateBottomPadding() +
                                        navigationBottomPadding,
                            ),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            itemsIndexed(
                                items = displayEntries,
                                key = { _, item -> item.rel },
                            ) { index, entry ->
                                FileFlixEntryRow(
                                    entry = entry,
                                    serverUrl = state.serverUrl,
                                    isFirstItem = index == 0,
                                    isLastItem = index == displayEntries.lastIndex,
                                    onClick = {
                                        if (entry.isDirectory) {
                                            onAction(FileFlixBrowseAction.OpenFolder(entry.rel))
                                        } else if (entry.isPlayable) {
                                            onAction(FileFlixBrowseAction.PlayMedia(entry))
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (state.showConnectDialog) {
        FileFlixConnectDialog(
            initialUrl = state.serverUrl,
            isConnecting = state.isConnecting,
            errorMessage = state.connectError,
            onDismissRequest = { onAction(FileFlixBrowseAction.ShowConnectDialog(false)) },
            onConnect = { url -> onAction(FileFlixBrowseAction.ConnectServer(url)) },
        )
    }
}

@Composable
private fun NotConfiguredContent(onConnectClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(
                imageVector = NextIcons.Dns,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.fileflix_server),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.fileflix_desc),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = onConnectClick,
                modifier = Modifier.tvFocusRing(),
            ) {
                Text(text = stringResource(R.string.fileflix_connect))
            }
        }
    }
}

@Composable
private fun ErrorContent(errorMessage: String, onRetry: () -> Unit, onChangeServer: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(
                imageVector = NextIcons.Priority,
                contentDescription = null,
                modifier = Modifier.size(56.dp),
                tint = MaterialTheme.colorScheme.error,
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.fileflix_connection_failed),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.error,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = errorMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = onRetry,
                    modifier = Modifier.tvFocusRing(),
                ) {
                    Text(text = stringResource(R.string.retry))
                }
                OutlinedButton(
                    onClick = onChangeServer,
                    modifier = Modifier.tvFocusRing(),
                ) {
                    Text(text = stringResource(R.string.fileflix_change_server))
                }
            }
        }
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun FileFlixEntryRow(
    entry: FileFlixEntry,
    serverUrl: String,
    isFirstItem: Boolean,
    isLastItem: Boolean,
    onClick: () -> Unit,
) {
    NextSegmentedListItem(
        onClick = onClick,
        isFirstItem = isFirstItem,
        isLastItem = isLastItem,
        modifier = Modifier.tvFocusRing(),
        leadingContent = {
            if (entry.isDirectory) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.secondaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = NextIcons.Folder,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSecondaryContainer,
                    )
                }
            } else if (entry.isVideo) {
                val thumbUrl = "$serverUrl/api/thumb?path=${android.net.Uri.encode(
                    entry.rel,
                )}&mt=${entry.mtimeMs}"
                Box(
                    modifier = Modifier
                        .size(
                            width = 64.dp,
                            height = 44.dp,
                        )
                        .clip(RoundedCornerShape(6.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(thumbUrl)
                            .build(),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                    Icon(
                        imageVector = NextIcons.Play,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier.size(20.dp),
                    )
                }
            } else {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.tertiaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = NextIcons.Audio,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onTertiaryContainer,
                    )
                }
            }
        },
        content = {
            Text(
                text = entry.name,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
            )
        },
        supportingContent = {
            if (entry.isDirectory) {
                Text(
                    text = stringResource(R.string.folder),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                val catText = when {
                    entry.isVideo -> stringResource(R.string.video)
                    entry.isAudio -> stringResource(R.string.audio)
                    else -> entry.cat
                }
                val sizeText = if (entry.size > 0) Utils.formatFileSize(entry.size) else ""
                val formatText = entry.sourceFormats.joinToString(" • ")
                val details = listOf(
                    catText,
                    sizeText,
                    formatText,
                ).filter { it.isNotBlank() }
                Text(
                    text = details.joinToString(" • "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        trailingContent = {
            if (entry.isDirectory) {
                Icon(
                    imageVector = NextIcons.ArrowForward,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            } else if (entry.isPlayable) {
                Icon(
                    imageVector = NextIcons.Player,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp),
                )
            }
        },
    )
}
