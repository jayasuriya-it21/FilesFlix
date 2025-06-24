// static/js/vlc-player.js

let vlcPlayer = null;
let activePlaybackPath = null;
let currentVideoMetadata = null;
let isControlsVisible = true;
let controlsTimeout = null;
let currentVolume = 100;
let isDragging = false;
let previewThumbnails = [];
let mediaLength = 0;
let libvlc = null;

// Initialize the VLC player when libVLC is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if LibVLC is available
    if (typeof LibVLC !== 'undefined') {
        initializeVlcPlayer();
    } else {
        console.warn("LibVLC.js not found. Falling back to direct streaming.");
    }
    
    setupPlayerControls();
});

function initializeVlcPlayer() {
    try {
        // Create a new LibVLC instance
        libvlc = new LibVLC({
            debug: true,
            autoplay: false,
            enableAudio: true,
            enableVideo: true,
            enableHardwareDecoding: true
        });
        
        console.log("LibVLC initialized successfully");
    } catch (error) {
        console.error("Failed to initialize LibVLC:", error);
    }
}

function setupPlayerControls() {
    // Play/Pause
    document.getElementById('playPauseButton').addEventListener('click', togglePlayPause);
    
    // Seek controls
    document.getElementById('seekForward').addEventListener('click', () => seekVideo(10));
    document.getElementById('seekBackward').addEventListener('click', () => seekVideo(-10));
    
    // Volume controls
    document.getElementById('volumeButton').addEventListener('click', toggleMute);
    document.getElementById('volume-slider').addEventListener('input', setVolume);
    
    // Fullscreen
    document.getElementById('fullscreenButton').addEventListener('click', toggleFullscreen);
    
    // Menu toggles
    document.getElementById('audioTrackButton').addEventListener('click', () => toggleMenu('audioTrackMenu'));
    document.getElementById('subtitleButton').addEventListener('click', () => toggleMenu('subtitleMenu'));
    document.getElementById('playbackSpeedButton').addEventListener('click', () => toggleMenu('playbackSpeedMenu'));
    document.getElementById('aspectRatioButton').addEventListener('click', () => toggleMenu('aspectRatioMenu'));
    document.getElementById('deinterlaceButton').addEventListener('click', () => toggleMenu('deinterlaceMenu'));
    
    // Progress bar interaction
    const progressBar = document.querySelector('.progress-bar');
    progressBar.addEventListener('click', seekToPosition);
    progressBar.addEventListener('mousedown', startDragging);
    document.addEventListener('mouseup', stopDragging);
    document.addEventListener('mousemove', handleDrag);
    progressBar.addEventListener('mousemove', showPreview);
    progressBar.addEventListener('mouseout', hidePreview);
    
    // Playback speed selection
    document.querySelectorAll('#speedOptions .menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const speed = parseFloat(e.target.dataset.speed);
            setPlaybackSpeed(speed);
            toggleMenu('playbackSpeedMenu');
        });
    });
    
    // Aspect ratio selection
    document.querySelectorAll('#aspectRatioOptions .menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const ratio = e.target.dataset.ratio;
            setAspectRatio(ratio);
            toggleMenu('aspectRatioMenu');
        });
    });
    
    // Deinterlace options
    document.querySelectorAll('#deinterlaceOptions .menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const mode = e.target.dataset.deinterlace;
            setDeinterlaceMode(mode);
            toggleMenu('deinterlaceMenu');
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeypress);
    
    // Auto-hide controls
    document.getElementById('vlc-player-container').addEventListener('mousemove', showControls);
    
    // Modal close on background click
    document.getElementById('videoModal').addEventListener('click', function(e) {
        if (e.target === this) closeVideo();
    });
}

