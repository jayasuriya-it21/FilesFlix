// Advanced Video Player with VLC-like Features

class VideoPlayer {
    constructor() {
        this.player = null;
        this.isPlaying = false;
        this.duration = 0;
        this.currentTime = 0;
        this.volume = 1;
        this.playbackRate = 1;
        this.isFullscreen = false;
        this.controlsVisible = true;
        this.controlsTimeout = null;
        
        this.metadata = null;
        this.audioTracks = [];
        this.subtitleTracks = [];
        this.currentAudioTrack = 0;
        this.currentSubtitleTrack = -1;
        
        this.previewThumbnails = [];
        this.isDragging = false;
        
        this.init();
    }
    
    init() {
        this.initEventListeners();
        this.initKeyboardShortcuts();
        this.loadUserPreferences();
    }
    
    initEventListeners() {
        // Video events
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer) {
            videoPlayer.addEventListener('loadedmetadata', this.onLoadedMetadata.bind(this));
            videoPlayer.addEventListener('timeupdate', this.onTimeUpdate.bind(this));
            videoPlayer.addEventListener('play', this.onPlay.bind(this));
            videoPlayer.addEventListener('pause', this.onPause.bind(this));
            videoPlayer.addEventListener('ended', this.onEnded.bind(this));
            videoPlayer.addEventListener('volumechange', this.onVolumeChange.bind(this));
            videoPlayer.addEventListener('ratechange', this.onRateChange.bind(this));
            videoPlayer.addEventListener('seeking', this.onSeeking.bind(this));
            videoPlayer.addEventListener('seeked', this.onSeeked.bind(this));
        }
        
        // Control events
        this.initControlEvents();
        
        // Progress bar events
        this.initProgressBarEvents();
        
        // Modal events
        this.initModalEvents();
        
