from pathlib import Path
import logging
import os

class Config:
    # Base directories
    BASE_DIR = Path(__file__).parent
    LOG_DIR = BASE_DIR / 'logs'
    CACHE_DIR = BASE_DIR / 'cache'
    THUMBNAIL_DIR = CACHE_DIR / 'thumbnails'
    HLS_DIR = CACHE_DIR / 'hls'
    METADATA_DIR = CACHE_DIR / 'metadata'
    PREVIEW_DIR = CACHE_DIR / 'previews'
    
    # Server settings
    HOST = '0.0.0.0'
    PORT = 5000
    DEBUG = False
    LOG_LEVEL = logging.INFO
    
    # Security
    SECRET_KEY = 'your-secret-key-change-this'
    
    # File format support
    SUPPORTED_VIDEO_FORMATS = {
        '.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv', 
        '.webm', '.m4v', '.ts', '.m2ts', '.vob', '.ogv'
    }
    SUPPORTED_IMAGE_FORMATS = {
        '.jpg', '.jpeg', '.png', '.gif', '.webp', 
        '.bmp', '.svg', '.tiff', '.ico'
    }
    SUPPORTED_DOCUMENT_FORMATS = {
        '.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', 
        '.xlsx', '.pptx', '.csv'
    }
    SUPPORTED_AUDIO_FORMATS = {
        '.mp3', '.wav', '.flac', '.aac', '.ogg', 
        '.m4a', '.wma'
    }
    SUPPORTED_EXECUTABLE_FORMATS = {
        '.exe', '.msi', '.dmg', '.deb', '.rpm', '.appimage'
    }
    
    # Video processing settings
    THUMBNAIL_SIZE = (480, 270)  # 16:9 aspect ratio
    THUMBNAIL_QUALITY = 85
    PREVIEW_COUNT = 20  # Number of seek preview thumbnails
    
    # Performance settings
    MAX_WORKERS = 3  # Concurrent video processing tasks
    CHUNK_SIZE = 1024 * 1024  # 1MB chunks for streaming
    CACHE_TIMEOUT = 3600  # 1 hour
    
    # HLS settings
    HLS_SEGMENT_TIME = 4  # seconds
    HLS_PLAYLIST_TYPE = 'vod'
    
    @classmethod
    def init_app(cls, app):
        """Initialize application directories"""
        for directory in [cls.LOG_DIR, cls.THUMBNAIL_DIR, cls.HLS_DIR, 
                         cls.METADATA_DIR, cls.PREVIEW_DIR]:
            directory.mkdir(parents=True, exist_ok=True)