// Play a video using VLC
async function playVideo(filePath, fileName) {
    activePlaybackPath = filePath;
    
    const modal = document.getElementById('videoModal');
    const playerContainer = document.getElementById('vlc-player');
    const videoTitle = document.getElementById('video-title');
    
    // Set video title
    videoTitle.textContent = fileName || filePath.split('/').pop();
    
    // Show loading state
    playerContainer.innerHTML = `
        <div class="video-loading">
            <div class="spinner"></div>
            <p>Loading VLC Player...</p>
        </div>`;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    try {
        // Try to fetch video metadata
        const metadataResponse = await fetch(`/metadata/${filePath}`);
        if (metadataResponse.ok) {
            currentVideoMetadata = await metadataResponse.json();
            console.log("Video metadata:", currentVideoMetadata);
        } else {
            console.warn("Failed to get video metadata");
        }
    } catch (error) {
        console.warn("Error fetching metadata:", error);
    }
    
    // Generate hash for this video (for thumbnails and other resources)
    const videoHash = getFileHash(filePath);
    
    try {
        if (libvlc) {
            // Create VLC player instance
            if (vlcPlayer) {
                vlcPlayer.destroy();
            }
            
            // Clear the container
            playerContainer.innerHTML = '';
            
            // Create the media element
            vlcPlayer = libvlc.createPlayer({
                element: playerContainer,
                autoplay: true,
                mediaOptions: {
                    hardwareDecoding: true,
                }
            });
            
            // Load the media
            const mediaUrl = `/stream/${filePath}`;
            vlcPlayer.load(mediaUrl);
            
            // Set up event listeners
            vlcPlayer.on('playing', () => {
                updatePlayPauseButton(true);
                startTimeUpdate();
                mediaLength = vlcPlayer.length;
                updateTotalTime(mediaLength);
                
                // Update tracks
                populateAudioTracks();
                populateSubtitleTracks();
            });
            
            vlcPlayer.on('paused', () => {
                updatePlayPauseButton(false);
            });
            
            vlcPlayer.on('ended', () => {
                updatePlayPauseButton(false);
            });
            
            vlcPlayer.on('error', (error) => {
                console.error("VLC player error:", error);
                fallbackToDirectStreaming(filePath);
            });
            
            // Load preview thumbnails
            loadPreviewThumbnails(videoHash);
            
            // Show controls initially then hide after delay
            showControls();
            
        } else {
            // Fall back to direct streaming if LibVLC is not available
            fallbackToDirectStreaming(filePath);
        }
    } catch (error) {
        console.error("Error initializing VLC player:", error);
        fallbackToDirectStreaming(filePath);
    }
}

// Fallback to direct streaming if VLC fails
function fallbackToDirectStreaming(filePath) {
    const playerContainer = document.getElementById('vlc-player');
    
    playerContainer.innerHTML = `
        <video id="direct-player" controls autoplay>
            <source src="/stream/${filePath}" type="video/mp4">
            Your browser does not support HTML5 video.
        </video>
    `;
    
    const directPlayer = document.getElementById('direct-player');
    
    directPlayer.addEventListener('play', () => {
        updatePlayPauseButton(true);
    });
    
    directPlayer.addEventListener('pause', () => {
        updatePlayPauseButton(false);
    });
    
    directPlayer.addEventListener('ended', () => {
        updatePlayPauseButton(false);
    });
    
    // Map our custom controls to the native video element
    document.getElementById('playPauseButton').addEventListener('click', () => {
        if (directPlayer.paused) {
            directPlayer.play();
        } else {
            directPlayer.pause();
        }
    });
    
    document.getElementById('seekForward').addEventListener('click', () => {
        directPlayer.currentTime += 10;
    });
    
    document.getElementById('seekBackward').addEventListener('click', () => {
        directPlayer.currentTime = Math.max(0, directPlayer.currentTime - 10);
    });
}

// Populate audio tracks in the menu
function populateAudioTracks() {
    const audioTracksMenu = document.getElementById('audioTrackOptions');
    audioTracksMenu.innerHTML = '';
    
    if (!vlcPlayer) return;
    
    const tracks = vlcPlayer.audioTracks;
    if (!tracks || tracks.length <= 1) {
        audioTracksMenu.innerHTML = '<p class="menu-info">No audio tracks available</p>';
        return;
    }
    
    tracks.forEach((track, index) => {
        const trackItem = document.createElement('button');
        trackItem.className = 'menu-item' + (track.selected ? ' selected' : '');
        trackItem.textContent = track.title || `Audio Track ${index + 1} (${track.language || 'Unknown'})`;
        trackItem.addEventListener('click', () => {
            vlcPlayer.selectAudioTrack(track.id);
            toggleMenu('audioTrackMenu');
            
            // Update selection UI
            document.querySelectorAll('#audioTrackOptions .menu-item').forEach(item => {
                item.classList.remove('selected');
            });
            trackItem.classList.add('selected');
        });
        audioTracksMenu.appendChild(trackItem);
    });
}

