import os
import subprocess
import logging
import hashlib
import shutil
import json
import time
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import psutil
from config import Config

# Global thread pool for video processing
executor = ThreadPoolExecutor(max_workers=Config.MAX_WORKERS)

def check_ffmpeg():
    """Check if FFmpeg is installed and accessible"""
    return shutil.which("ffmpeg") is not None

def get_file_hash(file_path):
    """Generate unique hash for file path"""
    return hashlib.md5(file_path.encode()).hexdigest()

def get_system_info():
    """Get system resource information"""
    return {
        'cpu_percent': psutil.cpu_percent(interval=1),
        'memory_percent': psutil.virtual_memory().percent,
        'disk_usage': psutil.disk_usage('/').percent
    }

def optimize_ffmpeg_settings():
    """Detect and return optimal FFmpeg settings based on system capabilities"""
    settings = {
        'threads': min(psutil.cpu_count(), 4),
        'preset': 'fast',
        'crf': '23',
        'hardware_accel': None
    }
    
    try:
        # Check for hardware acceleration
        result = subprocess.run(['ffmpeg', '-hwaccels'], 
                              capture_output=True, text=True, timeout=5)
        
        if 'cuda' in result.stdout:
            settings['hardware_accel'] = 'cuda'
        elif 'qsv' in result.stdout:
            settings['hardware_accel'] = 'qsv'
        elif 'vaapi' in result.stdout:
            settings['hardware_accel'] = 'vaapi'
            
        logging.info(f"Optimized FFmpeg settings: {settings}")
    except Exception as e:
        logging.warning(f"Could not detect hardware acceleration: {e}")
    
    return settings

def extract_video_metadata(video_path):
    """Extract comprehensive video metadata"""
    if not check_ffmpeg():
        return None
    
    try:
        cmd = [
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', '-show_streams', str(video_path)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, 
                              check=True, timeout=30)
        data = json.loads(result.stdout)
        
        metadata = {
            'duration': 0,
            'video_streams': [],
            'audio_streams': [],
            'subtitle_streams': [],
            'format_info': data.get('format', {})
        }
        
        # Process streams
        for stream in data.get('streams', []):
            stream_type = stream.get('codec_type')
            
            if stream_type == 'video':
                metadata['video_streams'].append({
                    'index': stream.get('index'),
                    'codec': stream.get('codec_name'),
                    'width': stream.get('width'),
                    'height': stream.get('height'),
                    'fps': eval(stream.get('r_frame_rate', '0/1')),
                    'duration': float(stream.get('duration', 0))
                })
                
            elif stream_type == 'audio':
                tags = stream.get('tags', {})
                metadata['audio_streams'].append({
                    'index': stream.get('index'),
                    'codec': stream.get('codec_name'),
                    'language': tags.get('language', 'unknown'),
                    'title': tags.get('title', f"Audio Track {len(metadata['audio_streams']) + 1}"),
                    'channels': stream.get('channels', 2),
                    'sample_rate': stream.get('sample_rate'),
                    'duration': float(stream.get('duration', 0))
                })
                
            elif stream_type == 'subtitle':
                tags = stream.get('tags', {})
                metadata['subtitle_streams'].append({
                    'index': stream.get('index'),
                    'codec': stream.get('codec_name'),
                    'language': tags.get('language', 'unknown'),
                    'title': tags.get('title', f"Subtitle Track {len(metadata['subtitle_streams']) + 1}"),
                    'forced': tags.get('forced', '0') == '1'
                })
        
        # Get duration from format or first video stream
        if metadata['format_info'].get('duration'):
            metadata['duration'] = float(metadata['format_info']['duration'])
        elif metadata['video_streams']:
            metadata['duration'] = metadata['video_streams'][0]['duration']
            
        return metadata
        
    except Exception as e:
        logging.error(f"Error extracting metadata from {video_path}: {e}")
        return None

def generate_thumbnail(video_path, output_path, timestamp=10):
    """Generate optimized thumbnail for video"""
    if not check_ffmpeg():
        return False
    
    try:
        # Use optimal settings
        ffmpeg_settings = optimize_ffmpeg_settings()
        
        cmd = [
            'ffmpeg', '-hide_banner', '-loglevel', 'error',
            '-ss', str(timestamp),
            '-i', str(video_path),
            '-vframes', '1',
            '-vf', f'scale={Config.THUMBNAIL_SIZE[0]}:{Config.THUMBNAIL_SIZE[1]}',
            '-q:v', '2',  # High quality
            '-threads', str(ffmpeg_settings['threads']),
            '-y', str(output_path)
        ]
        
        # Add hardware acceleration if available
        if ffmpeg_settings['hardware_accel']:
            cmd.insert(2, '-hwaccel')
            cmd.insert(3, ffmpeg_settings['hardware_accel'])
        
        subprocess.run(cmd, check=True, timeout=30, 
                      capture_output=True)
        
        return os.path.exists(output_path)
        
    except Exception as e:
        logging.error(f"Error generating thumbnail: {e}")
        return False

