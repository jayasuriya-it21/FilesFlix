/**
 * Advanced Video Player with VLC-like Features
 */
class VideoPlayer {
    constructor() {
        this.player = null;
        this.hls = null;
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
        this.currentVideoPath = '';
        // Get utils from the global FileFlix object
        this.utils = window.FileFlix?.utils || {};
        this.logActivity = this.utils.logActivity || function() {};

        this.init();
    }

    init() {
        this.initEventListeners();
        this.initKeyboardShortcuts();
        this.loadUserPreferences();
    }

    initEventListeners() {
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
            videoPlayer.addEventListener('error', this.onError.bind(this));
        }

        this.initControlEvents();
        this.initProgressBarEvents();
        this.initModalEvents();
        this.initSettingsEvents();
    }

    initControlEvents() {
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', this.togglePlayPause.bind(this));
            playPauseBtn.addEventListener('touchend', this.togglePlayPause.bind(this));
        }

        const rewindBtn = document.getElementById('rewind-btn');
        const forwardBtn = document.getElementById('forward-btn');
        if (rewindBtn) {
            rewindBtn.addEventListener('click', () => this.seek(-10));
            rewindBtn.addEventListener('touchend', () => this.seek(-10));
        }
        if (forwardBtn) {
            forwardBtn.addEventListener('click', () => this.seek(10));
            forwardBtn.addEventListener('touchend', () => this.seek(10));
        }

        const volumeBtn = document.getElementById('volume-btn');
        const volumeSlider = document.getElementById('volume-slider');
        if (volumeBtn) {
            volumeBtn.addEventListener('click', this.toggleMute.bind(this));
            volumeBtn.addEventListener('touchend', this.toggleMute.bind(this));
        }
        if (volumeSlider) {
            volumeSlider.addEventListener('input', this.onVolumeSliderChange.bind(this));
            volumeSlider.addEventListener('touchmove', this.onVolumeSliderChange.bind(this));
        }

        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', this.toggleFullscreen.bind(this));
            fullscreenBtn.addEventListener('touchend', this.toggleFullscreen.bind(this));
        }

        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', this.toggleSettings.bind(this));
            settingsBtn.addEventListener('touchend', this.toggleSettings.bind(this));
        }

        const closeBtn = document.getElementById('close-video-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', this.close.bind(this));
            closeBtn.addEventListener('touchend', this.close.bind(this));
        }

        const speedBtn = document.getElementById('speed-btn');
        if (speedBtn) {
            speedBtn.addEventListener('click', this.cyclePlaybackSpeed.bind(this));
            speedBtn.addEventListener('touchend', this.cyclePlaybackSpeed.bind(this));
        }

        const subtitleBtn = document.getElementById('subtitle-btn');
        if (subtitleBtn) {
            subtitleBtn.addEventListener('click', () => this.showTrackMenu('subtitle'));
            subtitleBtn.addEventListener('touchend', () => this.showTrackMenu('subtitle'));
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
        progressContainer.addEventListener('touchstart', this.onProgressTouchStart.bind(this));
        progressContainer.addEventListener('touchmove', this.onProgressTouchMove.bind(this));
        progressContainer.addEventListener('touchend', this.onProgressTouchEnd.bind(this));

        document.addEventListener('mouseup', this.onProgressMouseUp.bind(this));
        document.addEventListener('mousemove', this.onProgressDrag.bind(this));
    }

    initModalEvents() {
        const modal = document.getElementById('video-modal');
        const container = document.querySelector('.video-container');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });
            modal.addEventListener('touchend', (e) => {
                if (e.target === modal) this.close();
            });
        }

        if (container) {
            container.addEventListener('mousemove', this.showControls.bind(this));
            container.addEventListener('mouseleave', this.hideControls.bind(this));
            container.addEventListener('touchstart', this.toggleControls.bind(this));
        }

        document.addEventListener('fullscreenchange', this.onFullscreenChange.bind(this));
        document.addEventListener('webkitfullscreenchange', this.onFullscreenChange.bind(this));
        document.addEventListener('mozfullscreenchange', this.onFullscreenChange.bind(this));
        document.addEventListener('MSFullscreenChange', this.onFullscreenChange.bind(this));
    }

    initSettingsEvents() {
        const closeSettingsBtn = document.getElementById('close-settings-btn');
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', this.hideSettings.bind(this));
            closeSettingsBtn.addEventListener('touchend', this.hideSettings.bind(this));
        }
    }

    initKeyboardShortcuts() {
        window.FileFlix.utils.KeyboardShortcuts.register('space', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.togglePlayPause();
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register('k', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.togglePlayPause();
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register('arrowleft', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.seek(e.shiftKey ? -60 : -10);
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register('arrowright', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.seek(e.shiftKey ? 60 : 10);
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register('arrowup', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.changeVolume(0.1);
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register('arrowdown', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.changeVolume(-0.1);
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register('f', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.toggleFullscreen();
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register('m', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.toggleMute();
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register('home', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.seekTo(0);
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register('end', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.seekTo(this.duration);
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register('escape', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                if (this.isFullscreen) {
                    this.toggleFullscreen();
                } else {
                    this.close();
                }
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register(',', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.frameStep(-1);
            }
        });
        window.FileFlix.utils.KeyboardShortcuts.register('.', (e) => {
            if (this.isActive()) {
                e.preventDefault();
                this.frameStep(1);
            }
        });
        for (let i = 1; i <= 9; i++) {
            window.FileFlix.utils.KeyboardShortcuts.register(i.toString(), (e) => {
                if (this.isActive()) {
                    e.preventDefault();
                    this.setPlaybackRate(i * 0.25);
                }
            });
        }
    }

    loadUserPreferences() {
        const prefs = window.FileFlix.utils.storage.get('playerPreferences', {});
        this.volume = prefs.volume || 1;
        this.playbackRate = prefs.playbackRate || 1;

        if (this.player) {
            this.player.volume = this.volume;
            this.player.playbackRate = this.playbackRate;
        }

        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) {
            volumeSlider.value = this.volume * 100;
        }

        const speedBtn = document.getElementById('speed-btn');
        if (speedBtn) {
            const speedDisplay = speedBtn.querySelector('.speed-display');
            if (speedDisplay) {
                speedDisplay.textContent = `${this.playbackRate}x`;
            }
        }
    }

    saveUserPreferences() {
        const prefs = {
            volume: this.volume,
            playbackRate: this.playbackRate
        };
        window.FileFlix.utils.storage.set('playerPreferences', prefs);
    }    async play(path, title = '') {
        try {
            this.currentVideoPath = window.FileFlix.utils.normalizePath(path);
            this.logActivity('Video Loading', {
                path: this.currentVideoPath,
                title: title || path.split('/').pop()
            });
            
            this.showLoadingState();

            const titleElement = document.getElementById('video-title');
            if (titleElement) {
                titleElement.textContent = window.FileFlix.utils.sanitizeHTML(title || path.split('/').pop());
            }

            const modal = document.getElementById('video-modal');
            if (modal) {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }

            await this.loadMetadata(path);
            await this.setupVideoElement(path);
            await this.loadPreviewThumbnails(path);
            await this.generatePreviews(path);
            this.setupSubtitleTracks();

            this.hideLoadingState();
            this.showControls();
            
            this.logActivity('Video Loaded', {
                path: this.currentVideoPath,
                title: title || path.split('/').pop(),
                duration: this.duration,
                hasAudioTracks: this.audioTracks.length > 0,
                hasSubtitles: this.subtitleTracks.length > 0
            });
        } catch (error) {
            console.error('Failed to play video:', error);
            window.FileFlix.utils.showToast('Failed to load video', 'error');
            this.showError('Failed to load video. Please try again.');
            
            this.logActivity('Video Load Error', {
                path: this.currentVideoPath,
                error: error.message || 'Unknown error'
            });
        }
    }

    async loadMetadata(path) {
        try {
            const response = await window.FileFlix.utils.apiRequest(`/api/metadata/${encodeURIComponent(path)}`);
            if (!response.success) {
                throw new Error(response.message || 'Failed to load metadata');
            }
            this.metadata = {
                duration: response.duration,
                audio_streams: response.audio_streams,
                subtitle_streams: response.subtitle_streams
            };
            this.audioTracks = response.audio_streams || [];
            this.subtitleTracks = response.subtitle_streams || [];
            console.log('Video metadata loaded:', this.metadata);
        } catch (error) {
            console.warn('Could not load video metadata:', error);
            window.FileFlix.utils.showToast('Metadata unavailable', 'warning');
        }
    }

    async generatePreviews(path) {
        try {
            const response = await window.FileFlix.utils.apiRequest(`/api/generate-previews/${encodeURIComponent(path)}`);
            if (!response.success) {
                throw new Error(response.message || 'Failed to generate previews');
            }
            console.log('Previews generated:', response);
        } catch (error) {
            console.warn('Could not generate previews:', error);
        }
    }

    async setupVideoElement(path) {
        const player = document.getElementById('video-player');
        if (!player) throw new Error('Video player element not found');

        this.player = player;
        const streamUrl = `/api/stream/${encodeURIComponent(path)}`;

        player.src = streamUrl;
        player.volume = this.volume;
        player.playbackRate = this.playbackRate;

        player.addEventListener('error', async () => {
            console.log('Direct streaming failed, trying HLS...');
            await this.setupHLSPlayer(path);
        }, { once: true });

        try {
            await player.play();
        } catch (error) {
            console.log('Auto-play blocked:', error);
            window.FileFlix.utils.showToast('Click play to start video', 'info');
        }
    }

    async setupHLSPlayer(path) {
        const hlsUrl = `/api/hls/${encodeURIComponent(path)}`;
        if (Hls.isSupported()) {
            this.hls = new Hls({
                enableWorker: true,
                maxBufferLength: 15,
                maxMaxBufferLength: 300,
                lowLatencyMode: true,
                backBufferLength: 30
            });

            this.hls.loadSource(hlsUrl);
            this.hls.attachMedia(this.player);

            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('HLS manifest loaded');
                this.player.play().catch(console.error);
            });

            this.hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error('HLS fatal error:', data);
                    window.FileFlix.utils.showToast('Video playback failed', 'error');
                    this.showError('Video playback failed');
                }
            });
        } else if (this.player.canPlayType('application/vnd.apple.mpegurl')) {
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
            for (let i = 0; i < 10; i++) {
                const thumbnailUrl = `/api/previews/${hash}/preview_${i.toString().padStart(3, '0')}.jpg`;
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

    setupSubtitleTracks() {
        const subtitleTrackList = document.getElementById('subtitle-track-list');
        if (!subtitleTrackList || !this.metadata?.subtitle_streams) return;

        this.subtitleTracks = this.metadata.subtitle_streams;
        subtitleTrackList.innerHTML = '';

        const noneItem = window.FileFlix.utils.createElement('div', { className: 'track-item' }, `
            <input type="radio" name="subtitle-track" value="-1" checked>
            <span class="track-label">None</span>
        `);
        noneItem.addEventListener('click', () => this.selectSubtitleTrack(-1));
        noneItem.addEventListener('touchend', () => this.selectSubtitleTrack(-1));
        subtitleTrackList.appendChild(noneItem);

        this.subtitleTracks.forEach((track, index) => {
            const trackItem = window.FileFlix.utils.createElement('div', { className: 'track-item' }, `
                <input type="radio" name="subtitle-track" value="${index}">
                <span class="track-label">${window.FileFlix.utils.formatTrackInfo(track)}</span>
            `);
            trackItem.addEventListener('click', () => this.selectSubtitleTrack(index));
            trackItem.addEventListener('touchend', () => this.selectSubtitleTrack(index));
            subtitleTrackList.appendChild(trackItem);
        });
    }

    async selectSubtitleTrack(index) {
        this.currentSubtitleTrack = index;
        document.querySelectorAll('input[name="subtitle-track"]').forEach((input, i) => {
            const value = parseInt(input.value);
            input.checked = value === index;
            input.closest('.track-item').classList.toggle('active', value === index);
        });

        if (index >= 0 && this.subtitleTracks[index]) {
            await this.loadSubtitleFile(index);
        } else {
            this.clearSubtitles();
        }
    }

    async loadSubtitleFile(index) {
        try {
            const track = this.subtitleTracks[index];
            const hash = window.FileFlix.utils.generateHash(this.currentVideoPath);
            const subtitleUrl = `/api/hls/${encodeURIComponent(hash)}/subtitle_${track.index}.vtt`;

            this.clearSubtitles();
            const trackElement = document.createElement('track');
            trackElement.kind = 'subtitles';
            trackElement.src = subtitleUrl;
            trackElement.srclang = track.language || 'en';
            trackElement.label = track.title || `Subtitle ${index + 1}`;
            trackElement.default = true;

            this.player.appendChild(trackElement);

            const textTracks = this.player.textTracks;
            if (textTracks.length > 0) {
                textTracks[textTracks.length - 1].mode = 'showing';
            }
            window.FileFlix.utils.showToast(`Subtitle: ${window.FileFlix.utils.formatTrackInfo(track)}`, 'success');
        } catch (error) {
            console.error('Failed to load subtitle:', error);
            window.FileFlix.utils.showToast('Failed to load subtitle', 'error');
        }
    }

    clearSubtitles() {
        const tracks = this.player.querySelectorAll('track');
        tracks.forEach(track => track.remove());
        const textTracks = this.player.textTracks;
        for (let i = 0; i < textTracks.length; i++) {
            textTracks[i].mode = 'disabled';
        }
    }

    togglePlayPause() {
        if (!this.player) return;
        if (this.player.paused) {
            this.player.play().catch(() => window.FileFlix.utils.showToast('Playback failed', 'error'));
        } else {
            this.player.pause();
        }
    }

    seek(seconds) {
        if (!this.player || !this.duration) return;
        const newTime = Math.max(0, Math.min(this.duration, this.currentTime + seconds));
        this.seekTo(newTime);
        this.showSeekIndicator(seconds);
    }

    seekTo(time) {
        if (!this.player) return;
        this.player.currentTime = time;
    }

    frameStep(direction) {
        if (!this.player) return;
        const frameRate = 24; // Default frame rate if metadata unavailable
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
        this.player.muted = volume === 0;

        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) {
            volumeSlider.value = volume * 100;
        }

        this.updateVolumeIcon();
        this.saveUserPreferences();
    }

    toggleMute() {
        if (!this.player) return;
        if (this.player.muted || this.volume === 0) {
            this.player.muted = false;
            this.setVolume(this.volume || 0.5);
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

        const speedBtn = document.getElementById('speed-btn');
        if (speedBtn) {
            const speedDisplay = speedBtn.querySelector('.speed-display');
            if (speedDisplay) {
                speedDisplay.textContent = `${rate}x`;
            }
        }

        this.saveUserPreferences();
        window.FileFlix.utils.showToast(`Playback speed: ${rate}x`, 'info');
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
            } else if (this.player.webkitEnterFullscreen) {
                this.player.webkitEnterFullscreen(); // iOS Safari
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
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen(); // iOS Safari
            }
        }
    }

    close() {
        if (this.player) {
            this.player.pause();
            this.player.src = '';
        }

        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }

        const modal = document.getElementById('video-modal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }

        this.reset();
        window.FileFlix.utils.showToast('Video closed', 'info');
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

    showControls() {
        const controls = document.getElementById('video-controls');
        if (!controls) return;

        controls.classList.add('visible');
        this.controlsVisible = true;

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

    toggleControls() {
        if (this.controlsVisible) {
            this.hideControls();
        } else {
            this.showControls();
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
        this.toggleSettings();
        const trackList = document.getElementById(`${type}-track-list`);
        if (trackList) {
            trackList.scrollIntoView({ behavior: 'smooth' });
        }
    }

    showSeekIndicator(seconds) {
        const container = document.querySelector('.video-container');
        if (!container) return;

        const indicator = window.FileFlix.utils.createElement('div', { className: 'seek-indicator' }, `
            <i class="fas fa-${seconds > 0 ? 'forward' : 'backward'}"></i>
            <span>${Math.abs(seconds)}s</span>
        `);
        container.appendChild(indicator);
        setTimeout(() => indicator.remove(), 1000);
    }

    showLoadingState() {
        const container = document.querySelector('.video-container');
        if (!container) return;

        const loading = window.FileFlix.utils.createElement('div', { className: 'video-loading' }, `
            <div class="video-loading-spinner"></div>
            <div class="video-loading-text">Loading video...</div>
        `);
        container.appendChild(loading);
    }

    hideLoadingState() {
        const loading = document.querySelector('.video-loading');
        if (loading) loading.remove();
    }

    showError(message) {
        const container = document.querySelector('.video-container');
        if (!container) return;

        container.innerHTML = `
            <div class="video-error">
                <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="error-message">${window.FileFlix.utils.sanitizeHTML(message)}</div>
                <button class="btn btn-primary" onclick="window.videoPlayer.close()">Close</button>
            </div>
        `;
    }

    onLoadedMetadata() {
        this.duration = this.player.duration;
        this.updateDurationDisplay();
        window.FileFlix.utils.showToast('Video loaded', 'success');
    }

    onTimeUpdate() {
        if (!this.isDragging) {
            this.currentTime = this.player.currentTime;
            this.updateProgressBar();
            this.updateTimeDisplay();
        }
    }    onPlay() {
        this.isPlaying = true;
        this.updatePlayPauseButton();
        this.logActivity('Video Play', {
            path: this.currentVideoPath,
            position: this.currentTime,
            duration: this.duration
        });
    }

    onPause() {
        this.isPlaying = false;
        this.updatePlayPauseButton();
        this.showControls();
        this.logActivity('Video Pause', {
            path: this.currentVideoPath,
            position: this.currentTime,
            duration: this.duration
        });
    }

    onEnded() {
        this.isPlaying = false;
        this.updatePlayPauseButton();
        this.showControls();
        this.logActivity('Video Ended', {
            path: this.currentVideoPath,
            duration: this.duration
        });
    }    onVolumeChange() {
        this.volume = this.player.volume;
        this.updateVolumeIcon();
        this.logActivity('Video Volume Changed', {
            path: this.currentVideoPath,
            volume: this.volume
        });
    }

    onRateChange() {
        this.playbackRate = this.player.playbackRate;
        this.logActivity('Video Speed Changed', {
            path: this.currentVideoPath,
            speed: this.playbackRate
        });
    }

    onSeeking() {
        this.showLoadingState();
        this.logActivity('Video Seeking', {
            path: this.currentVideoPath,
            from: this.currentTime
        });
    }

    onSeeked() {
        this.hideLoadingState();
        this.logActivity('Video Seeked', {
            path: this.currentVideoPath,
            to: this.currentTime
        });
    }

    onError() {
        window.FileFlix.utils.showToast('Playback error', 'error');
        this.showError('Video playback failed');
        this.logActivity('Video Error', {
            path: this.currentVideoPath,
            error: 'Playback failed'
        });
    }

    onFullscreenChange() {
        this.isFullscreen = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            document.webkitIsFullScreen
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

    onProgressTouchStart(e) {
        this.isDragging = true;
        this.onProgressTouchMove(e);
    }

    onProgressTouchMove(e) {
        if (!this.player || !this.duration || !this.isDragging) return;
        const touch = e.touches[0];
        const rect = e.target.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
        const time = percent * this.duration;
        this.seekTo(time);
        this.showProgressPreview(touch.clientX, time);
    }

    onProgressTouchEnd() {
        this.isDragging = false;
        this.hideProgressPreview();
    }

    showProgressPreview(x, time) {
        const preview = document.getElementById('progress-preview');
        if (!preview || this.previewThumbnails.length === 0) return;

        const thumbnailIndex = Math.floor((time / this.duration) * this.previewThumbnails.length);
        const clampedIndex = Math.min(Math.max(0, thumbnailIndex), this.previewThumbnails.length - 1);

        const img = preview.querySelector('img');
        const timeDisplay = preview.querySelector('.preview-time');
        if (img) {
            img.src = this.previewThumbnails[clampedIndex];
        }
        if (timeDisplay) {
            timeDisplay.textContent = window.FileFlix.utils.formatDuration(time);
        }

        preview.style.left = `${x}px`;
        preview.style.display = 'flex';

        const previewRect = preview.getBoundingClientRect();
        if (previewRect.left < 0) {
            preview.style.left = '0px';
        } else if (previewRect.right > window.innerWidth) {
            preview.style.left = `${window.innerWidth - previewRect.width}px`;
        }
    }

    hideProgressPreview() {
        const preview = document.getElementById('progress-preview');
        if (preview) {
            preview.style.display = 'none';
        }
    }

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

    isActive() {
        const modal = document.getElementById('video-modal');
        return modal && modal.classList.contains('active');
    }
}

// Initialize video player
document.addEventListener('DOMContentLoaded', () => {
    window.videoPlayer = new VideoPlayer();
    // Ensure FileFlix object exists
    if (!window.FileFlix) {
        window.FileFlix = {};
    }
    window.FileFlix.player = window.videoPlayer;
});