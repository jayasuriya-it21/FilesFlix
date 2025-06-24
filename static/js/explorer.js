// static/js/explorer.js

// File Explorer Enhanced Functionality

class FileExplorer {
    constructor(fileFlix) {
        this.fileFlix = fileFlix;
        this.dragDropEnabled = true;
        this.selectionMode = false;
        this.selectedItems = new Set();
        
        this.init();
    }
    
    init() {
        this.initDragAndDrop();
        this.initContextMenu();
        this.initKeyboardSelection();
        this.initFilePreview();
    }
    
    initDragAndDrop() {
        const fileExplorer = document.getElementById('file-explorer');
        if (!fileExplorer) return;
        
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            fileExplorer.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });
        
        // Highlight drop area
        ['dragenter', 'dragover'].forEach(eventName => {
            fileExplorer.addEventListener(eventName, this.highlight.bind(this), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            fileExplorer.addEventListener(eventName, this.unhighlight.bind(this), false);
        });
        
        // Handle dropped files
        fileExplorer.addEventListener('drop', this.handleDrop.bind(this), false);
    }
    
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    highlight(e) {
        const fileExplorer = document.getElementById('file-explorer');
        fileExplorer.classList.add('drag-over');
    }
    
    unhighlight(e) {
        const fileExplorer = document.getElementById('file-explorer');
        fileExplorer.classList.remove('drag-over');
    }
    
    handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            this.showUploadDialog(files);
        }
    }
    
    showUploadDialog(files) {
        // This would show an upload interface
        // For now, just show a notification
        this.fileFlix.showToast('File upload feature coming soon!', 'info');
    }
    
    initContextMenu() {
        const fileExplorer = document.getElementById('file-explorer');
        if (!fileExplorer) return;
        
        fileExplorer.addEventListener('contextmenu', this.showContextMenu.bind(this));
        document.addEventListener('click', this.hideContextMenu.bind(this));
    }
    
    showContextMenu(e) {
        e.preventDefault();
        
        const fileCard = e.target.closest('.file-card, .file-list-item');
        if (!fileCard) return;
        
        const path = fileCard.dataset.path;
        const type = fileCard.dataset.type;
        
        this.createContextMenu(e.clientX, e.clientY, path, type);
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
        
        // Position menu to stay within viewport
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${y - rect.height}px`;
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
                action: `fileFlix.playVideo('${path}'); fileExplorer.removeContextMenu();`
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
                action: `fileFlix.downloadFile('${path}'); fileExplorer.removeContextMenu();`
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
        
        return items;
    }
    
    hideContextMenu(e) {
        if (!e.target.closest('.context-menu')) {
            this.removeContextMenu();
        }
    }
    
    removeContextMenu() {
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }
    
    copyFileLink(path) {
        const url = `${window.location.origin}/api/file/${encodeURIComponent(path)}`;
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                this.fileFlix.showToast('Link copied to clipboard', 'success');
            });
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.fileFlix.showToast('Link copied to clipboard', 'success');
        }
    }
    
    async showFileInfo(path) {
        try {
            const response = await fetch(`/api/file/${encodeURIComponent(path)}`, { method: 'HEAD' });
            const contentLength = response.headers.get('content-length');
            const lastModified = response.headers.get('last-modified');
            const contentType = response.headers.get('content-type');
            
            const info = `
                <div class="file-info-dialog">
                    <h3>File Information</h3>
                    <div class="info-row">
                        <span class="info-label">Path:</span>
                        <span class="info-value">${this.fileFlix.utils.sanitizeHTML(path)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Size:</span>
                        <span class="info-value">${this.fileFlix.utils.formatFileSize(parseInt(contentLength) || 0)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Type:</span>
                        <span class="info-value">${contentType || 'Unknown'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Modified:</span>
                        <span class="info-value">${lastModified ? new Date(lastModified).toLocaleString() : 'Unknown'}</span>
                    </div>
                </div>
            `;
            
            this.showDialog('File Information', info);
        } catch (error) {
            this.fileFlix.showToast('Failed to get file information', 'error');
        }
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
        
        // Close dialog when clicking outside
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        });
    }
    
    initKeyboardSelection() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'a') {
                e.preventDefault();
                this.selectAll();
            }
            
            if (e.key === 'Delete') {
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
        
        toolbar.innerHTML = `
            <div class="selection-info">
                ${count} item${count !== 1 ? 's' : ''} selected
            </div>
            <div class="selection-actions">
                <button class="btn btn-secondary" onclick="fileExplorer.downloadSelected()">
                    <i class="fas fa-download"></i>
                    Download
                </button>
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
        if (toolbar) {
            toolbar.classList.remove('visible');
        }
    }
    
    downloadSelected() {
        this.selectedItems.forEach(path => {
            this.fileFlix.downloadFile(path);
        });
        
        this.clearSelection();
    }
    
    deleteSelected() {
        if (this.selectedItems.size === 0) return;
        
        const count = this.selectedItems.size;
        const message = `Are you sure you want to delete ${count} item${count !== 1 ? 's' : ''}?`;
        
        if (confirm(message)) {
            // This would implement file deletion
            this.fileFlix.showToast('File deletion feature coming soon!', 'info');
            this.clearSelection();
        }
    }
    
    initFilePreview() {
        // Initialize hover previews for images and videos
        let previewTimeout;
        
        document.addEventListener('mouseover', (e) => {
            const fileCard = e.target.closest('.file-card, .file-list-item');
            if (!fileCard) return;
            
            const type = fileCard.dataset.type;
            if (type === 'image' || type === 'video') {
                previewTimeout = setTimeout(() => {
                    this.showHoverPreview(fileCard);
                }, 500);
            }
        });
        
        document.addEventListener('mouseout', (e) => {
            if (previewTimeout) {
                clearTimeout(previewTimeout);
            }
            this.hideHoverPreview();
        });
    }
    
    showHoverPreview(fileCard) {
        const path = fileCard.dataset.path;
        const type = fileCard.dataset.type;
        
        const preview = document.createElement('div');
        preview.className = 'hover-preview';
        
        if (type === 'image') {
            preview.innerHTML = `<img src="/api/file/${encodeURIComponent(path)}" alt="Preview">`;
        } else if (type === 'video') {
            preview.innerHTML = `<img src="/api/thumbnail/${encodeURIComponent(path)}" alt="Preview">`;
        }
        
        document.body.appendChild(preview);
        
        // Position preview
        const rect = fileCard.getBoundingClientRect();
        preview.style.left = `${rect.right + 10}px`;
        preview.style.top = `${rect.top}px`;
        
        // Adjust position if preview goes off screen
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
        if (preview) {
            preview.remove();
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (window.fileFlix) {
        window.fileExplorer = new FileExplorer(window.fileFlix);
    }
});