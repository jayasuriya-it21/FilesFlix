# config.py
from pathlib import Path
import logging

class Config:
    BASE_DIR = Path(__file__).parent
    LOG_DIR = BASE_DIR / 'logs'
    CACHE_DIR = BASE_DIR / 'cache'
    THUMBNAIL_DIR = CACHE_DIR / 'thumbnails'
    HLS_DIR = CACHE_DIR / 'hls'
    METADATA_DIR = CACHE_DIR / 'metadata'
    
    HOST = '0.0.0.0'
    PORT = 5000
    LOG_LEVEL = logging.INFO
    
    SUPPORTED_VIDEO_FORMATS = {'.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.webm', '.m4v', '.ts'}
    SUPPORTED_IMAGE_FORMATS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'}
    SUPPORTED_DOCUMENT_FORMATS = {'.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.xlsx', '.pptx'}
    SUPPORTED_AUDIO_FORMATS = {'.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'}
    
    THUMBNAIL_SIZE = (480, -1)
    THUMBNAIL_QUALITY = 3
    
    # VLC player settings
    VLC_USE_HARDWARE_ACCELERATION = True
    VLC_DEINTERLACE_MODE = "blend"  # Options: blend, mean, bob, linear, x, yadif, yadif2x, phosphor, ivtc
    
    @classmethod
    def init_app(cls, app):
        cls.LOG_DIR.mkdir(exist_ok=True)
        cls.THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
        cls.HLS_DIR.mkdir(parents=True, exist_ok=True)
        cls.METADATA_DIR.mkdir(parents=True, exist_ok=True)