// Populate subtitle tracks in the menu
function populateSubtitleTracks() {
    const subtitleMenu = document.getElementById('subtitleOptions');
    subtitleMenu.innerHTML = '';
    
    if (!vlcPlayer) return;
    
    const tracks = vlcPlayer.subtitleTracks;
    
    // Add "Disable subtitles" option
    const disableItem = document.createElement('button');
    disableItem.className = 'menu-item' + (!vlcPlayer.subtitleTrack ? ' selected' : '');
    disableItem.textContent = 'Disable Subtitles';
    disableItem.addEventListener('click', () => {
        vlcPlayer.disableSubtitles();
        toggleMenu('subtitleMenu');
        
        // Update selection UI
        document.querySelectorAll('#subtitleOptions .menu-item').forEach(item => {
            item.classList.remove('selected');
        });
        disableItem.classList.add('selected');
    });
    subtitleMenu.appendChild(disableItem);
    
    if (!tracks || tracks.length === 0) {
        subtitleMenu.innerHTML += '<p class="menu-info">No subtitle tracks available</p>';
        return;
    }
    
    tracks.forEach((track, index) => {
        const trackItem = document.createElement('button');
        trackItem.className = 'menu-item' + (track.selected ? ' selected' : '');
        trackItem.textContent = track.title || `Subtitle Track ${index + 1} (${track.language || 'Unknown'})`;
        trackItem.addEventListener('click', () => {
            vlcPlayer.selectSubtitleTrack(track.id);
            toggleMenu('subtitleMenu');
            
            // Update selection UI
            document.querySelectorAll('#subtitleOptions .menu-item').forEach(item => {
                item.classList.remove('selected');
            });
            trackItem.classList.add('selected');
        });
        subtitleMenu.appendChild(trackItem);
    });
}

// Toggle play/pause
function togglePlayPause() {
    if (!vlcPlayer) return;
    
    if (vlcPlayer.playing) {
        vlcPlayer.pause();
    } else {
        vlcPlayer.play();
    }
}

// Update play/pause button state
function updatePlayPauseButton(isPlaying) {
    const button = document.getElementById('playPauseButton');
    button.innerHTML = isPlaying ? 
        '<i class="fas fa-pause"></i>' : 
        '<i class="fas fa-play"></i>';
}

// Seek forward or backward
function seekVideo(seconds) {
    if (!vlcPlayer) return;
    
    const currentTime = vlcPlayer.time;
    const newTime = Math.max(0, currentTime + (seconds * 1000)); // VLC uses milliseconds
    vlcPlayer.time = newTime;
    
    // Show seek animation
    const direction = seconds > 0 ? 'forward' : 'backward';
    const button = document.getElementById('seek' + (direction.charAt(0).toUpperCase() + direction.slice(1)));
    
    button.classList.add('active');
    setTimeout(() => button.classList.remove('active'), 500);
}

// Update time display during playback
function startTimeUpdate() {
    if (!vlcPlayer) return;
    
    const updateProgressBar = () => {
        if (!vlcPlayer) return;
        
        const currentTime = vlcPlayer.time; // in milliseconds
        const duration = vlcPlayer.length; // in milliseconds
        
        if (duration > 0 && !isDragging) {
            const progress = (currentTime / duration) * 100;
            document.getElementById('progress-fill').style.width = `${progress}%`;
            document.getElementById('progress-thumb').style.left = `${progress}%`;
            
            // Update current time display
            document.getElementById('current-time').textContent = formatTime(currentTime / 1000);
        }
        
        // Continue updating if playing
        if (vlcPlayer.playing) {
            requestAnimationFrame(updateProgressBar);
        }
    };
    
    requestAnimationFrame(updateProgressBar);
}

// Format time in seconds to MM:SS or HH:MM:SS
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// Update total time display
function updateTotalTime(totalTimeMs) {
    document.getElementById('total-time').textContent = formatTime(totalTimeMs / 1000);
}

// Show controls when moving mouse
function showControls() {
    const controls = document.querySelector('.vlc-controls');
    
    if (!controls) return;
    
    if (!isControlsVisible) {
        controls.classList.add('visible');
        isControlsVisible = true;
    }
    
    // Clear existing timeout
    if (controlsTimeout) {
        clearTimeout(controlsTimeout);
    }
    
    // Set new timeout to hide controls
    controlsTimeout = setTimeout(() => {
        if (!document.querySelector('.vlc-menu.visible')) {
            controls.classList.remove('visible');
            isControlsVisible = false;
        }
    }, 3000);
}

