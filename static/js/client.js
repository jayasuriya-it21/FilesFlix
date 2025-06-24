let allMediaFiles = [];
let filteredFiles = [];
let currentPlayer = null;
let activePlaybackPath = null;
let currentVideoMetadata = null;
let currentVideoHash = null;
let previewThumbnails = [];

document.addEventListener('DOMContentLoaded', () => {
    loadMediaFiles();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => setActiveFilter(btn.dataset.filter));
    });
    document.addEventListener('keydown', e => {
        if (document.getElementById('videoModal').classList.contains('active')) {
            if (e.key === 'Escape') {
                closeVideo();
            } else if (e.key === 'ArrowRight') {
                seekVideo(10);
            } else if (e.key === 'ArrowLeft') {
                seekVideo(-10);
            } else if (e.key === ' ') {
                e.preventDefault();
                togglePlayPause();
            }
        }
    });
    document.getElementById('videoModal').addEventListener('click', function(e) {
        if (e.target === this) closeVideo();
    });
    
    document.getElementById('seekForward').addEventListener('click', () => seekVideo(10));
    document.getElementById('seekBackward').addEventListener('click', () => seekVideo(-10));
}

async function loadMediaFiles() {
    document.getElementById('loading').style.display = 'flex';
    try {
        const response = await fetch('/files');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const files = await response.json();

        allMediaFiles = files.map(file => ({
            ...file,
            type: getFileType(file.name),
            size: formatFileSize(file.size),
            modified: new Date(file.modified * 1000).toLocaleDateString()
        }));

        setActiveFilter('all'); // Initial render
    } catch (error) {
        console.error('Error loading files:', error);
        document.getElementById('mediaGrid').innerHTML = `<p class="error-message">Error loading files. Is the media directory set correctly?</p>`;
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function renderMediaGrid() {
    const grid = document.getElementById('mediaGrid');
    grid.innerHTML = '';

    if (filteredFiles.length === 0) {
        grid.innerHTML = '<p class="info-message">No files match the current filter or search.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    filteredFiles.forEach(file => fragment.appendChild(createMediaCard(file)));
    grid.appendChild(fragment);
}

function createMediaCard(file) {
    const card = document.createElement('div');
    card.className = 'media-card';
    const typeLabel = file.type.charAt(0).toUpperCase() + file.type.slice(1);
    const encodedPath = encodeURIComponent(file.path);
    const isVideo = file.type === 'video';

    card.innerHTML = `
        <div class="media-thumbnail" onclick="${isVideo ? `playVideo('${encodedPath}')` : ''}">
            ${createThumbnail(file)}
            ${isVideo ? '<div class="play-overlay"><div class="play-button-outer"><div class="play-button-inner">▶</div></div></div>' : ''}
        </div>
        <div class="media-info">
            <h3 class="media-title">${file.name}</h3>
            <div class="media-meta">
                <span class="media-type">${typeLabel}</span>
                <span>${file.size}</span>
            </div>
            <div class="media-actions">
                ${isVideo ? 
                    `<button class="action-btn primary" onclick="playVideo('${encodedPath}')">Play</button>` :
                    `<button class="action-btn primary" onclick="openFile('${encodedPath}')">Open</button>`
                }
                <button class="action-btn" onclick="downloadFile('${encodedPath}', '${file.name}')">Download</button>
            </div>
        </div>`;
    return card;
}

function createThumbnail(file) {
    const encodedPath = encodeURIComponent(file.path);
    if (file.type === 'video') {
        return `<img src="/thumbnail/${encodedPath}" alt="${file.name}" loading="lazy" onerror="this.onerror=null;this.src='/static/images/fallback.jpg';">`;
    }
    if (file.type === 'image') {
        return `<img src="/file/${encodedPath}" alt="${file.name}" loading="lazy">`;
    }
    const icon = file.type === 'document' ? '📄' : '📁';
    return `<div class="media-placeholder">${icon}</div>`;
}

async function playVideo(filePath) {
    activePlaybackPath = filePath;
    if (currentPlayer) {
        currentPlayer.dispose();
        currentPlayer = null;
    }

    const modal = document.getElementById('videoModal');
    const container = document.getElementById('videoPlayerContainer');

    container.innerHTML = `
        <div class="video-loading">
            <div class="spinner-wrapper">
                <div class="spinner"></div>
            </div>
            <p>Preparing your video...</p>
        </div>`;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    try {
        const metadataResponse = await fetch(`/metadata/${filePath}`);
        if (metadataResponse.ok) {
            currentVideoMetadata = await metadataResponse.json();
        } else {
            currentVideoMetadata = null;
        }
    } catch (error) {
        console.error("Error fetching metadata:", error);
        currentVideoMetadata = null;
    }

    currentVideoHash = getFileHash(filePath);

    container.innerHTML = `
        <video id="videoPlayer" class="video-js vjs-ott-skin" controls preload="auto">
            <p class="vjs-no-js">To view this video please enable JavaScript, and consider upgrading to a web browser that supports HTML5 video</p>
        </video>`;
    
    currentPlayer = videojs('videoPlayer', {
        fluid: true,
        responsive: true,
        aspectRatio: '16:9',
        autoplay: true,
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        controlBar: {
            volumePanel: {inline: false},
            children: [
                'playToggle',
                'progressControl',
                'currentTimeDisplay',
                'timeDivider',
                'durationDisplay',
                'audioTrackButton',
                'subsCapsButton',
                'volumePanel',
                'playbackRateMenuButton',
                'fullscreenToggle'
            ]
        },
        html5: {
            vhs: {
                overrideNative: true,
                enableLowInitialPlaylist: true,
                limitRenditionByPlayerDimensions: true
            },
            nativeVideoTracks: false,
            nativeAudioTracks: false,
            nativeTextTracks: false
        }
    });

    loadPreviewThumbnails(currentVideoHash);

    currentPlayer.src({
        src: `/stream/${filePath}`,
        type: 'video/mp4'
    });

    currentPlayer.on('error', function() {
        if (activePlaybackPath !== filePath) return;

        console.log('Direct streaming failed, trying HLS...');
        const hlsSrc = `/hls/${filePath}`;

        if (Hls.isSupported()) {
            const hls = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 600,
                enableWorker: true,
                lowLatencyMode: false,
            });

            hls.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal) {
                    console.error('HLS.js error:', data);
                    showPlaybackError();
                }
            });

            hls.loadSource(hlsSrc);
            hls.attachMedia(currentPlayer.tech().el());

            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                currentPlayer.play();
                loadAudioAndSubtitleTracks(currentVideoHash);
            });

            currentPlayer.tech().on('retry', function() {
                hls.loadSource(hlsSrc);
            });
        } else if (currentPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            currentPlayer.src({
                src: hlsSrc,
                type: 'application/x-mpegURL'
            });
            currentPlayer.play();
            loadAudioAndSubtitleTracks(currentVideoHash);
        } else {
            showPlaybackError();
        }
    });

    currentPlayer.on('loadedmetadata', function() {
        loadAudioAndSubtitleTracks(currentVideoHash);
    });
}

