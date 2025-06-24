from pathlib import Path
import logging
import os
import secrets

class Config:
    # Base directories
    BASE_DIR = Path(os.path.expanduser("~/Videos"))  # Default media directory
    LOG_DIR = Path("logs")
    CACHE_DIR = Path("cache")
    THUMBNAIL_DIR = CACHE_DIR / "thumbnails"
    HLS_DIR = Path("static/hls")
    METADATA_DIR = CACHE_DIR / "metadata"
    PREVIEW_DIR = HLS_DIR / "previews"

    # Server settings
    HOST = "0.0.0.0"
    PORT = 5000
    DEBUG = False
    LOG_LEVEL = logging.INFO

    # Security
    SECRET_KEY = secrets.token_hex(32)  # Secure random key for sessions

    # File format support
    SUPPORTED_VIDEO_FORMATS = {
        ".mp4", ".mkv", ".mov", ".avi", ".wmv", ".flv",
        ".webm", ".m4v", ".ts", ".m2ts", ".vob", ".ogv"
    }
    SUPPORTED_IMAGE_FORMATS = {
        ".jpg", ".jpeg", ".png", ".gif", ".webp",
        ".bmp", ".svg", ".tiff", ".ico"
    }
    SUPPORTED_DOCUMENT_FORMATS = {
        ".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt",
        ".xlsx", ".pptx", ".csv"
    }
    SUPPORTED_AUDIO_FORMATS = {
        ".mp3", ".wav", ".flac", ".aac", ".ogg",
        ".m4a", ".wma"
    }
    SUPPORTED_EXECUTABLE_FORMATS = {
        ".exe", ".msi", ".dmg", ".deb", ".rpm", ".appimage"
    }
    ALLOWED_EXTENSIONS = (
        SUPPORTED_VIDEO_FORMATS
        | SUPPORTED_IMAGE_FORMATS
        | SUPPORTED_DOCUMENT_FORMATS
        | SUPPORTED_AUDIO_FORMATS
        | SUPPORTED_EXECUTABLE_FORMATS
    )

    # Video processing settings
    THUMBNAIL_SIZE = (160, 90)  # Smaller for list view and mobile
    THUMBNAIL_QUALITY = 5  # FFmpeg quality (1-31, lower is better)
    PREVIEW_COUNT = 20  # Number of seek preview thumbnails
    PREVIEW_SIZE = (160, 90)  # Consistent with thumbnail size

    # Performance settings
    MAX_WORKERS = 4  # Increased for better concurrency
    CHUNK_SIZE = 1024 * 1024  # 1MB chunks for streaming
    CACHE_TIMEOUT = 3600  # 1 hour cache for metadata/thumbnails

    # HLS settings
    HLS_SEGMENT_TIME = 4  # Short segments for faster seeking
    HLS_PLAYLIST_TYPE = "vod"  # Video-on-demand for stable playback

    @classmethod
    def init_app(cls, app):
        """Initialize application directories and set Flask config."""
        app.config["BASE_DIR"] = cls.BASE_DIR
        app.config["SECRET_KEY"] = cls.SECRET_KEY
        app.config["ALLOWED_EXTENSIONS"] = cls.ALLOWED_EXTENSIONS
        for directory in [cls.LOG_DIR, cls.THUMBNAIL_DIR, cls.HLS_DIR, cls.METADATA_DIR]:
            directory.mkdir(parents=True, exist_ok=True)
        # Create preview directories per video during HLS generation
        logging.getLogger().setLevel(cls.LOG_LEVEL)