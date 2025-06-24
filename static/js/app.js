// static\js\app.js

// Main Application Logic for FileFlix

class FileFlix {
    constructor() {
        this.currentPath = '';
        this.currentFilter = 'all';
        this.currentView = 'grid';
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.searchQuery = '';
        this.isLoading = false;
        
        // Initialize components
        this.init();
    }
    
    async init() {
        try {
            // Show loading screen
            this.showLoadingScreen();
            
            // Initialize keyboard shortcuts
            this.initKeyboardShortcuts();
            
            // Initialize event listeners
            this.initEventListeners();
            
            // Load initial data
            await this.loadFiles();
            
            // Check system status
            await this.checkSystemStatus();
            
            // Hide loading screen
            this.hideLoadingScreen();
            
            console.log('🎬 FileFlix initialized successfully');
        } catch (error) {
            console.error('Failed to initialize FileFlix:', error);
            this.showToast('Failed to initialize application', 'error');
            this.hideLoadingScreen();
        }
    }
    
    initEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', 
                this.utils.debounce((e) => this.handleSearch(e.target.value), 300)
            );
        }
        
        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter || e.target.closest('.filter-tab').dataset.filter;
                this.setFilter(filter);
            });
        });
        
        // View controls
        const gridViewBtn = document.getElementById('grid-view-btn');
        const listViewBtn = document.getElementById('list-view-btn');
        
        if (gridViewBtn) {
            gridViewBtn.addEventListener('click', () => this.setView('grid'));
        }
        
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => this.setView('list'));
        }
        
        // Breadcrumb navigation
        this.initBreadcrumbNavigation();
        
        // System status
        const systemStatus = document.getElementById('system-status');
        if (systemStatus) {
            systemStatus.addEventListener('click', () => this.showSystemInfo());
        }
        
        // Auto-refresh system status
        setInterval(() => this.checkSystemStatus(), 30000);
    }
    
    initBreadcrumbNavigation() {
        const breadcrumbContainer = document.getElementById('breadcrumb-container');
        if (breadcrumbContainer) {
            breadcrumbContainer.addEventListener('click', (e) => {
                const breadcrumbItem = e.target.closest('.breadcrumb-item');
                if (breadcrumbItem) {
                    const path = breadcrumbItem.dataset.path || '';
                    this.navigateToPath(path);
                }
            });
        }
    }
    
    initKeyboardShortcuts() {
        this.shortcuts = new this.utils.KeyboardShortcuts();
        
        // Global shortcuts
        this.shortcuts.register('ctrl+f', () => {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        });
        
        this.shortcuts.register('escape', () => {
            // Close any open modals
            const activeModal = document.querySelector('.modal.active');
            if (activeModal) {
                this.closeModal(activeModal);
            }
            
            // Clear search if focused
            const searchInput = document.getElementById('search-input');
            if (searchInput === document.activeElement) {
                searchInput.blur();
            }
        });
        
        this.shortcuts.register('ctrl+1', () => this.setFilter('all'));
        this.shortcuts.register('ctrl+2', () => this.setFilter('video'));
        this.shortcuts.register('ctrl+3', () => this.setFilter('image'));
        this.shortcuts.register('ctrl+4', () => this.setFilter('audio'));
        this.shortcuts.register('ctrl+5', () => this.setFilter('document'));
        
        this.shortcuts.register('ctrl+g', () => this.setView('grid'));
        this.shortcuts.register('ctrl+l', () => this.setView('list'));
        
        this.shortcuts.register('f5', (e) => {
            e.preventDefault();
            this.refreshFiles();
        });
    }
    
    get utils() {
        return window.FileFlix.utils;
    }
    
    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
        }
    }
    
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
            }, 500);
        }
    }
    
    showToast(message, type = 'info', duration = 3000) {
        this.utils.showToast(message, type, duration);
    }
    
    async loadFiles(path = '', page = 1) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.currentPath = path;
        this.currentPage = page;
        
        try {
            this.utils.performance.start('loadFiles');
            
            const params = new URLSearchParams({
                path: path,
                type: this.currentFilter,
                page: page.toString(),
                per_page: this.itemsPerPage.toString()
            });
            
            if (this.searchQuery) {
                params.append('search', this.searchQuery);
            }
            
            const response = await this.utils.apiRequest(`/api/files?${params}`);
            
            // Update breadcrumb
            this.updateBreadcrumb(response.breadcrumb, path);
            
            // Update file explorer
            this.updateFileExplorer(response.items);
            
            // Update pagination
            this.updatePagination(response.pagination);
            
            // Update URL
            this.utils.updateURLParameter('path', path);
            this.utils.updateURLParameter('filter', this.currentFilter);
            this.utils.updateURLParameter('view', this.currentView);
            
            this.utils.performance.end('loadFiles');
            
        } catch (error) {
            console.error('Failed to load files:', error);
            this.showToast('Failed to load files', 'error');
            this.showErrorState('Failed to load files. Please try again.');
        } finally {
            this.isLoading = false;
        }
    }
    
    updateBreadcrumb(breadcrumbData, currentPath) {
        const breadcrumbPath = document.getElementById('breadcrumb-path');
        if (!breadcrumbPath) return;
        
        breadcrumbPath.innerHTML = '';
        
        if (breadcrumbData && breadcrumbData.length > 0) {
            breadcrumbData.forEach((item, index) => {
                // Add separator
                if (index > 0) {
                    const separator = this.utils.createElement('span', {
                        className: 'breadcrumb-separator'
                    }, '<i class="fas fa-chevron-right"></i>');
                    breadcrumbPath.appendChild(separator);
                }
                
                // Add breadcrumb item
                const breadcrumbItem = this.utils.createElement('button', {
                    className: 'breadcrumb-item',
                    dataset: { path: item.path }
                }, `<span>${this.utils.sanitizeHTML(item.name)}</span>`);
                
                breadcrumbPath.appendChild(breadcrumbItem);
            });
        }
    }
    
    updateFileExplorer(items) {
        const fileExplorer = document.getElementById('file-explorer');
        if (!fileExplorer) return;
        
        // Clear existing content
        fileExplorer.innerHTML = '';
        
        if (items.length === 0) {
            this.showEmptyState();
            return;
        }
        
        // Set view class
        fileExplorer.className = `file-explorer ${this.currentView}-view`;
        
        // Create file items
        const fragment = document.createDocumentFragment();
        
        items.forEach(item => {
            const fileElement = this.createFileElement(item);
            fragment.appendChild(fileElement);
        });
        
        fileExplorer.appendChild(fragment);
    }
    
    createFileElement(item) {
        const isFolder = item.type === 'folder';
        const iconClass = this.utils.getFileIcon(item.type);
        
        if (this.currentView === 'grid') {
            return this.createGridFileElement(item, isFolder, iconClass);
        } else {
            return this.createListFileElement(item, isFolder, iconClass);
        }
    }
    
    createGridFileElement(item, isFolder, iconClass) {
        const card = this.utils.createElement('div', {
            className: 'file-card',
            dataset: { path: item.path, type: item.type }
        });
        
        // Thumbnail/Icon
        let thumbnailContent = '';
        if (isFolder) {
            thumbnailContent = `<i class="file-icon folder ${iconClass}"></i>`;
        } else if (item.type === 'video' && item.has_thumbnail) {
            thumbnailContent = `
                <img src="/api/thumbnail/${encodeURIComponent(item.path)}" 
                     alt="${this.utils.sanitizeHTML(item.name)}" 
                     loading="lazy" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <i class="file-icon video ${iconClass}" style="display: none;"></i>
                <div class="play-overlay">
                    <div class="play-button">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
            `;
        } else if (item.type === 'image') {
            thumbnailContent = `
                <img src="/api/file/${encodeURIComponent(item.path)}" 
                     alt="${this.utils.sanitizeHTML(item.name)}" 
                     loading="lazy" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <i class="file-icon image ${iconClass}" style="display: none;"></i>
            `;
        } else {
            thumbnailContent = `<i class="file-icon ${item.type} ${iconClass}"></i>`;
        }
        
        card.innerHTML = `
            <div class="file-thumbnail" onclick="fileFlix.handleFileClick('${item.path}', '${item.type}')">
                ${thumbnailContent}
            </div>
            <div class="file-info">
                <div class="file-name" title="${this.utils.sanitizeHTML(item.name)}">
                    ${this.utils.sanitizeHTML(item.name)}
                </div>
                <div class="file-meta">
                    <span class="file-type-badge ${item.type}">${item.type}</span>
                    ${!isFolder ? `<span class="file-size">${item.size_formatted}</span>` : ''}
                </div>
                <div class="file-actions">
                    ${this.createFileActions(item)}
                </div>
            </div>
        `;
        
        return card;
    }
    
    createListFileElement(item, isFolder, iconClass) {
        const listItem = this.utils.createElement('div', {
            className: 'file-list-item',
            dataset: { path: item.path, type: item.type }
        });
        
        listItem.innerHTML = `
            <div class="file-list-icon">
                <i class="${iconClass} ${item.type}"></i>
            </div>
            <div class="file-list-name" onclick="fileFlix.handleFileClick('${item.path}', '${item.type}')" 
                 title="${this.utils.sanitizeHTML(item.name)}">
                ${this.utils.sanitizeHTML(item.name)}
            </div>
            <div class="file-list-type">${item.type}</div>
            <div class="file-list-size">${isFolder ? '-' : item.size_formatted}</div>
            <div class="file-list-actions">
                ${this.createListFileActions(item)}
            </div>
        `;
        
        return listItem;
    }
    
    createFileActions(item) {
        const isFolder = item.type === 'folder';
        
        let primaryAction = '';
        if (isFolder) {
            primaryAction = `<button class="action-btn primary" onclick="fileFlix.navigateToPath('${item.path}')">Open</button>`;
        } else if (item.type === 'video') {
            primaryAction = `<button class="action-btn primary" onclick="fileFlix.playVideo('${item.path}', '${this.utils.sanitizeHTML(item.name)}')">Play</button>`;
        } else if (item.type === 'image' || (item.type === 'document' && item.name.toLowerCase().endsWith('.pdf'))) {
            primaryAction = `<button class="action-btn primary" onclick="fileFlix.previewFile('${item.path}', '${item.type}')">View</button>`;
        } else {
            primaryAction = `<button class="action-btn primary" onclick="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')">Open</button>`;
        }
        
        const downloadAction = !isFolder ? 
            `<button class="action-btn" onclick="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')">Download</button>` : '';
        
        return `${primaryAction}${downloadAction}`;
    }
    
    createListFileActions(item) {
        const isFolder = item.type === 'folder';
        
        let primaryAction = '';
        if (isFolder) {
            primaryAction = `<button class="list-action-btn" onclick="fileFlix.navigateToPath('${item.path}')" title="Open"><i class="fas fa-folder-open"></i></button>`;
        } else if (item.type === 'video') {
            primaryAction = `<button class="list-action-btn" onclick="fileFlix.playVideo('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" title="Play"><i class="fas fa-play"></i></button>`;
        } else if (item.type === 'image' || (item.type === 'document' && item.name.toLowerCase().endsWith('.pdf'))) {
            primaryAction = `<button class="list-action-btn" onclick="fileFlix.previewFile('${item.path}', '${item.type}')" title="View"><i class="fas fa-eye"></i></button>`;
        } else {
            primaryAction = `<button class="list-action-btn" onclick="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" title="Open"><i class="fas fa-external-link-alt"></i></button>`;
        }
        
        const downloadAction = !isFolder ? 
            `<button class="list-action-btn" onclick="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" title="Download"><i class="fas fa-download"></i></button>` : '';
        
        return `${primaryAction}${downloadAction}`;
    }
    
    updatePagination(pagination) {
        const paginationContainer = document.getElementById('pagination-container');
        if (!paginationContainer || pagination.pages <= 1) {
            if (paginationContainer) paginationContainer.style.display = 'none';
            return;
        }
        
        paginationContainer.style.display = 'flex';
        
        const { page, pages, total } = pagination;
        
        let paginationHTML = `
            <div class="pagination-info">
                Showing page ${page} of ${pages} (${total} items)
            </div>
            <div class="pagination">
        `;
        
        // Previous button
        paginationHTML += `
            <button class="pagination-btn" 
                    ${page <= 1 ? 'disabled' : ''} 
                    onclick="fileFlix.loadFiles('${this.currentPath}', ${page - 1})">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;
        
        // Page numbers
        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(pages, page + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button class="pagination-btn ${i === page ? 'active' : ''}" 
                        onclick="fileFlix.loadFiles('${this.currentPath}', ${i})">
                    ${i}
                </button>
            `;
        }
        
        // Next button
        paginationHTML += `
            <button class="pagination-btn" 
                    ${page >= pages ? 'disabled' : ''} 
                    onclick="fileFlix.loadFiles('${this.currentPath}', ${page + 1})">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;
        
        paginationHTML += '</div>';
        
        paginationContainer.innerHTML = paginationHTML;
    }
    
    showEmptyState() {
        const fileExplorer = document.getElementById('file-explorer');
        if (!fileExplorer) return;
        
        fileExplorer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-folder-open"></i>
                </div>
                <div class="empty-state-title">No files found</div>
                <div class="empty-state-description">
                    ${this.searchQuery ? 
                        `No files match your search for "${this.utils.sanitizeHTML(this.searchQuery)}"` : 
                        'This folder appears to be empty'}
                </div>
            </div>
        `;
    }
    
    showErrorState(message) {
        const fileExplorer = document.getElementById('file-explorer');
        if (!fileExplorer) return;
        
        fileExplorer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="empty-state-title">Error</div>
                <div class="empty-state-description">${this.utils.sanitizeHTML(message)}</div>
                <button class="btn btn-primary" onclick="fileFlix.refreshFiles()">
                    <i class="fas fa-sync-alt"></i>
                    Try Again
                </button>
            </div>
        `;
    }
    
    // Event Handlers
    async handleSearch(query) {
        this.searchQuery = query;
        await this.loadFiles(this.currentPath, 1);
    }
    
    async setFilter(filter) {
        if (this.currentFilter === filter) return;
        
        this.currentFilter = filter;
        
        // Update UI
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.filter === filter);
        });
        
        await this.loadFiles(this.currentPath, 1);
    }
    
    setView(view) {
        if (this.currentView === view) return;
        
        this.currentView = view;
        
        // Update UI
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        document.getElementById(`${view}-view-btn`).classList.add('active');
        
        // Save preference
        this.utils.storage.set('preferredView', view);
        
        // Re-render current files
        const fileExplorer = document.getElementById('file-explorer');
        if (fileExplorer && fileExplorer.children.length > 0) {
            fileExplorer.className = `file-explorer ${view}-view`;
        }
    }
    
    async navigateToPath(path) {
        await this.loadFiles(path, 1);
    }
    
    handleFileClick(path, type) {
        if (type === 'folder') {
            this.navigateToPath(path);
        } else if (type === 'video') {
            this.playVideo(path);
        } else if (type === 'image' || (type === 'document' && path.toLowerCase().endsWith('.pdf'))) {
            this.previewFile(path, type);
        } else {
            this.downloadFile(path);
        }
    }
    
    playVideo(path, title = '') {
        if (window.FileFlix.player) {
            window.FileFlix.player.play(path, title);
        }
    }
    
    previewFile(path, type) {
        const modal = document.getElementById('preview-modal');
        const container = document.getElementById('preview-container');
        
        if (!modal || !container) return;
        
        container.innerHTML = '';
        
        if (type === 'image') {
            const img = this.utils.createElement('img', {
                src: `/api/file/${encodeURIComponent(path)}`,
                alt: 'Preview'
            });
            container.appendChild(img);
        } else if (type === 'document' && path.toLowerCase().endsWith('.pdf')) {
            const iframe = this.utils.createElement('iframe', {
                src: `/api/file/${encodeURIComponent(path)}`,
                frameborder: '0'
            });
            container.appendChild(iframe);
        }
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    downloadFile(path, filename = '') {
        const link = this.utils.createElement('a', {
            href: `/api/file/${encodeURIComponent(path)}?download=true`,
            download: filename || path.split('/').pop()
        });
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    closeModal(modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    async refreshFiles() {
        await this.loadFiles(this.currentPath, this.currentPage);
        this.showToast('Files refreshed', 'success');
    }
    
    async checkSystemStatus() {
        try {
            const status = await this.utils.apiRequest('/api/system');
            
            const systemStatusElement = document.getElementById('system-status');
            if (systemStatusElement) {
                if (status.status === 'ok') {
                    systemStatusElement.className = 'system-status online';
                    systemStatusElement.title = 'System Online';
                } else {
                    systemStatusElement.className = 'system-status offline';
                    systemStatusElement.title = 'System Issues Detected';
                }
            }
        } catch (error) {
            console.warn('Could not check system status:', error);
        }
    }
    
    showSystemInfo() {
        this.showToast('System status check in progress...', 'info');
        // Could expand this to show detailed system information
    }
}

// Initialize FileFlix when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.fileFlix = new FileFlix();
    
    // Global event listeners
    document.addEventListener('click', (e) => {
        if (e.target.matches('#close-preview-btn') || e.target.closest('#close-preview-btn')) {
            const modal = document.getElementById('preview-modal');
            if (modal) {
                fileFlix.closeModal(modal);
            }
        }
        
        // Close modals when clicking outside
        if (e.target.matches('.modal')) {
            fileFlix.closeModal(e.target);
        }
    });
    
    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
        const path = fileFlix.utils.getURLParameter('path') || '';
        const filter = fileFlix.utils.getURLParameter('filter') || 'all';
        const view = fileFlix.utils.getURLParameter('view') || 'grid';
        
        fileFlix.currentFilter = filter;
        fileFlix.currentView = view;
        fileFlix.loadFiles(path);
    });
});