async function loadPreviewThumbnails(videoHash) {
    try {
        previewThumbnails = [];
        for (let i = 0; i < 10; i++) {
            const previewUrl = `/hls/${videoHash}/previews/preview_${i}.jpg`;
            const response = await fetch(previewUrl, { method: 'HEAD' });
            if (response.ok) {
                previewThumbnails.push(previewUrl);
            }
        }

        if (previewThumbnails.length > 0) {
            setupThumbnailPreview();
        }
    } catch (error) {
        console.log("No preview thumbnails available:", error);
    }
}

function setupThumbnailPreview() {
    if (!currentPlayer || previewThumbnails.length === 0) return;

    const progressControl = currentPlayer.controlBar.progressControl.el();
    const thumbnailPreview = document.createElement('div');
    thumbnailPreview.className = 'vjs-thumbnail-preview';
    thumbnailPreview.innerHTML = '<img src="" alt="Preview">';
    progressControl.appendChild(thumbnailPreview);

    const previewImg = thumbnailPreview.querySelector('img');

    progressControl.addEventListener('mousemove', function(e) {
        const bounds = progressControl.getBoundingClientRect();
        const mousePosition = (e.clientX - bounds.left) / bounds.width;

        const thumbnailIndex = Math.min(
            Math.floor(mousePosition * previewThumbnails.length),
            previewThumbnails.length - 1
        );

        thumbnailPreview.style.display = 'block';
        thumbnailPreview.style.left = `${mousePosition * 100}%`;
        previewImg.src = previewThumbnails[thumbnailIndex];

        if (currentPlayer.duration()) {
            const timePosition = mousePosition * currentPlayer.duration();
            const minutes = Math.floor(timePosition / 60);
            const seconds = Math.floor(timePosition % 60);
            const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

            let timeTooltip = thumbnailPreview.querySelector('.time-tooltip');
            if (!timeTooltip) {
                timeTooltip = document.createElement('div');
                timeTooltip.className = 'time-tooltip';
                thumbnailPreview.appendChild(timeTooltip);
            }
            timeTooltip.textContent = timeString;
        }
    });

    progressControl.addEventListener('mouseout', function() {
        thumbnailPreview.style.display = 'none';
    });

    progressControl.addEventListener('click', function(e) {
        const bounds = progressControl.getBoundingClientRect();
        const clickPosition = (e.clientX - bounds.left) / bounds.width;

        if (currentPlayer.duration()) {
            const seekTime = clickPosition * currentPlayer.duration();
            currentPlayer.currentTime(seekTime);
        }
    });
}