// Toggle fullscreen
function toggleFullscreen() {
    const container = document.getElementById('vlc-player-container');
    
    if (document.fullscreenElement) {
        document.exitFullscreen();
        document.getElementById('fullscreenButton').innerHTML = '<i class="fas fa-expand"></i>';
    } else {
        container.requestFullscreen();
        document.getElementById('fullscreenButton').innerHTML = '<i class="fas fa-compress"></i>';
    }
}

// Toggle mute
function toggleMute() {
    if (!vlcPlayer) return;
    
    if (vlcPlayer.muted) {
        vlcPlayer.muted = false;
        document.getElementById('volumeButton').innerHTML = '<i class="fas fa-volume-high"></i>';
        document.getElementById('volume-slider').value = currentVolume;
    } else {
        currentVolume = vlcPlayer.volume;
        vlcPlayer.muted = true;
        document.getElementById('volumeButton').innerHTML = '<i class="fas fa-volume-xmark"></i>';
        document.getElementById('volume-slider').value = 0;
    }
}

// Set volume
function setVolume() {
    if (!vlcPlayer) return;
    
    const value = document.getElementById('volume-slider').value;
    vlcPlayer.volume = parseInt(value);
    
    // Update volume icon
    const volumeButton = document.getElementById('volumeButton');
    if (value == 0) {
        volumeButton.innerHTML = '<i class="fas fa-volume-xmark"></i>';
        vlcPlayer.muted = true;
    } else {
        volumeButton.innerHTML = '<i class="fas fa-volume-high"></i>';
        vlcPlayer.muted = false;
    }
}

// Set playback speed
function setPlaybackSpeed(speed) {
    if (!vlcPlayer) return;
    
    vlcPlayer.rate = speed;
    document.getElementById('playbackSpeedButton').innerHTML = 
        `<i class="fas fa-gauge-high"></i> ${speed}x`;
}

// Set aspect ratio
function setAspectRatio(ratio) {
    if (!vlcPlayer) return;
    
    if (ratio === 'default') {
        vlcPlayer.aspectRatio = null;
    } else {
        vlcPlayer.aspectRatio = ratio;
    }
    
    document.getElementById('aspectRatioButton').innerHTML = 
        `<i class="fas fa-tv"></i> ${ratio !== 'default' ? ratio : ''}`;
}

// Set deinterlace mode
function setDeinterlaceMode(mode) {
    if (!vlcPlayer) return;
    
    if (mode === 'off') {
        vlcPlayer.deinterlace = false;
    } else {
        vlcPlayer.deinterlace = true;
        vlcPlayer.deinterlaceMode = mode;
    }
    
    document.getElementById('deinterlaceButton').classList.toggle('active', mode !== 'off');
}

// Toggle menu visibility
function toggleMenu(menuId) {
    const menu = document.getElementById(menuId);
    const isVisible = menu.classList.contains('visible');
    
    // Hide all menus first
    document.querySelectorAll('.vlc-menu').forEach(m => {
        m.classList.remove('visible');
    });
    
    // Toggle the requested menu
    if (!isVisible) {
        menu.classList.add('visible');
        
        // Position the menu
        const button = document.getElementById(menuId.replace('Menu', 'Button'));
        const buttonRect = button.getBoundingClientRect();
        menu.style.top = `${buttonRect.bottom + 10}px`;
        menu.style.left = `${buttonRect.left - (menu.offsetWidth / 2) + (button.offsetWidth / 2)}px`;
    }
}

// Progress bar drag handling
function startDragging(e) {
    isDragging = true;
    handleDrag(e);
}

function stopDragging() {
    if (isDragging) {
        isDragging = false;
    }
}

function handleDrag(e) {
    if (!isDragging) return;
    
    const progressBar = document.querySelector('.progress-bar');
    const rect = progressBar.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    
    // Update UI immediately for responsive feel
    document.getElementById('progress-fill').style.width = `${position * 100}%`;
    document.getElementById('progress-thumb').style.left = `${position * 100}%`;
    
    // Update time display
    if (vlcPlayer && mediaLength) {
        const seekTime = position * mediaLength;
        document.getElementById('current-time').textContent = formatTime(seekTime / 1000);
    }
}

// Seek to position when clicking on progress bar
function seekToPosition(event) {
    if (!vlcPlayer || !mediaLength) return;
    
    const progressBar = document.querySelector('.progress-bar');
    const rect = progressBar.getBoundingClientRect();
    const position = (event.clientX - rect.left) / rect.width;
    
    // Calculate time in milliseconds
    const seekTime = position * mediaLength;
    vlcPlayer.time = seekTime;
    
    // Update progress immediately for responsive feel
    document.getElementById('progress-fill').style.width = `${position * 100}%`;
    document.getElementById('progress-thumb').style.left = `${position * 100}%`;
}

