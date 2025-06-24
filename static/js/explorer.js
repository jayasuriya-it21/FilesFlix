document.addEventListener('DOMContentLoaded', () => {
    // File Explorer Enhanced Functionality
    class FileExplorer {
        constructor(fileFlix) {
            this.fileFlix = fileFlix;
            this.dragDropEnabled = fileFlix.isHost; // Only for Hosts
            this.selectionMode = false;
            this.selectedItems = new Set();
            this.isHost = fileFlix.isHost;

            this.init();
        }

        init() {
            this.initDragAndDrop();
            this.initContextMenu();
            this.initKeyboardSelection();
            this.initFilePreview();
            this.initTouchSupport();
        }

        initDragAndDrop() {
            if (!this.dragDropEnabled) return;

            const fileExplorer = document.getElementById('file-explorer');
            if (!fileExplorer) return;

            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                fileExplorer.addEventListener(eventName, this.preventDefaults, false);
                document.body.addEventListener(eventName, this.preventDefaults, false);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                fileExplorer.addEventListener(eventName, this.highlight.bind(this), false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                fileExplorer.addEventListener(eventName, this.unhighlight.bind(this), false);
            });

            fileExplorer.addEventListener('drop', this.handleDrop.bind(this), false);
        }

        preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        highlight(e) {
            const fileExplorer = document.getElementById('file-explorer');
            if (fileExplorer) fileExplorer.classList.add('drag-over');
        }

        unhighlight(e) {
            const fileExplorer = document.getElementById('file-explorer');
            if (fileExplorer) fileExplorer.classList.remove('drag-over');
        }

        async handleDrop(e) {
            if (!this.isHost) return;

            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length === 0) return;

            try {
                const formData = new FormData();
                for (const file of files) {
                    formData.append('files', file, file.webkitRelativePath || file.name);
                }
                formData.append('destination', this.fileFlix.currentPath);

                const response = await this.fileFlix.utils.apiRequest('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                if (response.success) {
                    this.fileFlix.showToast('Files uploaded successfully', 'success');
                    this.fileFlix.refreshFiles();
                } else {
                    this.fileFlix.showToast('Upload failed: ' + (response.error || 'Unknown error'), 'error');
                }
            } catch (error) {
                console.error('Upload failed:', error);
                this.fileFlix.showToast('Error uploading files', 'error');
            }
        }

        initContextMenu() {
            const fileExplorer = document.getElementById('file-explorer');
            if (!fileExplorer) return;

            fileExplorer.addEventListener('contextmenu', this.showContextMenu.bind(this));
            document.addEventListener('click', this.hideContextMenu.bind(this));
            document.addEventListener('contextmenu', (e) => {
                if (!e.target.closest('.file-explorer')) this.hideContextMenu(e);
            });
        }

        showContextMenu(e) {
            e.preventDefault();

            const fileCard = e.target.closest('.file-card, .file-list-item');
            if (!fileCard) {
                this.showFolderContextMenu(e);
                return;
            }

            const path = fileCard.dataset.path;
            const type = fileCard.dataset.type;

            this.createContextMenu(e.clientX, e.clientY, path, type);
        }

        showFolderContextMenu(e) {
            if (!this.isHost) return;

            const menu = document.createElement('div');
            menu.className = 'context-menu';
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;

            const items = [
                {
                    label: 'Refresh',
                    icon: 'fas fa-sync-alt',
                    action: `fileFlix.refreshFiles(); fileExplorer.removeContextMenu();`
                },
                {
                    label: 'New Folder',
                    icon: 'fas fa-folder-plus',
                    action: `fileExplorer.createNewFolder(); fileExplorer.removeContextMenu();`
                },
                {
                    label: 'Paste',
                    icon: 'fas fa-paste',
                    action: `fileExplorer.pasteItems(); fileExplorer.removeContextMenu();`
                }
            ];

            menu.innerHTML = items.map(item => `
                <div class="context-menu-item" onclick="${item.action}">
                    <i class="${item.icon}"></i>
                    <span>${item.label}</span>
                </div>
            `).join('');

            document.body.appendChild(menu);
            this.adjustContextMenuPosition(menu);
        }

        createContextMenu(x, y, path, type) {
            this.removeContextMenu();

            const menu = document.createElement('div');
            menu.className = 'context-menu';
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;

            const menuItems = this.getContextMenuItems(path, type);

            menu.innerHTML = menuItems.map(item => `
                <div class="context-menu-item" onclick="${item.action}">
                    <i class="${item.icon}"></i>
                    <span>${item.label}</span>
                </div>
            `).join('');

            document.body.appendChild(menu);
            this.adjustContextMenuPosition(menu);
        }

        adjustContextMenuPosition(menu) {
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = `${parseInt(menu.style.left) - rect.width}px`;
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = `${parseInt(menu.style.top) - rect.height}px`;
            }
        }

        getContextMenuItems(path, type) {
            const items = [];

            if (type === 'folder') {
                items.push({
                    label: 'Open',
                    icon: 'fas fa-folder-open',
                    action: `fileFlix.navigateToPath('${path}'); fileExplorer.removeContextMenu();`
                });
            } else if (type === 'video') {
                items.push({
                    label: 'Play',
                    icon: 'fas fa-play',
                    action: `fileFlix.playVideo('${path}', '${this.fileFlix.utils.sanitizeHTML(path.split('/').pop())}'); fileExplorer.removeContextMenu();`
                });
            } else if (type === 'image') {
                items.push({
                    label: 'View',
                    icon: 'fas fa-eye',
                    action: `fileFlix.previewFile('${path}', '${type}'); fileExplorer.removeContextMenu();`
                });
            }

            if (type !== 'folder') {
                items.push({
                    label: 'Download',
                    icon: 'fas fa-download',
                    action: `fileFlix.downloadFile('${path}', '${this.fileFlix.utils.sanitizeHTML(path.split('/').pop())}'); fileExplorer.removeContextMenu();`
                });
                items.push({
                    label: 'Copy Link',
                    icon: 'fas fa-link',
                    action: `fileExplorer.copyFileLink('${path}'); fileExplorer.removeContextMenu();`
                });
            }

            items.push({
                label: 'Properties',
                icon: 'fas fa-info-circle',
                action: `fileExplorer.showFileInfo('${path}'); fileExplorer.removeContextMenu();`
            });

            if (this.isHost) {
                items.push({
                    label: 'Delete',
                    icon: 'fas fa-trash',
                    action: `fileExplorer.deleteFile('${path}'); fileExplorer.removeContextMenu();`
                });
                if (type !== 'folder') {
                    items.push({
                        label: 'Copy',
                        icon: 'fas fa-copy',
                        action: `fileExplorer.copyFile('${path}'); fileExplorer.removeContextMenu();`
                    });
                }
            }

            return items;
        }

        hideContextMenu(e) {
            if (!e.target.closest('.context-menu')) {
                this.removeContextMenu();
            }
        }

        removeContextMenu() {
            const existingMenu = document.querySelector('.context-menu');
            if (existingMenu) existingMenu.remove();
        }

        copyFileLink(path) {
            const url = `${window.location.origin}/api/stream/${encodeURIComponent(path)}`;
            navigator.clipboard.writeText(url).then(() => {
                this.fileFlix.showToast('Link copied to clipboard', 'success');
            }).catch(() => {
                this.fileFlix.showToast('Failed to copy link', 'error');
            });
        }

        async showFileInfo(path) {
            try {
                const response = await this.fileFlix.utils.apiRequest(`/api/metadata/${encodeURIComponent(path)}`);
                const metadata = response.metadata || {};
                const fileInfo = {
                    path: path,
                    size: this.fileFlix.utils.formatFileSize(metadata.size || 0),
                    type: metadata.type || 'Unknown',
                    modified: metadata.mtime ? new Date(metadata.mtime).toLocaleString() : 'Unknown',
                    duration: metadata.video_info?.duration ? this.formatDuration(parseFloat(metadata.video_info.duration)) : null,
                    resolution: metadata.video_info ? `${metadata.video_info.width}x${metadata.video_info.height}` : null,
                    audioTracks: metadata.audio_streams?.length || 0,
                    subtitleTracks: metadata.subtitle_streams?.length || 0
                };

                const info = `
                    <div class="file-info-dialog">
                        <h3>File Information</h3>
                        <div class="info-row">
                            <span class="info-label">Path:</span>
                            <span class="info-value">${this.fileFlix.utils.sanitizeHTML(fileInfo.path)}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Size:</span>
                            <span class="info-value">${fileInfo.size}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Type:</span>
                            <span class="info-value">${fileInfo.type}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Modified:</span>
                            <span class="info-value">${fileInfo.modified}</span>
                        </div>
                        ${fileInfo.duration ? `
                            <div class="info-row">
                                <span class="info-label">Duration:</span>
                                <span class="info-value">${fileInfo.duration}</span>
                            </div>
                        ` : ''}
                        ${fileInfo.resolution ? `
                            <div class="info-row">
                                <span class="info-label">Resolution:</span>
                                <span class="info-value">${fileInfo.resolution}</span>
                            </div>
                        ` : ''}
                        ${fileInfo.audioTracks ? `
                            <div class="info-row">
                                <span class="info-label">Audio Tracks:</span>
                                <span class="info-value">${fileInfo.audioTracks}</span>
                            </div>
                        ` : ''}
                        ${fileInfo.subtitleTracks ? `
                            <div class="info-row">
                                <span class="info-label">Subtitle Tracks:</span>
                                <span class="info-value">${fileInfo.subtitleTracks}</span>
                            </div>
                        ` : ''}
                    </div>
                `;

                this.showDialog('File Information', info);
            } catch (error) {
                console.error('Failed to get file info:', error);
                this.fileFlix.showToast('Failed to get file information', 'error');
            }
        }

        formatDuration(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        showDialog(title, content) {
            const dialog = document.createElement('div');
            dialog.className = 'dialog-overlay';

            dialog.innerHTML = `
                <div class="dialog">
                    <div class="dialog-header">
                        <h3>${title}</h3>
                        <button class="dialog-close" onclick="this.closest('.dialog-overlay').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="dialog-content">
                        ${content}
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) dialog.remove();
            });
        }

        async deleteFile(path) {
            if (!this.isHost) return;

            if (!confirm(`Are you sure you want to delete "${path.split('/').pop()}"?`)) return;

            try {
                const response = await this.fileFlix.utils.apiRequest(`/api/delete/${encodeURIComponent(path)}`, {
                    method: 'DELETE'
                });
                if (response.success) {
                    this.fileFlix.showToast('File deleted successfully', 'success');
                    this.fileFlix.refreshFiles();
                } else {
                    this.fileFlix.showToast('Failed to delete file', 'error');
                }
            } catch (error) {
                console.error('Delete failed:', error);
                this.fileFlix.showToast('Error deleting file', 'error');
            }
        }

        async copyFile(path) {
            this.fileFlix.showToast('File copied to clipboard (paste in another folder)', 'info');
            localStorage.setItem('copiedFile', JSON.stringify({ path, action: 'copy' }));
        }

        async pasteItems() {
            if (!this.isHost) return;

            const copiedData = JSON.parse(localStorage.getItem('copiedFile') || '{}');
            if (!copiedData.path) return;

            try {
                const response = await this.fileFlix.utils.apiRequest('/api/paste', {
                    method: 'POST',
                    body: JSON.stringify({
                        source: copiedData.path,
                        destination: this.fileFlix.currentPath,
                        action: copiedData.action
                    })
                });
                if (response.success) {
                    this.fileFlix.showToast('File pasted successfully', 'success');
                    this.fileFlix.refreshFiles();
                    localStorage.removeItem('copiedFile');
                } else {
                    this.fileFlix.showToast('Failed to paste file', 'error');
                }
            } catch (error) {
                console.error('Paste failed:', error);
                this.fileFlix.showToast('Error pasting file', 'error');
            }
        }

        async createNewFolder() {
            if (!this.isHost) return;

            const folderName = prompt('Enter new folder name:');
            if (!folderName) return;

            try {
                const response = await this.fileFlix.utils.apiRequest('/api/create_folder', {
                    method: 'POST',
                    body: JSON.stringify({
                        path: `${this.fileFlix.currentPath}/${folderName}`
                    })
                });
                if (response.success) {
                    this.fileFlix.showToast(`Folder "${folderName}" created`, 'success');
                    this.fileFlix.refreshFiles();
                } else {
                    this.fileFlix.showToast('Failed to create folder', 'error');
                }
            } catch (error) {
                console.error('Create folder failed:', error);
                this.fileFlix.showToast('Error creating folder', 'error');
            }
        }

        initKeyboardSelection() {
            const fileExplorer = document.getElementById('file-explorer');
            if (!fileExplorer) return;

            fileExplorer.addEventListener('click', (e) => {
                const fileCard = e.target.closest('.file-card, .file-list-item');
                if (!fileCard) {
                    if (!e.ctrlKey && !e.shiftKey) this.clearSelection();
                    return;
                }

                const path = fileCard.dataset.path;
                if (e.ctrlKey) {
                    if (this.selectedItems.has(path)) {
                        this.selectedItems.delete(path);
                        fileCard.classList.remove('selected');
                    } else {
                        this.selectedItems.add(path);
                        fileCard.classList.add('selected');
                    }
                } else if (e.shiftKey) {
                    this.selectRange(fileCard);
                } else {
                    this.clearSelection();
                    this.selectedItems.add(path);
                    fileCard.classList.add('selected');
                }

                this.updateSelectionUI();
            });

            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'a') {
                    e.preventDefault();
                    this.selectAll();
                }
                if (this.isHost && e.key === 'Delete') {
                    this.deleteSelected();
                }
                if (e.key === 'Escape') {
                    this.clearSelection();
                }
            });
        }

        selectAll() {
            const fileCards = document.querySelectorAll('.file-card, .file-list-item');
            fileCards.forEach(card => {
                card.classList.add('selected');
                this.selectedItems.add(card.dataset.path);
            });
            this.updateSelectionUI();
        }

        selectRange(targetCard) {
            const fileCards = Array.from(document.querySelectorAll('.file-card, .file-list-item'));
            const selectedCards = Array.from(document.querySelectorAll('.file-card.selected, .file-list-item.selected'));
            if (selectedCards.length === 0) {
                targetCard.classList.add('selected');
                this.selectedItems.add(targetCard.dataset.path);
                return;
            }

            const startIndex = fileCards.indexOf(selectedCards[0]);
            const endIndex = fileCards.indexOf(targetCard);
            const [minIndex, maxIndex] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];

            this.clearSelection();
            for (let i = minIndex; i <= maxIndex; i++) {
                fileCards[i].classList.add('selected');
                this.selectedItems.add(fileCards[i].dataset.path);
            }
            this.updateSelectionUI();
        }

        clearSelection() {
            this.selectedItems.clear();
            document.querySelectorAll('.file-card.selected, .file-list-item.selected').forEach(card => {
                card.classList.remove('selected');
            });
            this.updateSelectionUI();
        }

        updateSelectionUI() {
            const selectionCount = this.selectedItems.size;
            if (selectionCount > 0) {
                this.showSelectionToolbar(selectionCount);
            } else {
                this.hideSelectionToolbar();
            }
        }

        showSelectionToolbar(count) {
            let toolbar = document.getElementById('selection-toolbar');
            if (!toolbar) {
                toolbar = document.createElement('div');
                toolbar.id = 'selection-toolbar';
                toolbar.className = 'selection-toolbar';
                document.body.appendChild(toolbar);
            }

            const actions = this.isHost ? `
                <button class="btn btn-secondary" onclick="fileExplorer.downloadSelected()">
                    <i class="fas fa-download"></i>
                    Download
                </button>
                <button class="btn btn-secondary" onclick="fileExplorer.deleteSelected()">
                    <i class="fas fa-trash"></i>
                    Delete
                </button>
                <button class="btn btn-secondary" onclick="fileExplorer.copySelected()">
                    <i class="fas fa-copy"></i>
                    Copy
                </button>
            ` : `
                <button class="btn btn-secondary" onclick="fileExplorer.downloadSelected()">
                    <i class="fas fa-download"></i>
                    Download
                </button>
            `;

            toolbar.innerHTML = `
                <div class="selection-info">
                    ${count} item${count !== 1 ? 's' : ''} selected
                </div>
                <div class="selection-actions">
                    ${actions}
                    <button class="btn btn-secondary" onclick="fileExplorer.clearSelection()">
                        <i class="fas fa-times"></i>
                        Clear
                    </button>
                </div>
            `;

            toolbar.classList.add('visible');
        }

        hideSelectionToolbar() {
            const toolbar = document.getElementById('selection-toolbar');
            if (toolbar) toolbar.classList.remove('visible');
        }

        downloadSelected() {
            this.selectedItems.forEach(path => {
                this.fileFlix.downloadFile(path);
            });
            this.clearSelection();
        }

        copySelected() {
            if (!this.isHost) return;

            this.fileFlix.showToast('Files copied to clipboard (paste in another folder)', 'info');
            localStorage.setItem('copiedFile', JSON.stringify({
                path: Array.from(this.selectedItems),
                action: 'copy'
            }));
            this.clearSelection();
        }

        async deleteSelected() {
            if (!this.isHost || this.selectedItems.size === 0) return;

            const count = this.selectedItems.size;
            if (!confirm(`Are you sure you want to delete ${count} item${count !== 1 ? 's' : ''}?`)) return;

            try {
                for (const path of this.selectedItems) {
                    await this.fileFlix.utils.apiRequest(`/api/delete/${encodeURIComponent(path)}`, {
                        method: 'DELETE'
                    });
                }
                this.fileFlix.showToast(`${count} item${count !== 1 ? 's' : ''} deleted`, 'success');
                this.fileFlix.refreshFiles();
                this.clearSelection();
            } catch (error) {
                console.error('Delete failed:', error);
                this.fileFlix.showToast('Error deleting items', 'error');
            }
        }

        initFilePreview() {
            let previewTimeout;
            const fileExplorer = document.getElementById('file-explorer');
            if (!fileExplorer) return;

            fileExplorer.addEventListener('mouseover', (e) => {
                const fileCard = e.target.closest('.file-card, .file-list-item');
                if (!fileCard) return;

                const type = fileCard.dataset.type;
                if (type === 'image' || type === 'video') {
                    previewTimeout = setTimeout(() => {
                        this.showHoverPreview(fileCard);
                    }, 500);
                }
            });

            fileExplorer.addEventListener('mouseout', () => {
                if (previewTimeout) clearTimeout(previewTimeout);
                this.hideHoverPreview();
            });
        }

        showHoverPreview(fileCard) {
            const path = fileCard.dataset.path;
            const type = fileCard.dataset.type;

            let preview = document.querySelector('.hover-preview');
            if (preview) preview.remove();

            preview = document.createElement('div');
            preview.className = 'hover-preview';

            if (type === 'image') {
                preview.innerHTML = `<img src="/api/stream/${encodeURIComponent(path)}" alt="Preview">`;
            } else if (type === 'video') {
                preview.innerHTML = `<img src="/api/previews/${encodeURIComponent(path)}/preview_000.jpg" alt="Preview">`;
            }

            document.body.appendChild(preview);

            const rect = fileCard.getBoundingClientRect();
            preview.style.left = `${rect.right + 10}px`;
            preview.style.top = `${rect.top}px`;

            const previewRect = preview.getBoundingClientRect();
            if (previewRect.right > window.innerWidth) {
                preview.style.left = `${rect.left - previewRect.width - 10}px`;
            }
            if (previewRect.bottom > window.innerHeight) {
                preview.style.top = `${rect.bottom - previewRect.height}px`;
            }
        }

        hideHoverPreview() {
            const preview = document.querySelector('.hover-preview');
            if (preview) preview.remove();
        }

        initTouchSupport() {
            const fileExplorer = document.getElementById('file-explorer');
            if (!fileExplorer) return;

            let touchTimeout;
            fileExplorer.addEventListener('touchstart', (e) => {
                const fileCard = e.target.closest('.file-card, .file-list-item');
                if (!fileCard) return;

                touchTimeout = setTimeout(() => {
                    const rect = fileCard.getBoundingClientRect();
                    this.createContextMenu(rect.left + rect.width / 2, rect.top + rect.height / 2, 
                        fileCard.dataset.path, fileCard.dataset.type);
                }, 500);
            });

            fileExplorer.addEventListener('touchend', () => {
                if (touchTimeout) clearTimeout(touchTimeout);
            });

            fileExplorer.addEventListener('touchmove', () => {
                if (touchTimeout) clearTimeout(touchTimeout);
            });
        }
    }

    // Initialize FileExplorer
    if (window.fileFlix) {
        window.fileExplorer = new FileExplorer(window.fileFlix);
    }
});