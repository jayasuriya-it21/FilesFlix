document.addEventListener('DOMContentLoaded', () => {
    // Main Application Logic for FileFlix
    class FileFlix {
        constructor() {
            this.currentPath = '';
            this.currentFilter = 'all';
            this.currentView = localStorage.getItem('preferredView') || 'list';
            this.currentPage = 1;
            this.itemsPerPage = 12; // Aligned with app.py
            this.searchQuery = '';
            this.isLoading = false;
            this.isHost = document.body.dataset.isHost === 'true';

            // Initialize components
            this.init();
        }        async init() {
            try {
                this.showLoadingScreen();
                this.initKeyboardShortcuts();
                this.initEventListeners();
                this.initializeViewState(); // Initialize view controls state
                await this.loadFiles();
                if (this.isHost) {
                    await this.checkSystemStatus();
                }
                this.hideLoadingScreen();
                console.log('🎬 FileFlix initialized successfully');
            } catch (error) {
                console.error('Failed to initialize FileFlix:', error);
                this.showToast('Failed to initialize application', 'error');
                this.hideLoadingScreen();
            }
        }

        initializeViewState() {
            // Set initial view button states
            document.querySelectorAll('.view-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            const activeBtn = document.getElementById(`${this.currentView}-view-btn`);
            if (activeBtn) {
                activeBtn.classList.add('active');
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
                tab.addEventListener('touchend', (e) => {
                    const filter = e.target.dataset.filter || e.target.closest('.filter-tab').dataset.filter;
                    this.setFilter(filter);
                });
            });

            // View controls
            const gridViewBtn = document.getElementById('grid-view-btn');
            const listViewBtn = document.getElementById('list-view-btn');
            if (gridViewBtn) {
                gridViewBtn.addEventListener('click', () => this.setView('grid'));
                gridViewBtn.addEventListener('touchend', () => this.setView('grid'));
            }
            if (listViewBtn) {
                listViewBtn.addEventListener('click', () => this.setView('list'));
                listViewBtn.addEventListener('touchend', () => this.setView('list'));
            }

            // Breadcrumb navigation
            this.initBreadcrumbNavigation();            // Directory picker for Host (only on host page)
            if (this.isHost && window.location.pathname === '/host') {
                const dirPicker = document.getElementById('directory-picker');
                const setDirBtn = document.getElementById('set-dir-btn');
                const selectDirBtn = document.getElementById('select-dir-btn');
                const mediaPathInput = document.getElementById('media-path-input');
                
                if (dirPicker) {
                    dirPicker.addEventListener('change', (e) => {
                        const files = e.target.files;
                        if (files.length === 0) return;
                        // Try to extract folder name from first file
                        const dirPath = files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : '';
                        if (mediaPathInput) {
                            mediaPathInput.value = dirPath;
                            if (setDirBtn) setDirBtn.disabled = !dirPath;
                        }
                    });
                }
                
                if (selectDirBtn && mediaPathInput && setDirBtn) {
                    selectDirBtn.addEventListener('click', async () => {
                        // Try modern picker
                        if ('showDirectoryPicker' in window) {
                            try {
                                const dirHandle = await window.showDirectoryPicker();
                                const dirName = dirHandle.name;
                                const fullPath = prompt(`Selected folder: "${dirName}"\nPlease enter the full path:`, `C:/Users/YourUsername/${dirName}`);
                                if (fullPath) {
                                    mediaPathInput.value = fullPath;
                                    setDirBtn.disabled = false;
                                }
                            } catch (e) {/* fallback */}
                        } else {
                            // Fallback: manual entry
                            const manualPath = prompt('Enter the directory path:', '');
                            if (manualPath) {
                                mediaPathInput.value = manualPath;
                                setDirBtn.disabled = false;
                            }
                        }
                    });
                }
                
                if (setDirBtn && mediaPathInput) {
                    setDirBtn.addEventListener('click', async () => {
                        const path = mediaPathInput.value.trim();
                        if (!path) {
                            this.showToast('Please enter a valid directory path', 'error');
                            return;
                        }
                        try {
                            const response = await this.utils.apiRequest('/api/set-directory', {
                                method: 'POST',
                                body: { path }
                            });
                            if (!response.success) {
                                throw new Error(response.message || 'Failed to set directory');
                            }
                            this.currentPath = '';
                            await this.loadFiles();
                            this.showToast(`Directory set to ${path}`, 'success');
                            await this.checkSystemStatus();
                        } catch (error) {
                            this.showToast(error.message || 'Error setting directory', 'error');
                        }
                    });
                }
            }

            // System status for Host
            if (this.isHost) {
                const systemStatus = document.getElementById('system-status');
                if (systemStatus) {
                    systemStatus.addEventListener('click', () => this.showSystemInfo());
                    systemStatus.addEventListener('touchend', () => this.showSystemInfo());
                }
                setInterval(() => this.checkSystemStatus(), 30000);
            }
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
                breadcrumbContainer.addEventListener('touchend', (e) => {
                    const breadcrumbItem = e.target.closest('.breadcrumb-item');
                    if (breadcrumbItem) {
                        const path = breadcrumbItem.dataset.path || '';
                        this.navigateToPath(path);
                    }
                });
            }
        }

        initKeyboardShortcuts() {
            // Use the class for a new instance, or use the singleton instance as needed
            this.shortcuts = new this.utils.KeyboardShortcutsClass();

            this.shortcuts.register('ctrl+f', () => {
                const searchInput = document.getElementById('search-input');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            });

            this.shortcuts.register('escape', () => {
                const activeModal = document.querySelector('.modal.active');
                if (activeModal) {
                    this.closeModal(activeModal);
                }
                const searchInput = document.getElementById('search-input');
                if (searchInput === document.activeElement) {
                    searchInput.value = '';
                    this.handleSearch('');
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

            if (this.isHost) {
                this.shortcuts.register('ctrl+shift+d', () => {
                    const selectedFile = document.querySelector('.file-card.selected, .file-list-item.selected');
                    if (selectedFile) {
                        const path = selectedFile.dataset.path;
                        this.deleteFile(path);
                    }
                });
            }
        }        get utils() {
            return window.FileFlix?.utils || {
                debounce: (func, wait) => {
                    let timeout;
                    return function executedFunction(...args) {
                        const later = () => {
                            clearTimeout(timeout);
                            func(...args);
                        };
                        clearTimeout(timeout);
                        timeout = setTimeout(later, wait);
                    };
                },
                apiRequest: async (endpoint, options = {}) => {
                    const defaultOptions = {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        credentials: 'include'
                    };

                    const config = { ...defaultOptions, ...options };
                    if (config.body && config.headers['Content-Type'] === 'application/json') {
                        config.body = JSON.stringify(config.body);
                    }

                    const response = await fetch(endpoint, config);
                    if (!response.ok) {
                        const error = await response.json().catch(() => ({}));
                        throw new Error(error.message || `HTTP error! status: ${response.status}`);
                    }

                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        return await response.json();
                    }
                    return await response.text();
                },
                showToast: (message, type = 'info') => console.log(`[${type.toUpperCase()}] ${message}`),
                performance: { start: () => {}, end: () => {} },
                updateURLParameter: (key, value) => {
                    const url = new URL(window.location);
                    if (value) url.searchParams.set(key, value);
                    else url.searchParams.delete(key);
                    window.history.replaceState({}, '', url);
                },
                getURLParameter: (key) => new URLSearchParams(window.location.search).get(key),
                sanitizeHTML: (str) => {
                    const div = document.createElement('div');
                    div.textContent = str;
                    return div.innerHTML;
                },
                createElement: (tag, attributes = {}, innerHTML = '') => {
                    const element = document.createElement(tag);
                    Object.entries(attributes).forEach(([key, value]) => {
                        if (key === 'dataset') {
                            Object.entries(value).forEach(([dataKey, dataValue]) => {
                                element.dataset[dataKey] = dataValue;
                            });
                        } else {
                            element[key] = value;
                        }
                    });
                    element.innerHTML = innerHTML;
                    return element;
                },
                formatFileSize: (bytes) => {
                    if (bytes === 0) return '0 Bytes';
                    const k = 1024;
                    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                },
                getFileIcon: (type) => {
                    const icons = {
                        video: 'fa-video',
                        audio: 'fa-music',
                        image: 'fa-image',
                        document: 'fa-file-alt',
                        folder: 'fa-folder'
                    };
                    return icons[type] || 'fa-file';
                },
                generateHash: (str) => {
                    let hash = 0;
                    for (let i = 0; i < str.length; i++) {
                        const char = str.charCodeAt(i);
                        hash = ((hash << 5) - hash) + char;
                        hash = hash & hash; // Convert to 32-bit integer
                    }
                    return Math.abs(hash).toString(16);
                },
                KeyboardShortcutsClass: function() {
                    this.shortcuts = new Map();
                    this.register = (keys, callback) => {
                        this.shortcuts.set(keys, callback);
                    };
                    
                    document.addEventListener('keydown', (e) => {
                        const combo = [];
                        if (e.ctrlKey) combo.push('ctrl');
                        if (e.shiftKey) combo.push('shift');
                        if (e.altKey) combo.push('alt');
                        combo.push(e.key.toLowerCase());
                        
                        const shortcut = combo.join('+');
                        if (this.shortcuts.has(shortcut)) {
                            e.preventDefault();
                            this.shortcuts.get(shortcut)();
                        }
                    });
                }
            };
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
        }        showToast(message, type = 'info', duration = 3000) {
            try {
                // Check if utils is available and has showToast method
                if (window.showToast) {
                    window.showToast(message, type, duration);
                } else if (window.FileFlix?.utils?.showToast) {
                    window.FileFlix.utils.showToast(message, type, duration);
                } else {
                    // Fallback to console logging
                    console.log(`[${type.toUpperCase()}] ${message}`);
                }
            } catch (error) {
                console.error('Failed to show toast:', error);
                console.log(`[${type.toUpperCase()}] ${message}`);
            }
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
                    page: page.toString(),
                    per_page: this.itemsPerPage.toString()
                });

                const endpoint = this.searchQuery ? '/api/search' : '/api/files';
                if (this.searchQuery) {
                    params.append('q', this.searchQuery);
                } else {
                    params.append('type', this.currentFilter);
                }

                const response = await this.utils.apiRequest(`${endpoint}?${params}`);
                if (!response.success) {
                    throw new Error(response.message || 'Failed to load files');
                }

                // Update breadcrumb
                this.updateBreadcrumb(response.path);

                // Update file explorer
                this.updateFileExplorer(response.files || response.results || []);

                // Update pagination
                this.updatePagination({
                    page: page,
                    pages: Math.ceil((response.total || response.results.length) / this.itemsPerPage),
                    total: response.total || response.results.length
                });

                // Update URL
                this.utils.updateURLParameter('path', path);
                this.utils.updateURLParameter('filter', this.currentFilter);
                this.utils.updateURLParameter('view', this.currentView);

                this.utils.performance.end('loadFiles');
            } catch (error) {
                console.error('Failed to load files:', error);
                this.showToast(error.message || 'Failed to load files', 'error');
                this.showErrorState(error.message || 'Failed to load files. Please try again.');
            } finally {
                this.isLoading = false;
            }
        }

        updateBreadcrumb(currentPath) {
            const breadcrumbPath = document.getElementById('breadcrumb-path');
            if (!breadcrumbPath) return;

            breadcrumbPath.innerHTML = '';
            const parts = currentPath ? currentPath.split('/') : [];
            let cumulativePath = '';

            // Home breadcrumb
            const homeItem = this.utils.createElement('button', {
                className: 'breadcrumb-item',
                dataset: { path: '' }
            }, '<span>Home</span>');
            breadcrumbPath.appendChild(homeItem);

            // Path breadcrumbs
            parts.forEach((part, index) => {
                if (part) {
                    const separator = this.utils.createElement('span', {
                        className: 'breadcrumb-separator'
                    }, '<i class="fas fa-chevron-right"></i>');
                    breadcrumbPath.appendChild(separator);

                    cumulativePath += (cumulativePath ? '/' : '') + part;
                    const breadcrumbItem = this.utils.createElement('button', {
                        className: 'breadcrumb-item',
                        dataset: { path: cumulativePath }
                    }, `<span>${this.utils.sanitizeHTML(part)}</span>`);
                    breadcrumbPath.appendChild(breadcrumbItem);
                }
            });
        }

        updateFileExplorer(items) {
            const fileExplorer = document.getElementById('file-explorer');
            if (!fileExplorer) return;

            fileExplorer.innerHTML = '';
            if (items.length === 0) {
                this.showEmptyState();
                return;
            }

            fileExplorer.className = `file-explorer ${this.currentView}-view`;
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

            return this.currentView === 'grid' 
                ? this.createGridFileElement(item, isFolder, iconClass)
                : this.createListFileElement(item, isFolder, iconClass);
        }

        createGridFileElement(item, isFolder, iconClass) {
            const card = this.utils.createElement('div', {
                className: 'file-card',
                dataset: { path: item.path, type: item.type }
            });

            let thumbnailContent = '';
            if (isFolder) {
                thumbnailContent = `<i class="file-icon folder ${iconClass}"></i>`;
            } else if (item.type === 'video') {
                thumbnailContent = `
                    <img src="/api/previews/${encodeURIComponent(this.utils.generateHash(item.path))}/preview_000.jpg" 
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
                    <img src="/api/stream/${encodeURIComponent(item.path)}" 
                         alt="${this.utils.sanitizeHTML(item.name)}" 
                         loading="lazy" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <i class="file-icon image ${iconClass}" style="display: none;"></i>
                `;
            } else {
                thumbnailContent = `<i class="file-icon ${item.type} ${iconClass}"></i>`;
            }

            card.innerHTML = `
                <div class="file-thumbnail" onclick="fileFlix.handleFileClick('${item.path}', '${item.type}')" 
                     ontouchend="fileFlix.handleFileClick('${item.path}', '${item.type}')">
                    ${thumbnailContent}
                </div>
                <div class="file-info">
                    <div class="file-name" title="${this.utils.sanitizeHTML(item.name)}">
                        ${this.utils.sanitizeHTML(item.name)}
                    </div>
                    <div class="file-meta">
                        <span class="file-type-badge ${item.type}">${item.type}</span>
                        ${!isFolder ? `<span class="file-size">${this.utils.formatFileSize(item.size)}</span>` : ''}
                    </div>
                    <div class="file-actions">
                        ${this.createFileActions(item)}
                    </div>
                </div>
            `;

            if (this.isHost && !isFolder) {
                card.addEventListener('click', (e) => this.handleFileSelect(e, card));
                card.addEventListener('touchend', (e) => this.handleFileSelect(e, card));
            }

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
                     ontouchend="fileFlix.handleFileClick('${item.path}', '${item.type}')"
                     title="${this.utils.sanitizeHTML(item.name)}">
                    ${this.utils.sanitizeHTML(item.name)}
                </div>
                <div class="file-list-type">${item.type}</div>
                <div class="file-list-size">${isFolder ? '-' : this.utils.formatFileSize(item.size)}</div>
                <div class="file-list-mtime">${new Date(item.mtime).toLocaleString()}</div>
                <div class="file-list-actions">
                    ${this.createListFileActions(item)}
                </div>
            `;

            if (this.isHost && !isFolder) {
                listItem.addEventListener('click', (e) => this.handleFileSelect(e, listItem));
                listItem.addEventListener('touchend', (e) => this.handleFileSelect(e, listItem));
            }

            return listItem;
        }

        createFileActions(item) {
            const isFolder = item.type === 'folder';
            let primaryAction = '';
            if (isFolder) {
                primaryAction = `<button class="action-btn primary" onclick="fileFlix.navigateToPath('${item.path}')" 
                                 ontouchend="fileFlix.navigateToPath('${item.path}')">Open</button>`;
            } else if (item.type === 'video') {
                primaryAction = `<button class="action-btn primary" onclick="fileFlix.playVideo('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" 
                                 ontouchend="fileFlix.playVideo('${item.path}', '${this.utils.sanitizeHTML(item.name)}')">Play</button>`;
            } else if (item.type === 'image' || (item.type === 'document' && item.name.toLowerCase().endsWith('.pdf'))) {
                primaryAction = `<button class="action-btn primary" onclick="fileFlix.previewFile('${item.path}', '${item.type}')" 
                                 ontouchend="fileFlix.previewFile('${item.path}', '${item.type}')">View</button>`;
            } else {
                primaryAction = `<button class="action-btn primary" onclick="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" 
                                 ontouchend="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')">Open</button>`;
            }

            const downloadAction = !isFolder 
                ? `<button class="action-btn" onclick="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" 
                    ontouchend="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')">Download</button>` 
                : '';

            const deleteAction = (this.isHost && !isFolder)
                ? `<button class="action-btn danger" onclick="fileFlix.deleteFile('${item.path}')" 
                    ontouchend="fileFlix.deleteFile('${item.path}')">Delete</button>`
                : '';

            return `${primaryAction}${downloadAction}${deleteAction}`;
        }

        createListFileActions(item) {
            const isFolder = item.type === 'folder';
            let primaryAction = '';
            if (isFolder) {
                primaryAction = `<button class="list-action-btn" onclick="fileFlix.navigateToPath('${item.path}')" 
                                 ontouchend="fileFlix.navigateToPath('${item.path}')" title="Open"><i class="fas fa-folder-open"></i></button>`;
            } else if (item.type === 'video') {
                primaryAction = `<button class="list-action-btn" onclick="fileFlix.playVideo('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" 
                                 ontouchend="fileFlix.playVideo('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" title="Play"><i class="fas fa-play"></i></button>`;
            } else if (item.type === 'image' || (item.type === 'document' && item.name.toLowerCase().endsWith('.pdf'))) {
                primaryAction = `<button class="list-action-btn" onclick="fileFlix.previewFile('${item.path}', '${item.type}')" 
                                 ontouchend="fileFlix.previewFile('${item.path}', '${item.type}')"" title="View"><i class="fas fa-eye"></i></button>`;
            } else {
                primaryAction = `<button class="list-action-btn" onclick="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" 
                                 ontouchend="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" title="Open"><i class="fas fa-external-link-alt"></i></button>`;
            }

            const downloadAction = !isFolder 
                ? `<button class="list-action-btn" onclick="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" 
                    ontouchend="fileFlix.downloadFile('${item.path}', '${this.utils.sanitizeHTML(item.name)}')" title="Download"><i class="fas fa-download"></i></button>` 
                : '';

            const deleteAction = (this.isHost && !isFolder)
                ? `<button class="list-action-btn danger" onclick="fileFlix.deleteFile('${item.path}')" 
                    ontouchend="fileFlix.deleteFile('${item.path}')" title="Delete"><i class="fas fa-trash"></i></button>`
                : '';

            return `${primaryAction}${downloadAction}${deleteAction}`;
        }

        handleFileSelect(event, element) {
            if (event.target.closest('.file-actions, .file-list-actions')) return;
            document.querySelectorAll('.file-card.selected, .file-list-item.selected').forEach(el => {
                el.classList.remove('selected');
            });
            element.classList.add('selected');
        }

        async deleteFile(path) {
            if (!this.isHost) return;
            if (!confirm(`Are you sure you want to delete "${path.split('/').pop()}"?`)) return;

            try {
                const response = await this.utils.apiRequest('/api/delete-file', {
                    method: 'POST',
                    body: { path }
                });
                if (!response.success) {
                    throw new Error(response.message || 'Failed to delete file');
                }
                this.showToast('File deleted successfully', 'success');
                await this.refreshFiles();
            } catch (error) {
                console.error('Failed to delete file:', error);
                this.showToast(error.message || 'Failed to delete file', 'error');
            }
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

            paginationHTML += `
                <button class="pagination-btn" 
                        ${page <= 1 ? 'disabled' : ''} 
                        onclick="fileFlix.loadFiles('${this.currentPath}', ${page - 1})">
                    <i class="fas fa-chevron-left"></i>
                </button>
            `;

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

        async handleSearch(query) {
            this.searchQuery = query.trim();
            await this.loadFiles(this.currentPath, 1);
        }

        async setFilter(filter) {
            if (this.currentFilter === filter) return;

            this.currentFilter = filter;
            document.querySelectorAll('.filter-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.filter === filter);
            });
            await this.loadFiles(this.currentPath, 1);
        }        setView(view) {
            if (this.currentView === view) return;

            this.currentView = view;
            
            // Update button states
            document.querySelectorAll('.view-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            const activeBtn = document.getElementById(`${view}-view-btn`);
            if (activeBtn) {
                activeBtn.classList.add('active');
            }

            // Save preference
            localStorage.setItem('preferredView', view);
            this.utils.updateURLParameter('view', view);

            // Update file explorer view
            const fileExplorer = document.getElementById('file-explorer');
            if (fileExplorer) {
                fileExplorer.className = `file-explorer ${view}-view`;
                
                // If we have files already loaded, re-render them in the new view
                if (fileExplorer.children.length > 0) {
                    // Get current files data from DOM elements
                    const currentFiles = Array.from(fileExplorer.children).map(el => ({
                        path: el.dataset.path,
                        type: el.dataset.type,
                        name: el.querySelector('.file-name, .file-list-name')?.textContent || el.dataset.name,
                        size: el.dataset.size || 0,
                        mtime: el.dataset.mtime || new Date().toISOString()
                    })).filter(file => file.path); // Filter out invalid entries
                    
                    if (currentFiles.length > 0) {
                        this.updateFileExplorer(currentFiles);
                    }
                }
            }
        }

        async navigateToPath(path) {
            this.searchQuery = '';
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = '';
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
                    src: `/api/stream/${encodeURIComponent(path)}`,
                    alt: 'Preview',
                    className: 'preview-image'
                });
                container.appendChild(img);
            } else if (type === 'document' && path.toLowerCase().endsWith('.pdf')) {
                const iframe = this.utils.createElement('iframe', {
                    src: `/api/stream/${encodeURIComponent(path)}`,
                    frameborder: '0',
                    className: 'preview-iframe'
                });
                container.appendChild(iframe);
            }

            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        downloadFile(path, filename = '') {
            const link = this.utils.createElement('a', {
                href: `/api/stream/${encodeURIComponent(path)}?download=true`,
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
            if (!this.isHost) return;
            try {
                const response = await this.utils.apiRequest('/api/system-status');
                if (!response.success) {
                    throw new Error(response.message || 'Failed to check system status');
                }
                const status = response.status;
                const systemStatusElement = document.getElementById('system-status');
                if (systemStatusElement) {
                    systemStatusElement.className = `system-status ${status.server ? 'online' : 'offline'}`;
                    systemStatusElement.title = status.server ? 'System Online' : 'System Offline';
                    document.getElementById('ffmpeg-status').textContent = status.ffmpeg ? 'Available' : 'Unavailable';
                    document.getElementById('cpu-usage').textContent = `${Math.round(status.cpu_percent)}%`;
                    document.getElementById('memory-usage').textContent = `${Math.round(status.memory_percent)}%`;
                    document.getElementById('current-directory').textContent = status.directory || 'Not set';
                }
            } catch (error) {
                console.warn('Could not check system status:', error);
                this.showToast(error.message || 'Failed to check system status', 'error');
            }
        }

        async handleDirectorySelect(event) {
            if (!this.isHost) return;
            const files = event.target.files;
            if (files.length === 0) return;

            const dirPath = files[0].webkitRelativePath.split('/')[0] || '';
            try {
                const response = await this.utils.apiRequest('/api/select-directory', {
                    method: 'POST',
                    body: { directory: dirPath }
                });
                if (!response.success) {
                    throw new Error(response.message || 'Failed to set directory');
                }
                this.currentPath = '';
                await this.loadFiles();
                this.showToast(`Directory set to ${dirPath}`, 'success');
                await this.checkSystemStatus();
            } catch (error) {
                console.error('Failed to set directory:', error);
                this.showToast(error.message || 'Error setting directory', 'error');
            }
        }

        showSystemInfo() {
            this.showToast('System status check in progress...', 'info');
            this.checkSystemStatus();
        }
    }

    // Initialize FileFlix
    window.fileFlix = new FileFlix();

    // Global event listeners
    document.addEventListener('click', (e) => {
        if (e.target.matches('#close-preview-btn') || e.target.closest('#close-preview-btn')) {
            const modal = document.getElementById('preview-modal');
            if (modal) fileFlix.closeModal(modal);
        }
        if (e.target.matches('.modal')) {
            fileFlix.closeModal(e.target);
        }
    });

    document.addEventListener('touchend', (e) => {
        if (e.target.matches('#close-preview-btn') || e.target.closest('#close-preview-btn')) {
            const modal = document.getElementById('preview-modal');
            if (modal) fileFlix.closeModal(modal);
        }
        if (e.target.matches('.modal')) {
            fileFlix.closeModal(e.target);
        }
    });

    window.addEventListener('popstate', () => {
        const path = fileFlix.utils.getURLParameter('path') || '';
        const filter = fileFlix.utils.getURLParameter('filter') || 'all';
        const view = fileFlix.utils.getURLParameter('view') || 'list';
        fileFlix.currentFilter = filter;
        fileFlix.currentView = view;
        fileFlix.loadFiles(path);
    });
});