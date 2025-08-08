# config.py
import os
from pathlib import Path
import logging

class Config:
    BASE_DIR = Path(__file__).parent
    LOG_DIR = BASE_DIR / 'logs'
    CACHE_DIR = BASE_DIR / 'cache'
    THUMBNAIL_DIR = CACHE_DIR / 'thumbnails'
    HLS_DIR = CACHE_DIR / 'hls'
    METADATA_DIR = CACHE_DIR / 'metadata'  # New directory for storing track metadata
    
    # Security settings - use environment variables with secure defaults
    SECRET_KEY = os.environ.get('SECRET_KEY')
    HOST_USERNAME = os.environ.get('HOST_USERNAME', 'admin')
    HOST_PASSWORD = os.environ.get('HOST_PASSWORD', 'password123')
    
    # Server settings
    HOST = os.environ.get('HOST', '0.0.0.0')
    PORT = int(os.environ.get('PORT', 5000))
    LOG_LEVEL = getattr(logging, os.environ.get('LOG_LEVEL', 'INFO').upper())
    
    # FFmpeg paths (optional)
    FFMPEG_PATH = os.environ.get('FFMPEG_PATH', 'ffmpeg')
    FFPROBE_PATH = os.environ.get('FFPROBE_PATH', 'ffprobe')
    
    # Media directory
    DEFAULT_MEDIA_DIR = os.environ.get('MEDIA_DIRECTORY', str(BASE_DIR))
    
    SUPPORTED_VIDEO_FORMATS = {'.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.webm', '.m4v'}
    SUPPORTED_IMAGE_FORMATS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
    SUPPORTED_DOCUMENT_FORMATS = {'.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'}
    
    THUMBNAIL_SIZE = (480, -1)  # Increased size for better quality
    THUMBNAIL_QUALITY = 3      # 1-31, lower is higher quality
    
    @classmethod
    def init_app(cls, app):
        """Initialize application directories and validate configuration"""
        cls.LOG_DIR.mkdir(exist_ok=True)
        cls.THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
        cls.HLS_DIR.mkdir(parents=True, exist_ok=True)
        cls.METADATA_DIR.mkdir(parents=True, exist_ok=True)  # Create metadata directory
        
        # Validate required settings
        cls._validate_config()
    
    @classmethod
    def _validate_config(cls):
        """Validate critical configuration settings"""
        if not cls.SECRET_KEY:
            import secrets
            cls.SECRET_KEY = secrets.token_hex(32)
            print("WARNING: No SECRET_KEY found in environment. Generated temporary key.")
            print("Please set SECRET_KEY environment variable for production use.")
        
        # Validate media directory if specified
        if hasattr(cls, 'DEFAULT_MEDIA_DIR') and cls.DEFAULT_MEDIA_DIR:
            media_path = Path(cls.DEFAULT_MEDIA_DIR)
            if not media_path.exists():
                print(f"WARNING: Specified media directory does not exist: {cls.DEFAULT_MEDIA_DIR}")
                print("Falling back to current directory.")
                cls.DEFAULT_MEDIA_DIR = str(cls.BASE_DIR)