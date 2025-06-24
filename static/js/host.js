document.addEventListener('DOMContentLoaded', () => {
    const mediaPathInput = document.getElementById('media-path-input');
    const selectDirBtn = document.getElementById('select-dir-btn');
    const setDirBtn = document.getElementById('set-dir-btn');
    const scanMediaBtn = document.getElementById('scan-media-btn');
    const refreshStatusBtn = document.getElementById('refresh-status-btn');
    const directoryPicker = document.getElementById('directory-picker');
    const serverStatus = document.getElementById('server-status');
    const ffmpegStatus = document.getElementById('ffmpeg-status');
    const cpuUsage = document.getElementById('cpu-usage');
    const memoryUsage = document.getElementById('memory-usage');
    const currentDir = document.getElementById('current-dir');
    const serverUrl = document.getElementById('server-url');
    const localIp = document.getElementById('local-ip');

    // Initialize button states
    setDirBtn.disabled = !mediaPathInput.value.trim();

    // Update system status on load
    updateSystemStatus();

    // Event Listeners
    mediaPathInput.addEventListener('input', () => {
        setDirBtn.disabled = !mediaPathInput.value.trim();
    });

    // Handle directory picker file input change
    if (directoryPicker) {
        directoryPicker.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                // Get the directory path from the first file
                const firstFile = files[0];
                let dirPath = '';
                
                if (firstFile.webkitRelativePath) {
                    // Extract directory name from webkitRelativePath
                    const pathParts = firstFile.webkitRelativePath.split('/');
                    dirPath = pathParts[0];
                    
                    // Ask user for full path
                    const fullPath = prompt(
                        `Selected folder: "${dirPath}"\n\nPlease enter the full path to this directory:`,
                        dirPath
                    );
                    
                    if (fullPath && fullPath.trim()) {
                        mediaPathInput.value = fullPath.trim();
                        setDirBtn.disabled = false;
                        showToast('Directory path entered. Click "Set Directory" to confirm.', 'info');
                    }
                } else {
                    showToast('Could not determine directory path. Please enter manually.', 'warning');
                }
            }
        });
    }

    selectDirBtn.addEventListener('click', async () => {
        try {
            // Try modern File System Access API first
            if ('showDirectoryPicker' in window) {
                try {
                    const dirHandle = await window.showDirectoryPicker();
                    const dirName = dirHandle.name;
                    
                    // Ask user for the full path since we can't get it from the API
                    const fullPath = prompt(
                        `Selected folder: "${dirName}"\n\nPlease enter the full path to this directory:`, 
                        `${dirName}`
                    );
                    
                    if (fullPath && fullPath.trim()) {
                        mediaPathInput.value = fullPath.trim();
                        setDirBtn.disabled = false;
                        showToast('Directory path entered. Click "Set Directory" to confirm.', 'info');
                        return;
                    }
                } catch (e) {
                    if (e.name !== 'AbortError') {
                        console.warn('Directory picker failed:', e);
                    }
                }
            }
            
            // Fallback: Try directory picker input (webkit)
            if (directoryPicker) {
                try {
                    directoryPicker.click();
                    return; // The change event will handle the rest
                } catch (e) {
                    console.warn('Directory picker input failed:', e);
                }
            }
            
            // Final fallback: Show directory suggestions and manual entry
            try {
                const response = await apiRequest('/api/select-directory', 'GET');
                if (response.success && response.suggestions) {
                    let suggestionsText = 'Suggested directories:\n';
                    response.suggestions.forEach((suggestion, index) => {
                        suggestionsText += `${index + 1}. ${suggestion.path}\n`;
                    });
                    suggestionsText += '\nEnter the full path to your media directory:';
                    
                    const manualPath = prompt(suggestionsText, response.suggestions[0]?.path || '');
                    if (manualPath && manualPath.trim()) {
                        mediaPathInput.value = manualPath.trim();
                        setDirBtn.disabled = false;
                        showToast('Directory path entered. Click "Set Directory" to confirm.', 'info');
                    }
                } else {
                    // Simple manual entry
                    const manualPath = prompt('Enter the full path to your media directory:', '');
                    if (manualPath && manualPath.trim()) {
                        mediaPathInput.value = manualPath.trim();
                        setDirBtn.disabled = false;
                        showToast('Directory path entered. Click "Set Directory" to confirm.', 'info');
                    }
                }
            } catch (apiError) {
                console.warn('API request failed, using simple prompt:', apiError);
                // Final fallback: simple prompt
                const manualPath = prompt('Enter the full path to your media directory:', '');
                if (manualPath && manualPath.trim()) {
                    mediaPathInput.value = manualPath.trim();
                    setDirBtn.disabled = false;
                    showToast('Directory path entered. Click "Set Directory" to confirm.', 'info');
                }
            }
        } catch (error) {
            console.error('Error in directory selection:', error);
            showToast('Error selecting directory. Please enter the path manually.', 'error');
        }
    });

    setDirBtn.addEventListener('click', async () => {
        const path = mediaPathInput.value.trim();
        if (!path) {
            showToast('Please enter a valid directory path', 'error');
            return;
        }
        try {
            setDirBtn.disabled = true;
            setDirBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting...';
            
            const response = await apiRequest('/api/set-directory', 'POST', { directory: path });
            if (response.success) {
                currentDir.textContent = path;
                currentDir.classList.remove('badge-secondary', 'badge-error');
                currentDir.classList.add('badge-success');
                showToast('Directory set successfully', 'success');
                // Update system status to reflect changes
                await updateSystemStatus();
            } else {
                showToast(response.message || 'Failed to set directory', 'error');
            }
        } catch (error) {
            console.error('Error setting directory:', error);
            showToast(error.message || 'Error setting directory', 'error');
        } finally {
            setDirBtn.disabled = false;
            setDirBtn.innerHTML = '<i class="fas fa-check"></i> Set Directory';
        }
    });

    scanMediaBtn.addEventListener('click', async () => {
        scanMediaBtn.disabled = true;
        showToast('Scanning media...', 'info');
        try {
            const response = await apiRequest('/api/scan-media', 'POST');
            if (response.success) {
                showToast('Media scan completed', 'success');
            } else {
                showToast(response.message || 'Failed to scan media', 'error');
            }
        } catch (error) {
            showToast('Error scanning media', 'error');
        } finally {
            scanMediaBtn.disabled = false;
        }
    });

    refreshStatusBtn.addEventListener('click', () => {
        updateSystemStatus();
        showToast('Status refreshed', 'success');
    });

    // Helper Functions
    async function apiRequest(url, method = 'GET', data = null) {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        return await response.json();
    }
    
    function showToast(message, type = 'info', duration = 5000) {
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        
        // Determine icon based on type
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info} toast-icon"></i>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Add to container
        toastContainer.appendChild(toast);
        
        // Show toast with animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Auto-remove after duration
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.remove('show');
                setTimeout(() => {
                    if (toast.parentElement) {
                        toast.remove();
                    }
                }, 300);
            }
        }, duration);
        
        // Add click to close
        toast.addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        });
    }

    async function updateSystemStatus() {
        try {
            const response = await apiRequest('/api/system-status', 'GET');
            if (response.success && response.status) {
                // Server Status
                serverStatus.textContent = response.status.server ? 'Online' : 'Offline';
                serverStatus.classList.replace(
                    response.status.server ? 'badge-warning' : 'badge-success',
                    response.status.server ? 'badge-success' : 'badge-error'
                );

                // FFmpeg Status
                ffmpegStatus.textContent = response.status.ffmpeg ? 'Installed' : 'Not Installed';
                ffmpegStatus.classList.replace(
                    response.status.ffmpeg ? 'badge-warning' : 'badge-success',
                    response.status.ffmpeg ? 'badge-success' : 'badge-error'
                );

                // CPU Usage
                cpuUsage.textContent = response.status.cpu ? `${response.status.cpu}%` : '--';
                cpuUsage.classList.replace('badge-secondary', 'badge-primary');

                // Memory Usage
                memoryUsage.textContent = response.status.memory ? `${response.status.memory}%` : '--';
                memoryUsage.classList.replace('badge-secondary', 'badge-primary');

                // Current Directory
                currentDir.textContent = response.status.directory || 'Not set';
                currentDir.classList.replace(
                    response.status.directory ? 'badge-secondary' : 'badge-success',
                    response.status.directory ? 'badge-success' : 'badge-secondary'
                );

                // Server URL
                serverUrl.textContent = response.status.url || 'http://localhost:5000';
                serverUrl.classList.replace('badge-secondary', 'badge-primary');

                // Local IP
                localIp.textContent = response.status.ip || 'Unknown';
                localIp.classList.replace('badge-warning', response.status.ip ? 'badge-success' : 'badge-error');
            } else {
                showToast(response.message || 'Failed to fetch system status', 'error');
            }
        } catch (error) {
            showToast('Error fetching system status', 'error');
        }
    }
});