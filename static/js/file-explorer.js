// static/js/file-explorer.js

let currentPath = '';
let allFiles = [];
let filteredFiles = [];
let currentView = 'grid'; // 'grid' or 'list'
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    // Load files from root directory
    loadFiles('');
    
    // Set up event listeners
    setupExplorerEventListeners();
});

function setupExplorerEventListeners() {
    // Search functionality
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => setActiveFilter(btn.dataset.filter));
    });
    
    // View toggle buttons
    document.getElementById('gridViewBtn').addEventListener('click', () => setViewMode('grid'));
    document.getElementById('listViewBtn').addEventListener('click', () => setViewMode('list'));
    
    // Breadcrumb home button
    document.querySelector('.breadcrumb-home button').addEventListener('click', () => navigateTo(''));
}

async function loadFiles(path) {
    currentPath = path;
    document.getElementById('loading').style.display = 'flex';
    
    try {
        const response = await fetch(`/files?path=${encodeURIComponent(path)}`);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Update breadcrumb navigation
        updateBreadcrumb(data.breadcrumb);
        
        // Store files and folders
        allFiles = [...data.folders, ...data.files];
        
        // Apply current filter
        applyFilters();
        
    } catch (error) {
        console.error('Error loading files:', error);
        document.getElementById('fileExplorer').innerHTML = 
            `<div class="error-message">Error loading files: ${error.message}</div>`;
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function updateBreadcrumb(breadcrumbData) {
    const container = document.getElementById('breadcrumbPath');
    container.innerHTML = '';
    
    if (breadcrumbData && breadcrumbData.length > 0) {
        breadcrumbData.forEach((item, index) => {
            const breadcrumbItem = document.createElement('button');
            breadcrumbItem.className = 'breadcrumb-item';
            breadcrumbItem.textContent = item.name;
            breadcrumbItem.dataset.path = item.path;
            breadcrumbItem.addEventListener('click', () => navigateTo(item.path));
            
            container.appendChild(breadcrumbItem);
            
            // Add separator except for the last item
            if (index < breadcrumbData.length - 1) {
                const separator = document.createElement('span');
                separator.className = 'breadcrumb-separator';
                separator.innerHTML = '<i class="fas fa-chevron-right"></i>';
                container.appendChild(separator);
            }
        });
    }
}

function navigateTo(path) {
    loadFiles(path);
}

function renderFileExplorer() {
    const explorer = document.getElementById('fileExplorer');
    explorer.innerHTML = '';
    
    if (filteredFiles.length === 0) {
        explorer.innerHTML = '<div class="empty-folder">No files match the current filter or search.</div>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    // Create file/folder cards
    filteredFiles.forEach(item => {
        const fileCard = createFileCard(item);
        fragment.appendChild(fileCard);
    });
    
    explorer.appendChild(fragment);
}

function createFileCard(item) {
    const card = document.createElement('div');
    card.className = 'file-card';
    
    const isFolder = item.type === 'folder';
    const iconClass = getIconClass(item.type);
    const encodedPath = encodeURIComponent(item.path);
    
    if (currentView === 'grid') {
        card.innerHTML = `
            <div class="file-thumbnail" ${isFolder ? `onclick="navigateTo('${encodedPath}')"` : 
                item.type === 'video' ? `onclick="playVideo('${encodedPath}', '${item.name}')"` :
                item.type === 'image' ? `onclick="openPreview('${encodedPath}', 'image')"` :
                item.type === 'document' && item.name.toLowerCase().endsWith('.pdf') ? 
                    `onclick="openPreview('${encodedPath}', 'document')"` : ''}>
                ${isFolder ? 
                    `<div class="folder-icon"><i class="${iconClass}"></i></div>` :
                    item.type === 'video' ? 
                        `<img src="/thumbnail/${encodedPath}" alt="${item.name}" loading="lazy" onerror="this.onerror=null;this.src='/static/images/fallback.jpg';">
                         <div class="play-overlay"><div class="play-button-outer"><div class="play-button-inner">▶</div></div></div>` :
                    item.type === 'image' ? 
                        `<img src="/file/${encodedPath}" alt="${item.name}" loading="lazy" class="image-thumbnail">` :
                        `<div class="file-icon"><i class="${iconClass}"></i></div>`
                }
            </div>
            <div class="file-info">
                <h3 class="file-title" title="${item.name}">${item.name}</h3>
                <div class="file-meta">
                    ${!isFolder ? `<span class="file-size">${formatFileSize(item.size)}</span>` : ''}
                    <span class="file-type">${formatFileType(item.type)}</span>
                </div>
                <div class="file-actions">
                    ${isFolder ? 
                        `<button class="action-btn primary" onclick="navigateTo('${encodedPath}')">Open</button>` :
                    item.type === 'video' ? 
                        `<button class="action-btn primary" onclick="playVideo('${encodedPath}', '${item.name}')">Play</button>` :
                    item.type === 'image' || (item.type === 'document' && item.name.toLowerCase().endsWith('.pdf')) ? 
                        `<button class="action-btn primary" onclick="openPreview('${encodedPath}', '${item.type}')">View</button>` :
                        `<button class="action-btn primary" onclick="window.open('/file/${encodedPath}', '_blank')">Open</button>`
                    }
                    ${!isFolder ? `<button class="action-btn" onclick="downloadFile('${encodedPath}', '${item.name}')">Download</button>` : ''}
                </div>
            </div>
        `;
    } else {
        // List view
        card.className = 'file-list-item';
        card.innerHTML = `
            <div class="file-list-icon">
                <i class="${iconClass}"></i>
            </div>
            <div class="file-list-name" title="${item.name}">
                ${item.name}
            </div>
            <div class="file-list-type">
                ${formatFileType(item.type)}
            </div>
            <div class="file-list-size">
                ${!isFolder ? formatFileSize(item.size) : '-'}
            </div>
            <div class="file-list-actions">
                ${isFolder ? 
                    `<button class="list-action-btn" onclick="navigateTo('${encodedPath}')" title="Open">
                        <i class="fas fa-folder-open"></i>
                    </button>` :
                item.type === 'video' ? 
                    `<button class="list-action-btn" onclick="playVideo('${encodedPath}', '${item.name}')" title="Play">
                        <i class="fas fa-play"></i>
                    </button>` :
                item.type === 'image' || (item.type === 'document' && item.name.toLowerCase().endsWith('.pdf')) ? 
                    `<button class="list-action-btn" onclick="openPreview('${encodedPath}', '${item.type}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>` :
                    `<button class="list-action-btn" onclick="window.open('/file/${encodedPath}', '_blank')" title="Open">
                        <i class="fas fa-external-link-alt"></i>
                    </button>`
                }
                ${!isFolder ? 
                    `<button class="list-action-btn" onclick="downloadFile('${encodedPath}', '${item.name}')" title="Download">
                        <i class="fas fa-download"></i>
                    </button>` : 
                    ''
                }
            </div>
        `;
    }
    
    return card;
}

function getIconClass(fileType) {
    switch(fileType) {
        case 'folder': return 'fas fa-folder';
        case 'video': return 'fas fa-film';
        case 'image': return 'fas fa-image';
        case 'audio': return 'fas fa-music';
        case 'document': return 'fas fa-file-alt';
        default: return 'fas fa-file';
    }
}

function formatFileType(fileType) {
    return fileType.charAt(0).toUpperCase() + fileType.slice(1);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

function setViewMode(mode) {
    currentView = mode;
    
    // Update button states
    document.getElementById('gridViewBtn').classList.toggle('active', mode === 'grid');
    document.getElementById('listViewBtn').classList.toggle('active', mode === 'list');
    
    // Update explorer class
    const explorer = document.getElementById('fileExplorer');
    explorer.className = `file-explorer ${mode}-view`;
    
    // Re-render files with new view
    renderFileExplorer();
}

function setActiveFilter(filter) {
    currentFilter = filter;
    
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    // Apply filters
    applyFilters();
}

function handleSearch() {
    applyFilters();
}

function applyFilters() {
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();
    
    // Filter files based on search and type filter
    filteredFiles = allFiles.filter(item => {
        const nameMatch = item.name.toLowerCase().includes(searchQuery);
        const typeMatch = currentFilter === 'all' || item.type === currentFilter;
        return nameMatch && typeMatch;
    });
    
    // Sort folders first, then files alphabetically
    filteredFiles.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
    });
    
    // Render the filtered files
    renderFileExplorer();
}

function downloadFile(path, filename) {
    const a = document.createElement('a');
    a.href = `/file/${path}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}