def generate_preview_thumbnails(video_path, output_dir, duration):
    """Generate multiple preview thumbnails for seeking"""
    if duration <= 0:
        return []
    
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    preview_files = []
    interval = duration / Config.PREVIEW_COUNT
    
    for i in range(Config.PREVIEW_COUNT):
        timestamp = i * interval
        output_file = output_dir / f"preview_{i:03d}.jpg"
        
        if generate_thumbnail(video_path, output_file, timestamp):
            preview_files.append(str(output_file))
    
    return preview_files

def generate_hls_playlist(video_path, output_dir, metadata=None):
    """Generate HLS playlist with multiple quality options"""
    if not check_ffmpeg():
        return False
    
    try:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        ffmpeg_settings = optimize_ffmpeg_settings()
        
        # Base command
        cmd = [
            'ffmpeg', '-hide_banner', '-loglevel', 'warning',
            '-i', str(video_path),
            '-c:v', 'libx264',
            '-preset', ffmpeg_settings['preset'],
            '-crf', ffmpeg_settings['crf'],
            '-c:a', 'aac',
            '-b:a', '128k',
            '-threads', str(ffmpeg_settings['threads']),
        ]
        
        # Add hardware acceleration
        if ffmpeg_settings['hardware_accel']:
            cmd.extend(['-hwaccel', ffmpeg_settings['hardware_accel']])
        
        # HLS specific settings
        cmd.extend([
            '-hls_time', str(Config.HLS_SEGMENT_TIME),
            '-hls_list_size', '0',
            '-hls_playlist_type', Config.HLS_PLAYLIST_TYPE,
            '-hls_segment_filename', str(output_dir / 'segment_%03d.ts'),
            '-f', 'hls',
            str(output_dir / 'playlist.m3u8')
        ])
        
        subprocess.run(cmd, check=True, timeout=1800)  # 30 min timeout
        
        return True
        
    except Exception as e:
        logging.error(f"Error generating HLS playlist: {e}")
        return False

def process_video_async(video_path, base_dir):
    """Asynchronously process video for thumbnails and HLS"""
    def process():
        try:
            rel_path = os.path.relpath(video_path, base_dir)
            file_hash = get_file_hash(rel_path)
            
            # Generate thumbnail
            thumbnail_path = Config.THUMBNAIL_DIR / f"{file_hash}.jpg"
            if not thumbnail_path.exists():
                logging.info(f"Generating thumbnail for {rel_path}")
                generate_thumbnail(video_path, thumbnail_path)
            
            # Extract metadata
            metadata_path = Config.METADATA_DIR / f"{file_hash}.json"
            metadata = None
            
            if not metadata_path.exists():
                logging.info(f"Extracting metadata for {rel_path}")
                metadata = extract_video_metadata(video_path)
                if metadata:
                    with open(metadata_path, 'w') as f:
                        json.dump(metadata, f, indent=2)
            else:
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
            
            # Generate preview thumbnails
            if metadata and metadata.get('duration', 0) > 0:
                preview_dir = Config.PREVIEW_DIR / file_hash
                if not preview_dir.exists() or len(list(preview_dir.glob('*.jpg'))) == 0:
                    logging.info(f"Generating preview thumbnails for {rel_path}")
                    generate_preview_thumbnails(video_path, preview_dir, metadata['duration'])
            
            # Generate HLS (optional, on-demand)
            hls_dir = Config.HLS_DIR / file_hash
            if not (hls_dir / 'playlist.m3u8').exists():
                logging.info(f"HLS will be generated on-demand for {rel_path}")
                
        except Exception as e:
            logging.error(f"Error processing video {video_path}: {e}")
    
    # Submit to thread pool
    executor.submit(process)

def get_file_type(filename):
    """Determine file type based on extension"""
    ext = Path(filename).suffix.lower()
    
    if ext in Config.SUPPORTED_VIDEO_FORMATS:
        return 'video'
    elif ext in Config.SUPPORTED_IMAGE_FORMATS:
        return 'image'
    elif ext in Config.SUPPORTED_DOCUMENT_FORMATS:
        return 'document'
    elif ext in Config.SUPPORTED_AUDIO_FORMATS:
        return 'audio'
    elif ext in Config.SUPPORTED_EXECUTABLE_FORMATS:
        return 'executable'
    else:
        return 'other'

def format_file_size(size_bytes):
    """Format file size in human readable format"""
    if size_bytes == 0:
        return "0 B"
    
    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while size_bytes >= 1024.0 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1
    
    return f"{size_bytes:.1f} {size_names[i]}"

def cleanup_cache():
    """Clean up old cache files"""
    try:
        # This could be expanded to remove old unused files
        logging.info("Cache cleanup completed")
    except Exception as e:
        logging.error(f"Error during cache cleanup: {e}")