async function loadAudioAndSubtitleTracks(videoHash) {
    if (!currentPlayer) return;

    try {
        const response = await fetch(`/hls/${videoHash}/variants.json`);
        if (!response.ok) {
            console.warn("No variants found for this video");
            return;
        }

        const variants = await response.json();

        if (variants.audio_tracks && variants.audio_tracks.length > 0) {
            const audioTrackList = currentPlayer.audioTracks();

            while (audioTrackList.length > 0) {
                audioTrackList.removeTrack(audioTrackList[0]);
            }

            variants.audio_tracks.forEach((track, index) => {
                audioTrackList.addTrack(new videojs.AudioTrack({
                    id: `audio-${track.index}`,
                    kind: 'alternative',
                    label: track.title || `Audio Track ${index + 1} (${track.language})`,
                    language: track.language,
                    enabled: index === 0
                }));
            });
        }

        if (variants.subtitle_tracks && variants.subtitle_tracks.length > 0) {
            const existingTracks = Array.from(currentPlayer.textTracks());
            existingTracks.forEach(track => {
                currentPlayer.removeRemoteTextTrack(track);
            });

            variants.subtitle_tracks.forEach((track, index) => {
                currentPlayer.addRemoteTextTrack({
                    kind: 'subtitles',
                    src: `/hls/${videoHash}/subtitle_${track.index}.vtt`,
                    srclang: track.language,
                    label: track.title || `Subtitle ${index + 1} (${track.language})`,
                    default: index === 0
                }, false);
            });
        }
    } catch (error) {
        console.error("Error loading tracks:", error);
    }
}

function seekVideo(seconds) {
    if (!currentPlayer) return;

    const currentTime = currentPlayer.currentTime();
    const newTime = Math.max(0, currentTime + seconds);

    const direction = seconds > 0 ? 'forward' : 'backward';
    const button = document.querySelector(`.seek-${direction}`);

    button.classList.add('active');
    setTimeout(() => button.classList.remove('active'), 500);

    currentPlayer.currentTime(newTime);

    if (currentPlayer.paused()) {
        currentPlayer.play();
    }
}

function togglePlayPause() {
    if (!currentPlayer) return;

    if (currentPlayer.paused()) {
        currentPlayer.play();
    } else {
        currentPlayer.pause();
    }
}

function getFileHash(filePath) {
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
        const char = filePath.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

function showPlaybackError() {
    const container = document.getElementById('videoPlayerContainer');
    container.innerHTML = `
        <div class="playback-error">
            <h3>Playback Error</h3>
            <p>Sorry, this video cannot be played. It may be in an unsupported format or have audio/video codec issues.</p>
            <button class="action-btn primary" onclick="closeVideo()">Close</button>
        </div>`;
}

function closeVideo() {
    if (currentPlayer) {
        currentPlayer.dispose();
        currentPlayer = null;
    }
    document.getElementById('videoModal').classList.remove('active');
    document.body.style.overflow = '';
    activePlaybackPath = null;
    currentVideoMetadata = null;
    currentVideoHash = null;
    previewThumbnails = [];
}

const getFileType = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    if (['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'm4v'].includes(ext)) return 'video';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
    if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return 'document';
    return 'other';
};

const formatFileSize = (b) => (b === 0) ? '0 B' : ( (b, d = 2, k = 1024) => parseFloat((b / Math.pow(k, Math.floor(Math.log(b) / Math.log(k)))).toFixed(d)) + ' ' + ['B','KB','MB','GB'][Math.floor(Math.log(b)/Math.log(k))])(b);

const openFile = (p) => window.open(`/file/${p}`, '_blank');

const downloadFile = (p, n) => {
    const a = document.createElement('a');
    a.href = `/file/${p}`;
    a.download = n;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

const setActiveFilter = (filter) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
    applyFilters();
};

const handleSearch = () => applyFilters();

const applyFilters = () => {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;

    filteredFiles = allMediaFiles.filter(file => {
        const nameMatch = file.name.toLowerCase().includes(query);
        const typeMatch = activeFilter === 'all' || file.type === activeFilter;
        return nameMatch && typeMatch;
    });
    renderMediaGrid();
    updateStats();
};

const updateStats = () => {
    document.getElementById('mediaStats').textContent = `${filteredFiles.length} item(s)`;
};