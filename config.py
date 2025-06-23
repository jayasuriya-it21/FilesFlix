# config.py
from pathlib import Path
import logging

class Config:
    BASE_DIR = Path(__file__).parent
    LOG_DIR = BASE_DIR / 'logs'
    CACHE_DIR = BASE_DIR / 'cache'
    THUMBNAIL_DIR = CACHE_DIR / 'thumbnails'
    HLS_DIR = CACHE_DIR / 'hls'
    METADATA_DIR = CACHE_DIR / 'metadata'  # New directory for storing track metadata
    
    HOST = '0.0.0.0'
    PORT = 5000
    LOG_LEVEL = logging.INFO
    
    SUPPORTED_VIDEO_FORMATS = {'.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.webm', '.m4v'}
    SUPPORTED_IMAGE_FORMATS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
    SUPPORTED_DOCUMENT_FORMATS = {'.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'}
    
    THUMBNAIL_SIZE = (480, -1)  # Increased size for better quality
    THUMBNAIL_QUALITY = 3      # 1-31, lower is higher quality
    
    @classmethod
    def init_app(cls, app):
        cls.LOG_DIR.mkdir(exist_ok=True)
        cls.THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
        cls.HLS_DIR.mkdir(parents=True, exist_ok=True)
        cls.METADATA_DIR.mkdir(parents=True, exist_ok=True)  # Create metadata directory