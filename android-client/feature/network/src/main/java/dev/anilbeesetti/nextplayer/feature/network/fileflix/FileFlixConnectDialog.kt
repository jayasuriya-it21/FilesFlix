package dev.anilbeesetti.nextplayer.feature.network.fileflix

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import dev.anilbeesetti.nextplayer.core.ui.R
import dev.anilbeesetti.nextplayer.core.ui.components.NextDialog
import dev.anilbeesetti.nextplayer.core.ui.components.NextOutlinedTextField
import dev.anilbeesetti.nextplayer.core.ui.components.tvFocusRing

@Composable
fun FileFlixConnectDialog(
    initialUrl: String = "",
    isConnecting: Boolean = false,
    errorMessage: String? = null,
    onDismissRequest: () -> Unit,
    onConnect: (String) -> Unit,
) {
    var urlText by remember(initialUrl) {
        mutableStateOf(if (initialUrl.isNotBlank()) initialUrl else "http://192.168.1.")
    }

    NextDialog(
        onDismissRequest = {
            if (!isConnecting) onDismissRequest()
        },
        title = {
            Text(text = stringResource(R.string.fileflix_server))
        },
        content = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = stringResource(R.string.fileflix_desc),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(12.dp))
                NextOutlinedTextField(
                    value = urlText,
                    onValueChange = { urlText = it },
                    label = { Text(text = stringResource(R.string.fileflix_server_url)) },
                    placeholder = {
                        Text(text = stringResource(R.string.fileflix_server_url_hint))
                    },
                    singleLine = true,
                    isError = errorMessage != null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .tvFocusRing(),
                )
                if (errorMessage != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = errorMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConnect(urlText) },
                enabled = !isConnecting && urlText.isNotBlank(),
                modifier = Modifier.tvFocusRing(),
            ) {
                if (isConnecting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text(text = stringResource(R.string.connect))
                }
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismissRequest,
                enabled = !isConnecting,
                modifier = Modifier.tvFocusRing(),
            ) {
                Text(text = stringResource(R.string.cancel))
            }
        },
    )
}
