/**
 * Utility functions for FileFlix
 */

/**
 * Debounce function to limit function calls
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function to limit function calls
 */
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Format file size to human-readable format
 */
function formatFileSize(bytes) {
    if (bytes === 0 || isNaN(bytes)) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1).replace(/\.0$/, '')} ${sizes[i]}`;
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 */
function formatDuration(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return hours > 0
        ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        : `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format video metadata (e.g., audio/subtitle tracks)
 */
function formatTrackInfo(track) {
    const lang = track.language || track.lang || 'Unknown';
    const title = track.title || `Track ${lang.toUpperCase()}`;
    return `${title} (${lang.toUpperCase()})`;
}

/**
 * Normalize file path for cross-platform compatibility
 */
function normalizePath(path) {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').trim();
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename) {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * Determine file type based on extension
 */
function getFileType(filename) {
    const ext = getFileExtension(filename);
    // Aligned with app.py ALLOWED_EXTENSIONS
    const videoExtensions = ['mp4', 'mkv', 'mov', 'avi', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'm2ts', 'vob', 'ogv', 'mpeg', 'mpg'];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'ico'];
    const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'];
    const documentExtensions = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xlsx', 'pptx', 'csv'];
    const executableExtensions = ['exe', 'msi', 'dmg', 'deb', 'rpm', 'appimage'];

    if (videoExtensions.includes(ext)) return 'video';
    if (imageExtensions.includes(ext)) return 'image';
    if (audioExtensions.includes(ext)) return 'audio';
    if (documentExtensions.includes(ext)) return 'document';
    if (executableExtensions.includes(ext)) return 'executable';
    return 'other';
}

/**
 * Get appropriate icon for file type
 */
function getFileIcon(type) {
    const icons = {
        video: 'fas fa-film',
        image: 'fas fa-image',
        audio: 'fas fa-music',
        document: 'fas fa-file-alt',
        executable: 'fas fa-cog',
        folder: 'fas fa-folder',
        other: 'fas fa-file'
    };
    return icons[type] || icons.other;
}

/**
 * Generate a hash for a string
 */
function generateHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type} show`;

    const iconMap = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    toast.innerHTML = `
        <i class="toast-icon ${iconMap[type] || iconMap.info}"></i>
        <span class="toast-message">${sanitizeHTML(message)}</span>
        <button class="toast-close" aria-label="Close toast">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(toast);

    // Handle close button
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    toast.querySelector('.toast-close').addEventListener('touchend', () => toast.remove());

    // Auto-remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 300); // Match CSS transition
    }, duration);
}

/**
 * Sanitize HTML to prevent XSS
 */
function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Get URL parameters
 */
function getURLParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name) || '';
}

/**
 * Update URL parameter without page reload
 */
function updateURLParameter(param, value) {
    const url = new URL(window.location);
    if (value) {
        url.searchParams.set(param, value);
    } else {
        url.searchParams.delete(param);
    }
    window.history.replaceState({}, '', url);
}

/**
 * Create element with attributes and content
 */
function createElement(tag, attributes = {}, content = '') {
    const element = document.createElement(tag);

    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'dataset') {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                element.dataset[dataKey] = dataValue;
            });
        } else {
            element.setAttribute(key, value);
        }
    });

    if (content) {
        element.innerHTML = content;
    }

    return element;
}

/**
 * Check if element is in viewport
 */
function isElementInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

/**
 * Smooth scroll to element
 */
function scrollToElement(element, offset = 0) {
    const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({
        top: elementPosition - offset,
        behavior: 'smooth'
    });
}

/**
 * Local storage helpers
 */
const storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Error writing to localStorage:', error);
            return false;
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error removing from localStorage:', error);
            return false;
        }
    }
};

/**
 * API request helper with timeout and network error handling
 */
async function apiRequest(endpoint, options = {}) {
    const defaultOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include' // For session cookies
    };

    const config = { ...defaultOptions, ...options };
    if (config.body && config.headers['Content-Type'] === 'application/json') {
        config.body = JSON.stringify(config.body);
    }

    // Set timeout for fetch request (10 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(endpoint, { ...config, signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error('API request timed out:', endpoint);
            throw new Error('Request timed out. Please check your network connection.');
        }
        console.error('API request failed:', error);
        throw error;
    }
}

/**
 * Performance monitoring
 */
const performance = {
    timers: new Map(),

    start(label) {
        this.timers.set(label, Date.now());
    },

    end(label) {
        const startTime = this.timers.get(label);
        if (startTime) {
            const duration = Date.now() - startTime;
            console.log(`⏱️ ${label}: ${duration}ms`);
            this.timers.delete(label);
            return duration;
        }
        return null;
    }
};

/**
 * Keyboard shortcut handler
 */
class KeyboardShortcuts {
    constructor() {
        this.shortcuts = new Map();
        this.enabled = true;
        this.init();
    }

    init() {
        document.addEventListener('keydown', (event) => {
            if (!this.enabled || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

            const key = this.getKeyString(event);
            const handler = this.shortcuts.get(key);

            if (handler) {
                event.preventDefault();
                handler(event);
            }
        });
    }

    getKeyString(event) {
        const parts = [];
        if (event.ctrlKey) parts.push('ctrl');
        if (event.altKey) parts.push('alt');
        if (event.shiftKey) parts.push('shift');
        if (event.metaKey) parts.push('meta');
        parts.push(event.key.toLowerCase());
        return parts.join('+');
    }

    register(key, handler) {
        this.shortcuts.set(key.toLowerCase(), handler);
    }

    unregister(key) {
        this.shortcuts.delete(key.toLowerCase());
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }
}

// Export utilities
window.FileFlix = window.FileFlix || {};
window.FileFlix.utils = {
    debounce,
    throttle,
    formatFileSize,
    formatDuration,
    formatTrackInfo,
    normalizePath,
    getFileExtension,
    getFileType,
    getFileIcon,
    generateHash,
    showToast,
    sanitizeHTML,
    getURLParameter,
    updateURLParameter,
    createElement,
    isElementInViewport,
    scrollToElement,
    storage,
    apiRequest,
    performance,
    KeyboardShortcutsClass: KeyboardShortcuts,
    KeyboardShortcuts: new KeyboardShortcuts()
};