        // Settings menu events
        this.initSettingsEvents();
    }
    
    initControlEvents() {
        // Play/Pause
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', this.togglePlayPause.bind(this));
        }
        
        // Seek buttons
        const rewindBtn = document.getElementById('rewind-btn');
        const forwardBtn = document.getElementById('forward-btn');
        
        if (rewindBtn) {
            rewindBtn.addEventListener('click', () => this.seek(-10));
        }
        
        if (forwardBtn) {
            forwardBtn.addEventListener('click', () => this.seek(10));
        }
        
        // Volume controls
        const volumeBtn = document.getElementById('volume-btn');
        const volumeSlider = document.getElementById('volume-slider');
        
        if (volumeBtn) {
            volumeBtn.addEventListener('click', this.toggleMute.bind(this));
        }
        
        if (volumeSlider) {
            volumeSlider.addEventListener('input', this.onVolumeSliderChange.bind(this));
        }
        
        // Fullscreen
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', this.toggleFullscreen.bind(this));
        }
        
        // Settings
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', this.toggleSettings.bind(this));
        }
        
        // Close button
        const closeBtn = document.getElementById('close-video-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', this.close.bind(this));
        }
        
        // Speed button
        const speedBtn = document.getElementById('speed-btn');
        if (speedBtn) {
            speedBtn.addEventListener('click', this.cyclePlaybackSpeed.bind(this));
        }
        
        // Audio/Subtitle buttons
        const audioTrackBtn = document.getElementById('audio-track-btn');
        const subtitleBtn = document.getElementById('subtitle-btn');
        
        if (audioTrackBtn) {
            audioTrackBtn.addEventListener('click', () => this.showTrackMenu('audio'));
        }
        
        if (subtitleBtn) {
            subtitleBtn.addEventListener('click', () => this.showTrackMenu('subtitle'));
        }
    }
    
    initProgressBarEvents() {
        const progressBar = document.getElementById('progress-bar');
        const progressContainer = progressBar?.parentElement;
        
        if (!progressContainer) return;
        
        progressContainer.addEventListener('click', this.onProgressClick.bind(this));
        progressContainer.addEventListener('mousedown', this.onProgressMouseDown.bind(this));
        progressContainer.addEventListener('mousemove', this.onProgressMouseMove.bind(this));
        progressContainer.addEventListener('mouseout', this.onProgressMouseOut.bind(this));
        
        document.addEventListener('mouseup', this.onProgressMouseUp.bind(this));
        document.addEventListener('mousemove', this.onProgressDrag.bind(this));
    }
    
    initModalEvents() {
        const modal = document.getElementById('video-modal');
        const container = document.querySelector('.video-container');
        
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.close();
                }
            });
        }
        
        if (container) {
            container.addEventListener('mousemove', this.showControls.bind(this));
            container.addEventListener('mouseleave', this.hideControls.bind(this));
        }
        
        // Fullscreen change events
        document.addEventListener('fullscreenchange', this.onFullscreenChange.bind(this));
        document.addEventListener('webkitfullscreenchange', this.onFullscreenChange.bind(this));
        document.addEventListener('mozfullscreenchange', this.onFullscreenChange.bind(this));
        document.addEventListener('MSFullscreenChange', this.onFullscreenChange.bind(this));
    }
    
    initSettingsEvents() {
        const closeSettingsBtn = document.getElementById('close-settings-btn');
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', this.hideSettings.bind(this));
        }
        
        // Quality selection
        const qualityList = document.getElementById('quality-list');
        if (qualityList) {
            qualityList.addEventListener('change', this.onQualityChange.bind(this));
        }
    }
    
    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (!this.isActive()) return;
            
            switch (e.key) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                    
                case 'ArrowLeft':
                    e.preventDefault();
                    this.seek(e.shiftKey ? -60 : -10);
                    break;
                    
                case 'ArrowRight':
                    e.preventDefault();
                    this.seek(e.shiftKey ? 60 : 10);
                    break;
                    
                case 'ArrowUp':
                    e.preventDefault();
                    this.changeVolume(0.1);
                    break;
                    
                case 'ArrowDown':
                    e.preventDefault();
                    this.changeVolume(-0.1);
                    break;
                    
                case 'f':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                    
                case 'm':
                    e.preventDefault();
                    this.toggleMute();
                    break;
                    
                case 'Home':
                    e.preventDefault();
                    this.seekTo(0);
                    break;
                    
                case 'End':
                    e.preventDefault();
                    this.seekTo(this.duration);
                    break;
                    
                case 'Escape':
                    e.preventDefault();
                    if (this.isFullscreen) {
                        this.toggleFullscreen();
                    } else {
                        this.close();
                    }
                    break;
                    
                case ',':
                    e.preventDefault();
                    this.frameStep(-1);
                    break;
                    
                case '.':
                    e.preventDefault();
                    this.frameStep(1);
                    break;
                    
                default:
                    // Speed controls (1-9)
                    if (e.key >= '1' && e.key <= '9') {
                        e.preventDefault();
                        const speed = parseInt(e.key) * 0.25;
                        this.setPlaybackRate(speed);
                    }
                    break;
            }
        });
    }
    
    loadUserPreferences() {
        const prefs = window.FileFlix.utils.storage.get('playerPreferences', {});
        
        this.volume = prefs.volume || 1;
        this.playbackRate = prefs.playbackRate || 1;
        
        // Apply volume
        if (this.player) {
            this.player.volume = this.volume;
        }
        
        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) {
            volumeSlider.value = this.volume * 100;
        }
    }
    
    saveUserPreferences() {
        const prefs = {
            volume: this.volume,
            playbackRate: this.playbackRate
        };
        
        window.FileFlix.utils.storage.set('playerPreferences', prefs);
    }
    
    async play(path, title = '') {
        try {
            this.showLoadingState();
            
            // Set title
            const titleElement = document.getElementById('video-title');
            if (titleElement) {
                titleElement.textContent = title || path.split('/').pop();
            }
            
            // Show modal
            const modal = document.getElementById('video-modal');
            if (modal) {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
            
            // Load metadata
            await this.loadMetadata(path);
            
            // Setup video element
            await this.setupVideoElement(path);
            
            // Load preview thumbnails
            await this.loadPreviewThumbnails(path);
            
            // Setup tracks
            this.setupAudioTracks();
            this.setupSubtitleTracks();
            
            this.hideLoadingState();
            this.showControls();
            
        } catch (error) {
            console.error('Failed to play video:', error);
            this.showError('Failed to load video. Please try again.');
        }
    }
    
    async loadMetadata(path) {
        try {
            const response = await fetch(`/api/metadata/${encodeURIComponent(path)}`);
            if (response.ok) {
                this.metadata = await response.json();
                console.log('Video metadata loaded:', this.metadata);
            }
        } catch (error) {
            console.warn('Could not load video metadata:', error);
        }
    }
    
    async setupVideoElement(path) {
        const player = document.getElementById('video-player');
        if (!player) throw new Error('Video player element not found');
        
        this.player = player;
        
        // Try direct streaming first
        const streamUrl = `/api/stream/${encodeURIComponent(path)}`;
        
        player.src = streamUrl;
        
        // Set up fallback to HLS if direct streaming fails
        player.addEventListener('error', async () => {
            console.log('Direct streaming failed, trying HLS...');
            await this.setupHLSPlayer(path);
        }, { once: true });
        
        // Apply user preferences
        player.volume = this.volume;
        player.playbackRate = this.playbackRate;
        
        // Auto-play
        try {
            await player.play();
        } catch (error) {
            console.log('Auto-play blocked:', error);
        }
    }
    
    async setupHLSPlayer(path) {
        const hlsUrl = `/api/hls/${encodeURIComponent(path)}`;
        
        if (Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                maxBufferLength: 30,
                maxMaxBufferLength: 600,
                lowLatencyMode: false
            });
            
            hls.loadSource(hlsUrl);
            hls.attachMedia(this.player);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('HLS manifest loaded');
                this.player.play().catch(console.error);
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error('HLS fatal error:', data);
                    this.showError('Video playback failed');
                }
            });
            
            this.hls = hls;
            
        } else if (this.player.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            this.player.src = hlsUrl;
            this.player.play().catch(console.error);
        } else {
            throw new Error('HLS not supported');
        }
    }
    
    async loadPreviewThumbnails(path) {
        try {
            const hash = window.FileFlix.utils.generateHash(path);
            this.previewThumbnails = [];
            
            for (let i = 0; i < 20; i++) {
                const thumbnailUrl = `/api/previews/${hash}/preview_${i.toString().padStart(3, '0')}.jpg`;
                
                // Check if thumbnail exists
                const response = await fetch(thumbnailUrl, { method: 'HEAD' });
                if (response.ok) {
                    this.previewThumbnails.push(thumbnailUrl);
                }
            }
            
            console.log(`Loaded ${this.previewThumbnails.length} preview thumbnails`);
        } catch (error) {
            console.warn('Could not load preview thumbnails:', error);
        }
    }
    
    setupAudioTracks() {
        const audioTrackList = document.getElementById('audio-track-list');
        if (!audioTrackList || !this.metadata?.audio_streams) return;
        
        this.audioTracks = this.metadata.audio_streams;
        audioTrackList.innerHTML = '';
        
        this.audioTracks.forEach((track, index) => {
            const trackItem = document.createElement('div');
            trackItem.className = 'track-item';
            
            trackItem.innerHTML = `
                <input type="radio" name="audio-track" value="${index}" ${index === 0 ? 'checked' : ''}>
                <span class="track-label">${track.title} (${track.language})</span>
            `;
            
            trackItem.addEventListener('click', () => this.selectAudioTrack(index));
            audioTrackList.appendChild(trackItem);
        });
    }
    
    setupSubtitleTracks() {
        const subtitleTrackList = document.getElementById('subtitle-track-list');
        if (!subtitleTrackList || !this.metadata?.subtitle_streams) return;
        
        this.subtitleTracks = this.metadata.subtitle_streams;
        subtitleTrackList.innerHTML = '';
        
        // Add "None" option
        const noneItem = document.createElement('div');
        noneItem.className = 'track-item';
        noneItem.innerHTML = `
            <input type="radio" name="subtitle-track" value="-1" checked>
            <span class="track-label">None</span>
        `;
        noneItem.addEventListener('click', () => this.selectSubtitleTrack(-1));
        subtitleTrackList.appendChild(noneItem);
        
        // Add subtitle tracks
        this.subtitleTracks.forEach((track, index) => {
            const trackItem = document.createElement('div');
            trackItem.className = 'track-item';
            
            trackItem.innerHTML = `
                <input type="radio" name="subtitle-track" value="${index}">
                <span class="track-label">${track.title} (${track.language})</span>
            `;
            
            trackItem.addEventListener('click', () => this.selectSubtitleTrack(index));
            subtitleTrackList.appendChild(trackItem);
        });
    }
    
    selectAudioTrack(index) {
        this.currentAudioTrack = index;
        
        // Update UI
        document.querySelectorAll('input[name="audio-track"]').forEach((input, i) => {
            input.checked = i === index;
            input.closest('.track-item').classList.toggle('active', i === index);
        });
        
        // Note: Actual audio track switching would need server-side support
        console.log('Audio track selected:', index);
    }
    
    selectSubtitleTrack(index) {
        this.currentSubtitleTrack = index;
        
        // Update UI
        document.querySelectorAll('input[name="subtitle-track"]').forEach((input, i) => {
            const value = parseInt(input.value);
            input.checked = value === index;
            input.closest('.track-item').classList.toggle('active', value === index);
        });
        
        // Load subtitle file if available
        if (index >= 0 && this.subtitleTracks[index]) {
            this.loadSubtitleFile(index);
        } else {
            this.clearSubtitles();
        }
    }
    
    async loadSubtitleFile(index) {
        try {
            const track = this.subtitleTracks[index];
            const hash = window.FileFlix.utils.generateHash(this.getCurrentPath());
            const subtitleUrl = `/api/hls/${hash}/subtitle_${track.index}.vtt`;
            
            // Remove existing subtitle tracks
            this.clearSubtitles();
            
            // Add new subtitle track
            const trackElement = document.createElement('track');
            trackElement.kind = 'subtitles';
            trackElement.src = subtitleUrl;
            trackElement.srclang = track.language;
            trackElement.label = track.title;
            trackElement.default = true;
            
            this.player.appendChild(trackElement);
            
            // Enable the track
            const textTracks = this.player.textTracks;
            if (textTracks.length > 0) {
                textTracks[textTracks.length - 1].mode = 'showing';
            }
            
        } catch (error) {
            console.error('Failed to load subtitle:', error);
        }
    }
    
    clearSubtitles() {
        // Remove all subtitle tracks
        const tracks = this.player.querySelectorAll('track');
        tracks.forEach(track => track.remove());
        
        // Disable text tracks
        const textTracks = this.player.textTracks;
        for (let i = 0; i < textTracks.length; i++) {
            textTracks[i].mode = 'disabled';
        }
    }
    
    getCurrentPath() {
        // This would need to be stored when the video is loaded
        return this.currentVideoPath || '';
    }
    
    // Player Control Methods
    togglePlayPause() {
        if (!this.player) return;
        
        if (this.player.paused) {
            this.player.play();
        } else {
            this.player.pause();
        }
    }
    
    seek(seconds) {
        if (!this.player) return;
        
        const newTime = Math.max(0, Math.min(this.duration, this.currentTime + seconds));
        this.seekTo(newTime);
        
        // Show seek indicator
        this.showSeekIndicator(seconds);
    }
    
    seekTo(time) {
        if (!this.player) return;
        
        this.player.currentTime = time;
    }
    
    frameStep(direction) {
        if (!this.player) return;
        
        const frameRate = 24; // Assume 24fps, could be detected from metadata
        const frameTime = 1 / frameRate;
        
        this.seek(frameTime * direction);
    }
    
    changeVolume(delta) {
        if (!this.player) return;
        
        const newVolume = Math.max(0, Math.min(1, this.volume + delta));
        this.setVolume(newVolume);
    }
    
    setVolume(volume) {
        if (!this.player) return;
        
        this.volume = volume;
        this.player.volume = volume;
        
        // Update UI
        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) {
            volumeSlider.value = volume * 100;
        }
        
        this.updateVolumeIcon();
        this.saveUserPreferences();
    }
    
    toggleMute() {
        if (!this.player) return;
        
        if (this.player.muted) {
            this.player.muted = false;
            this.setVolume(this.volume);
        } else {
            this.player.muted = true;
            this.setVolume(0);
        }
    }
    
    updateVolumeIcon() {
        const volumeBtn = document.getElementById('volume-btn');
        if (!volumeBtn) return;
        
        const icon = volumeBtn.querySelector('i');
        if (!icon) return;
        
        if (this.player.muted || this.volume === 0) {
            icon.className = 'fas fa-volume-mute';
        } else if (this.volume < 0.5) {
            icon.className = 'fas fa-volume-down';
        } else {
            icon.className = 'fas fa-volume-up';
        }
    }
    
    setPlaybackRate(rate) {
        if (!this.player) return;
        
        this.playbackRate = rate;
        this.player.playbackRate = rate;
        
        // Update UI
        const speedBtn = document.getElementById('speed-btn');
        if (speedBtn) {
            const speedDisplay = speedBtn.querySelector('.speed-display');
            if (speedDisplay) {
                speedDisplay.textContent = `${rate}x`;
            }
        }
        
        this.saveUserPreferences();
    }
    
    cyclePlaybackSpeed() {
        const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
        const currentIndex = speeds.indexOf(this.playbackRate);
        const nextIndex = (currentIndex + 1) % speeds.length;
        
        this.setPlaybackRate(speeds[nextIndex]);
    }
    
    toggleFullscreen() {
        const container = document.querySelector('.video-modal-content');
        if (!container) return;
        
        if (!this.isFullscreen) {
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            } else if (container.mozRequestFullScreen) {
                container.mozRequestFullScreen();
            } else if (container.msRequestFullscreen) {
                container.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }
    
    close() {
        // Stop video
        if (this.player) {
            this.player.pause();
            this.player.src = '';
        }
        
        // Clean up HLS
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        
        // Hide modal
        const modal = document.getElementById('video-modal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        
        // Reset state
        this.reset();
    }
    
    reset() {
        this.player = null;
        this.isPlaying = false;
        this.duration = 0;
        this.currentTime = 0;
        this.metadata = null;
        this.audioTracks = [];
        this.subtitleTracks = [];
        this.previewThumbnails = [];
        this.currentVideoPath = '';
        
        this.hideSettings();
        this.hideControls();
    }
    
    // UI Methods
    showControls() {
        const controls = document.getElementById('video-controls');
        if (!controls) return;
        
        controls.classList.add('visible');
        this.controlsVisible = true;
        
        // Auto-hide after 3 seconds
        if (this.controlsTimeout) {
            clearTimeout(this.controlsTimeout);
        }
        
        this.controlsTimeout = setTimeout(() => {
            if (this.isPlaying && !this.isDragging) {
                this.hideControls();
            }
        }, 3000);
    }
    
    hideControls() {
        const controls = document.getElementById('video-controls');
        if (!controls) return;
        
        // Don't hide if settings menu is open
        const settingsMenu = document.getElementById('settings-menu');
        if (settingsMenu && settingsMenu.classList.contains('visible')) {
            return;
        }
        
        controls.classList.remove('visible');
        this.controlsVisible = false;
        
        if (this.controlsTimeout) {
            clearTimeout(this.controlsTimeout);
            this.controlsTimeout = null;
        }
    }
    
    toggleSettings() {
        const settingsMenu = document.getElementById('settings-menu');
        if (!settingsMenu) return;
        
        settingsMenu.classList.toggle('visible');
        
        if (settingsMenu.classList.contains('visible')) {
            this.showControls();
        }
    }
    
    hideSettings() {
        const settingsMenu = document.getElementById('settings-menu');
        if (settingsMenu) {
            settingsMenu.classList.remove('visible');
        }
    }
    
    showTrackMenu(type) {
        // For now, just toggle settings
        this.toggleSettings();
        
        // Could expand to show specific track selection UI
        console.log(`Show ${type} track menu`);
    }
    
    showSeekIndicator(seconds) {
        const container = document.querySelector('.video-container');
        if (!container) return;
        
        const indicator = document.createElement('div');
        indicator.className = 'seek-indicator';
        indicator.innerHTML = `
            <i class="fas fa-${seconds > 0 ? 'forward' : 'backward'}"></i>
            <span>${Math.abs(seconds)}s</span>
        `;
        
        container.appendChild(indicator);
        
        setTimeout(() => {
            indicator.remove();
        }, 1000);
    }
    
    showLoadingState() {
        const container = document.querySelector('.video-container');
        if (!container) return;
        
        const loading = document.createElement('div');
        loading.className = 'video-loading';
        loading.innerHTML = `
            <div class="video-loading-spinner"></div>
            <div class="video-loading-text">Loading video...</div>
        `;
        
        container.appendChild(loading);
    }
    
    hideLoadingState() {
        const loading = document.querySelector('.video-loading');
        if (loading) {
            loading.remove();
        }
    }
    
    showError(message) {
        const container = document.querySelector('.video-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="video-error">
                <div class="error-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="error-message">${message}</div>
                <button class="btn btn-primary" onclick="videoPlayer.close()">Close</button>
            </div>
        `;
    }
    
    // Event Handlers
    onLoadedMetadata() {
        this.duration = this.player.duration;
        this.updateDurationDisplay();
    }
    
    onTimeUpdate() {
        if (!this.isDragging) {
            this.currentTime = this.player.currentTime;
            this.updateProgressBar();
            this.updateTimeDisplay();
        }
    }
    
    onPlay() {
        this.isPlaying = true;
        this.updatePlayPauseButton();
    }
    
    onPause() {
        this.isPlaying = false;
        this.updatePlayPauseButton();
        this.showControls();
    }
    
    onEnded() {
        this.isPlaying = false;
        this.updatePlayPauseButton();
        this.showControls();
    }
    
    onVolumeChange() {
        this.volume = this.player.volume;
        this.updateVolumeIcon();
    }
    
    onRateChange() {
        this.playbackRate = this.player.playbackRate;
    }
    
    onSeeking() {
        this.showLoadingState();
    }
    
    onSeeked() {
        this.hideLoadingState();
    }
    
    onFullscreenChange() {
        this.isFullscreen = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
        );
        
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            const icon = fullscreenBtn.querySelector('i');
            if (icon) {
                icon.className = this.isFullscreen ? 'fas fa-compress' : 'fas fa-expand';
            }
        }
    }
    
    onVolumeSliderChange(e) {
        const volume = e.target.value / 100;
        this.setVolume(volume);
        
        if (this.player.muted) {
            this.player.muted = false;
        }
    }
    
    onQualityChange(e) {
        const quality = e.target.value;
        console.log('Quality changed to:', quality);
        // Implementation would depend on available quality options
    }
    
    // Progress Bar Events
    onProgressClick(e) {
        if (!this.player || !this.duration) return;
        
        const rect = e.target.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const time = percent * this.duration;
        
        this.seekTo(time);
    }
    
    onProgressMouseDown(e) {
        this.isDragging = true;
        this.onProgressClick(e);
    }
    
    onProgressMouseUp() {
        this.isDragging = false;
    }
    
    onProgressDrag(e) {
        if (!this.isDragging) return;
        this.onProgressClick(e);
    }
    
    onProgressMouseMove(e) {
        if (!this.duration || this.previewThumbnails.length === 0) return;
        
        const rect = e.target.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const time = percent * this.duration;
        
        this.showProgressPreview(e.clientX, time);
    }
    
    onProgressMouseOut() {
        this.hideProgressPreview();
    }
    
    showProgressPreview(x, time) {
        const preview = document.getElementById('progress-preview');
        if (!preview) return;
        
        // Get thumbnail index
        const thumbnailIndex = Math.floor((time / this.duration) * this.previewThumbnails.length);
        const clampedIndex = Math.min(thumbnailIndex, this.previewThumbnails.length - 1);
        
        if (clampedIndex >= 0 && this.previewThumbnails[clampedIndex]) {
            const img = preview.querySelector('img');
            const timeDisplay = preview.querySelector('.preview-time');
            
            if (img) {
                img.src = this.previewThumbnails[clampedIndex];
            }
            
            if (timeDisplay) {
                timeDisplay.textContent = window.FileFlix.utils.formatDuration(time);
            }
            
            // Position preview
            preview.style.left = `${x}px`;
            preview.style.display = 'flex';
            
            // Adjust position to stay within bounds
            const previewRect = preview.getBoundingClientRect();
            if (previewRect.left < 0) {
                preview.style.left = '0px';
            } else if (previewRect.right > window.innerWidth) {
                preview.style.left = `${window.innerWidth - previewRect.width}px`;
            }
        }
    }
    
    hideProgressPreview() {
        const preview = document.getElementById('progress-preview');
        if (preview) {
            preview.style.display = 'none';
        }
    }
    
    // UI Update Methods
    updatePlayPauseButton() {
        const btn = document.getElementById('play-pause-btn');
        if (!btn) return;
        
        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
        }
    }
    
    updateProgressBar() {
        if (!this.duration) return;
        
        const percent = (this.currentTime / this.duration) * 100;
        
        const progressPlayed = document.getElementById('progress-played');
        const progressThumb = document.getElementById('progress-thumb');
        
        if (progressPlayed) {
            progressPlayed.style.width = `${percent}%`;
        }
        
        if (progressThumb) {
            progressThumb.style.left = `${percent}%`;
        }
    }
    
    updateTimeDisplay() {
        const currentTimeElement = document.getElementById('current-time');
        if (currentTimeElement) {
            currentTimeElement.textContent = window.FileFlix.utils.formatDuration(this.currentTime);
        }
    }
    
    updateDurationDisplay() {
        const durationElement = document.getElementById('duration');
        if (durationElement) {
            durationElement.textContent = window.FileFlix.utils.formatDuration(this.duration);
        }
    }
    
    // Utility Methods
    isActive() {
        const modal = document.getElementById('video-modal');
        return modal && modal.classList.contains('active');
    }
}

// Initialize video player
document.addEventListener('DOMContentLoaded', () => {
    window.videoPlayer = new VideoPlayer();
    window.FileFlix.player = window.videoPlayer;
});