// Show thumbnail preview on hover
function showPreview(event) {
    if (!vlcPlayer || !mediaLength || previewThumbnails.length === 0) return;
    
    const progressBar = document.querySelector('.progress-bar');
    const rect = progressBar.getBoundingClientRect();
    const position = (event.clientX - rect.left) / rect.width;
    
    // Calculate thumbnail index
    const thumbnailIndex = Math.min(
        Math.floor(position * previewThumbnails.length),
        previewThumbnails.length - 1
    );
    
    // Show preview
    const preview = document.getElementById('thumbnail-preview');
    preview.style.display = 'block';
    preview.style.left = `${position * 100}%`;
    
    // Set preview image
    document.getElementById('preview-img').src = previewThumbnails[thumbnailIndex];
    
    // Show time tooltip
    const previewTime = position * mediaLength / 1000; // Convert to seconds
    document.getElementById('preview-time').textContent = formatTime(previewTime);
}

// Hide thumbnail preview
function hidePreview() {
    document.getElementById('thumbnail-preview').style.display = 'none';
}

// Load preview thumbnails
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
        console.log(`Loaded ${previewThumbnails.length} preview thumbnails`);
    } catch (error) {
        console.log("No preview thumbnails available");
    }
}

// Handle keyboard shortcuts
function handleKeypress(event) {
    if (!document.getElementById('videoModal').classList.contains('active')) return;
    
    switch(event.key) {
        case ' ':
            event.preventDefault();
            togglePlayPause();
            break;
        case 'ArrowRight':
            seekVideo(10);
            break;
        case 'ArrowLeft':
            seekVideo(-10);
            break;
        case 'ArrowUp':
            const volumeSlider = document.getElementById('volume-slider');
            volumeSlider.value = Math.min(100, parseInt(volumeSlider.value) + 5);
            setVolume();
            break;
        case 'ArrowDown':
            const volSlider = document.getElementById('volume-slider');
            volSlider.value = Math.max(0, parseInt(volSlider.value) - 5);
            setVolume();
            break;
        case 'f':
            toggleFullscreen();
            break;
        case 'm':
            toggleMute();
            break;
        case 'Escape':
            if (document.querySelector('.vlc-menu.visible')) {
                document.querySelectorAll('.vlc-menu').forEach(m => {
                    m.classList.remove('visible');
                });
            } else {
                closeVideo();
            }
            break;
    }
}

// Close the video player
function closeVideo() {
    if (vlcPlayer) {
        vlcPlayer.stop();
        vlcPlayer.destroy();
        vlcPlayer = null;
    }
    
    document.getElementById('videoModal').classList.remove('active');
    document.body.style.overflow = '';
    activePlaybackPath = null;
    currentVideoMetadata = null;
    previewThumbnails = [];
    
    // Reset UI elements
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('progress-thumb').style.left = '0%';
    document.getElementById('current-time').textContent = '00:00';
    document.getElementById('total-time').textContent = '00:00';
    document.getElementById('playbackSpeedButton').innerHTML = '<i class="fas fa-gauge-high"></i>';
    document.getElementById('aspectRatioButton').innerHTML = '<i class="fas fa-tv"></i>';
}

// Generate a file hash (matching the server-side function)
function getFileHash(filePath) {
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
        const char = filePath.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
}

// File preview for non-video files
function openPreview(filePath, fileType) {
    const modal = document.getElementById('previewModal');
    const container = document.getElementById('previewContent');
    
    container.innerHTML = '';
    
    if (fileType === 'image') {
        container.innerHTML = `<img src="/file/${filePath}" class="preview-image">`;
    } else if (fileType === 'document' && filePath.toLowerCase().endsWith('.pdf')) {
        container.innerHTML = `
            <iframe src="/file/${filePath}" class="preview-pdf"></iframe>
        `;
    } else {
        container.innerHTML = `
            <div class="preview-fallback">
                <i class="fas fa-file-alt preview-icon"></i>
                <p>Preview not available for this file type</p>
                <a href="/file/${filePath}" download class="preview-download-btn">Download File</a>
            </div>
        `;
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePreview() {
    document.getElementById('previewModal').classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('previewContent').innerHTML = '';
}