# utils.py (Enhanced with improved error handling and modular design)
import os
import subprocess
import logging
import hashlib
import shutil
import json
import time
from pathlib import Path
from typing import Optional, Dict, Any, List
from config import Config

def check_ffmpeg() -> bool:
    """Checks if FFmpeg is installed and in the system's PATH."""
    try:
        # Try both configured path and system PATH
        ffmpeg_cmd = Config.FFMPEG_PATH if hasattr(Config, 'FFMPEG_PATH') and Config.FFMPEG_PATH != 'ffmpeg' else 'ffmpeg'
        result = subprocess.run([ffmpeg_cmd, '-version'], 
                               capture_output=True, text=True, timeout=10)
        return result.returncode == 0
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
        return False

def get_file_hash(relative_path: str) -> str:
    """Creates a unique and safe directory name from the file's relative path."""
    return hashlib.md5(relative_path.encode()).hexdigest()

def get_thumbnail_path(relative_path: str) -> Path:
    """Gets the expected path for a video's thumbnail."""
    file_hash = get_file_hash(relative_path)
    return Config.THUMBNAIL_DIR / f"{file_hash}.jpg"

def get_hls_path(relative_path: str) -> Path:
    """Gets the expected path for a video's HLS master playlist."""
    file_hash = get_file_hash(relative_path)
    return Config.HLS_DIR / file_hash / "master.m3u8"

def get_metadata_path(relative_path: str) -> Path:
    """Gets the expected path for a video's metadata JSON file."""
    file_hash = get_file_hash(relative_path)
    return Config.METADATA_DIR / f"{file_hash}.json"

def extract_video_metadata(video_path: str) -> Optional[Dict[str, Any]]:
    """Extract metadata about audio and subtitle tracks from a video file."""
    if not check_ffmpeg():
        logging.error("FFmpeg not found. Cannot extract video metadata.")
        return None
    
    if not os.path.exists(video_path):
        logging.error(f"Video file not found: {video_path}")
        return None
    
    try:
        # Use configured ffprobe path if available
        ffprobe_cmd = (Config.FFPROBE_PATH 
                      if hasattr(Config, 'FFPROBE_PATH') and Config.FFPROBE_PATH != 'ffprobe' 
                      else 'ffprobe')
        
        # Use ffprobe to get stream information
        cmd = [
            ffprobe_cmd, "-v", "quiet", 
            "-print_format", "json", 
            "-show_format", "-show_streams", 
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, 
                               check=True, timeout=30)
        
        # Parse the JSON output
        data = json.loads(result.stdout)
        
        # Process the metadata into a more usable format
        metadata = {
            "audio_tracks": [],
            "subtitle_tracks": [],
            "video_info": None,
            "format": data.get("format", {})
        }
        
        # Extract stream information
        for stream in data.get("streams", []):
            stream_type = stream.get("codec_type")
            
            if stream_type == "video" and not metadata["video_info"]:
                metadata["video_info"] = {
                    "codec": stream.get("codec_name"),
                    "width": stream.get("width"),
                    "height": stream.get("height"),
                    "duration": stream.get("duration"),
                    "bit_rate": stream.get("bit_rate"),
                    "index": stream.get("index")
                }
            
            elif stream_type == "audio":
                language = stream.get("tags", {}).get("language", "unknown")
                title = stream.get("tags", {}).get("title", f"Audio Track ({language})")
                
                metadata["audio_tracks"].append({
                    "index": stream.get("index"),
                    "codec": stream.get("codec_name"),
                    "language": language,
                    "title": title,
                    "channels": stream.get("channels", 2),
                    "bit_rate": stream.get("bit_rate")
                })
            
            elif stream_type == "subtitle":
                language = stream.get("tags", {}).get("language", "unknown")
                title = stream.get("tags", {}).get("title", f"Subtitle ({language})")
                
                metadata["subtitle_tracks"].append({
                    "index": stream.get("index"),
                    "codec": stream.get("codec_name"),
                    "language": language,
                    "title": title
                })
        
        return metadata
    
    except subprocess.TimeoutExpired:
        logging.error(f"Timeout extracting metadata from {video_path}")
        return None
    except subprocess.CalledProcessError as e:
        logging.error(f"Error extracting metadata from {video_path}: {e}")
        return None
    except json.JSONDecodeError as e:
        logging.error(f"Error parsing metadata JSON for {video_path}: {e}")
        return None
    except Exception as e:
        logging.error(f"Unexpected error extracting metadata from {video_path}: {e}")
        return None

def generate_thumbnail(video_path: str, relative_path: str) -> bool:
    """Generate thumbnail for a video file."""
    if not check_ffmpeg():
        logging.error("FFmpeg not found. Cannot generate thumbnail.")
        return False
    
    thumb_path = get_thumbnail_path(relative_path)
    if thumb_path.exists():
        logging.info(f"Thumbnail already exists for {relative_path}")
        return True
    
    logging.info(f"Generating thumbnail for {relative_path}...")
    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Get configured ffmpeg path
    ffmpeg_cmd = (Config.FFMPEG_PATH 
                 if hasattr(Config, 'FFMPEG_PATH') and Config.FFMPEG_PATH != 'ffmpeg' 
                 else 'ffmpeg')
    
    cmd_thumb = [
        ffmpeg_cmd, "-hide_banner",
        "-err_detect", "ignore_err", 
        "-i", video_path,
        "-ss", "00:00:10",  # Seek to 10 seconds
        "-map", "0:v:0?",   # Map the first video stream if exists
        "-vframes", "1",    # Extract single frame
        "-vf", f"scale={Config.THUMBNAIL_SIZE[0]}:-1",
        "-q:v", str(Config.THUMBNAIL_QUALITY),
        "-y",               # Overwrite
        str(thumb_path)
    ]
    
    try:
        subprocess.run(cmd_thumb, check=True, capture_output=True, 
                      text=True, timeout=30)
        logging.info(f"Thumbnail generated: {thumb_path}")
        return True
    except subprocess.TimeoutExpired:
        logging.warning(f"Thumbnail generation timed out for {relative_path}, trying simpler approach")
        # Fallback with simpler options
        cmd_thumb = [
            ffmpeg_cmd, "-hide_banner", 
            "-i", video_path, 
            "-ss", "00:00:05", 
            "-vframes", "1", 
            "-y",
            str(thumb_path)
        ]
        try:
            subprocess.run(cmd_thumb, check=True, capture_output=True, 
                          text=True, timeout=30)
            logging.info(f"Thumbnail generated with fallback method: {thumb_path}")
            return True
        except Exception as e:
            logging.error(f"Fallback thumbnail generation failed for {relative_path}: {e}")
            return False
    except Exception as e:
        logging.error(f"Thumbnail generation failed for {relative_path}: {e}")
        return False

def save_metadata(video_path: str, relative_path: str, metadata: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Extract and save metadata for a video file."""
    metadata_path = get_metadata_path(relative_path)
    
    if metadata_path.exists() and metadata is None:
        # Metadata already exists and we're not forcing a refresh
        try:
            with open(metadata_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logging.error(f"Error loading existing metadata for {relative_path}: {e}")
    
    if metadata is None:
        logging.info(f"Extracting metadata for {relative_path}...")
        metadata = extract_video_metadata(video_path)
    
    if metadata:
        try:
            metadata_path.parent.mkdir(parents=True, exist_ok=True)
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            logging.info(f"Metadata saved to {metadata_path}")
            return metadata
        except Exception as e:
            logging.error(f"Error saving metadata for {relative_path}: {e}")
    else:
        logging.warning(f"Failed to extract metadata for {relative_path}")
    
    return metadata

def extract_subtitles(video_path: str, hls_dir: Path, metadata: Dict[str, Any]) -> None:
    """Extract subtitle tracks from a video file."""
    if not metadata.get("subtitle_tracks"):
        return
    
    ffmpeg_cmd = (Config.FFMPEG_PATH 
                 if hasattr(Config, 'FFMPEG_PATH') and Config.FFMPEG_PATH != 'ffmpeg' 
                 else 'ffmpeg')
    
    for track in metadata["subtitle_tracks"]:
        subtitle_file = hls_dir / f"subtitle_{track['index']}.vtt"
        sub_cmd = [
            ffmpeg_cmd, "-hide_banner",
            "-i", video_path,
            "-map", f"0:{track['index']}",
            "-c:s", "webvtt",
            "-y", str(subtitle_file)
        ]
        try:
            subprocess.run(sub_cmd, capture_output=True, text=True, 
                          check=True, timeout=60)
            logging.info(f"Extracted subtitle track {track['index']} to {subtitle_file}")
        except Exception as e:
            logging.error(f"Failed to extract subtitle track {track['index']}: {e}")

def detect_hardware_acceleration() -> tuple[List[str], List[str]]:
    """Detect available hardware acceleration options."""
    hwaccel_option = []
    video_codec = []
    
    ffmpeg_cmd = (Config.FFMPEG_PATH 
                 if hasattr(Config, 'FFMPEG_PATH') and Config.FFMPEG_PATH != 'ffmpeg' 
                 else 'ffmpeg')
    
    try:
        # Check for hardware acceleration support
        nvenc_check = subprocess.run(
            [ffmpeg_cmd, "-hide_banner", "-encoders"], 
            capture_output=True, text=True, timeout=10
        )
        
        use_hwaccel = "nvenc" in nvenc_check.stdout
        
        # If NVIDIA not available, try platform-specific alternatives
        if not use_hwaccel:
            if os.name == 'nt':  # Windows
                use_hwaccel = "qsv" in nvenc_check.stdout  # Intel QuickSync
            else:  # Linux/Mac
                use_hwaccel = "vaapi" in nvenc_check.stdout or "videotoolbox" in nvenc_check.stdout
        
        if use_hwaccel:
            if "nvenc" in nvenc_check.stdout:
                logging.info("Using NVIDIA hardware acceleration")
                video_codec = ["-c:v", "h264_nvenc", "-preset", "p4"]
            elif "qsv" in nvenc_check.stdout:
                logging.info("Using Intel QuickSync hardware acceleration")
                video_codec = ["-c:v", "h264_qsv", "-preset", "medium"]
            elif "vaapi" in nvenc_check.stdout:
                logging.info("Using VAAPI hardware acceleration")
                hwaccel_option = ["-hwaccel", "vaapi", "-hwaccel_output_format", "vaapi"]
                video_codec = ["-c:v", "h264_vaapi"]
            elif "videotoolbox" in nvenc_check.stdout:
                logging.info("Using VideoToolbox hardware acceleration")
                video_codec = ["-c:v", "h264_videotoolbox"]
        else:
            logging.info("No hardware acceleration available, using software encoding")
            # Software encoding with efficiency presets
            video_codec = ["-c:v", "libx264", "-preset", "superfast", "-crf", "26"]
    except Exception as e:
        logging.warning(f"Error detecting hardware acceleration: {e}")
        # Software encoding fallback
        video_codec = ["-c:v", "libx264", "-preset", "superfast", "-crf", "26"]
    
    return hwaccel_option, video_codec

def generate_preview_thumbnails(video_path: str, hls_dir: Path, metadata: Dict[str, Any]) -> None:
    """Generate preview thumbnails for video seeking."""
    if not metadata.get("video_info") or not metadata["video_info"].get("duration"):
        return
    
    try:
        duration = float(metadata["video_info"]["duration"])
        preview_dir = hls_dir / "previews"
        preview_dir.mkdir(exist_ok=True)
        
        ffmpeg_cmd = (Config.FFMPEG_PATH 
                     if hasattr(Config, 'FFMPEG_PATH') and Config.FFMPEG_PATH != 'ffmpeg' 
                     else 'ffmpeg')
        
        # Generate a thumbnail every 10% of the video
        for i in range(10):
            seek_time = duration * i / 10
            preview_path = preview_dir / f"preview_{i}.jpg"
            
            preview_cmd = [
                ffmpeg_cmd, "-hide_banner",
                "-ss", str(seek_time),
                "-i", video_path,
                "-vframes", "1",
                "-vf", "scale=160:-1",
                "-q:v", "5",
                "-y", str(preview_path)
            ]
            
            try:
                subprocess.run(preview_cmd, capture_output=True, check=True, timeout=10)
            except Exception as e:
                logging.warning(f"Failed to generate preview thumbnail {i}: {e}")
    except Exception as e:
        logging.error(f"Error generating preview thumbnails: {e}")
def generate_hls_playlist(video_path: str, hls_dir: Path, metadata: Dict[str, Any]) -> bool:
    """Generate HLS playlist for a video file."""
    if not check_ffmpeg():
        logging.error("FFmpeg not found. Cannot generate HLS.")
        return False
    
    ffmpeg_cmd = (Config.FFMPEG_PATH 
                 if hasattr(Config, 'FFMPEG_PATH') and Config.FFMPEG_PATH != 'ffmpeg' 
                 else 'ffmpeg')
    
    # Detect hardware acceleration
    hwaccel_option, video_codec = detect_hardware_acceleration()
    
    # Start building the FFmpeg command
    cmd_hls = [
        ffmpeg_cmd, "-hide_banner",
        "-err_detect", "ignore_err",
        "-i", video_path,
        # Map all streams
        "-map", "0:v:0?",  # First video stream
    ]
    
    # Add audio stream mapping based on metadata
    has_audio_tracks = False
    if metadata and metadata.get("audio_tracks"):
        has_audio_tracks = True
        for track in metadata["audio_tracks"]:
            cmd_hls.extend(["-map", f"0:{track['index']}"])
    else:
        # Fallback: map all audio streams
        cmd_hls.extend(["-map", "0:a?"])
    
    # Add hardware acceleration if available
    cmd_hls.extend(hwaccel_option)
    
    # Add video codec settings
    cmd_hls.extend(video_codec)
    
    # Add audio codec settings - per-stream encoding
    if has_audio_tracks and metadata:
        for i, _ in enumerate(metadata["audio_tracks"]):
            cmd_hls.extend([
                f"-c:a:{i}", "aac",
                f"-b:a:{i}", "128k"
            ])
    else:
        # Default audio encoding
        cmd_hls.extend([
            "-c:a", "aac",
            "-b:a", "128k"
        ])
    
    # Create an HLS manifest file to describe all tracks
    variant_manifest = {
        "video": {"index": 0, "name": "Main Video Track"},
        "audio_tracks": metadata.get("audio_tracks", []) if metadata else [],
        "subtitle_tracks": metadata.get("subtitle_tracks", []) if metadata else []
    }
    
    # Save the variant manifest for the player to use
    try:
        variant_manifest_path = hls_dir / "variants.json"
        with open(variant_manifest_path, 'w') as f:
            json.dump(variant_manifest, f, indent=2)
    except Exception as e:
        logging.warning(f"Failed to save variant manifest: {e}")
    
    # Add optimized HLS settings
    cmd_hls.extend([
        # Create an efficient HLS playlist
        "-hls_time", "4",                    # Shorter segments for quicker startup
        "-hls_list_size", "0",               # Keep all segments
        "-hls_segment_type", "mpegts",       # Most compatible segment type
        "-hls_playlist_type", "event",       # Better for VOD content
        "-hls_segment_filename", str(hls_dir / "segment%03d.ts"),
        "-hls_flags", "independent_segments+discont_start",
        "-f", "hls",
        # Force overwrite
        "-y", 
        str(hls_dir / "master.m3u8")
    ])
    
    try:
        # Use Popen to capture output in real-time
        process = subprocess.Popen(
            cmd_hls, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True,
            bufsize=1,  # Line buffered
            universal_newlines=True
        )
        
        # Monitor progress without blocking
        start_time = time.time()
        last_log_time = start_time
        
        for line in process.stderr:
            # Log progress every 10 seconds to avoid log spam
            current_time = time.time()
            if current_time - last_log_time > 10:
                logging.info(f"HLS generation in progress: {line.strip()}")
                last_log_time = current_time
            
            # Implement timeout
            if current_time - start_time > 1800:  # 30 minute timeout
                process.terminate()
                logging.error("HLS generation timed out")
                return False
        
        # Get return code
        process.wait()
        if process.returncode == 0:
            logging.info(f"HLS playlist created: {hls_dir / 'master.m3u8'}")
            return True
        else:
            logging.error(f"HLS generation failed with code {process.returncode}")
            return False
            
    except Exception as e:
        logging.error(f"Error during HLS generation: {e}")
        # Cleanup partial files
        try:
            for file in hls_dir.glob("*.ts"):
                file.unlink(missing_ok=True)
            for file in hls_dir.glob("*.m3u8"):
                file.unlink(missing_ok=True)
        except Exception as cleanup_error:
            logging.warning(f"Error cleaning up partial HLS files: {cleanup_error}")
        return False

def generate_thumbnail_and_hls(video_path: str, base_dir: str, thumbnail_only: bool = False) -> bool:
    """
    Generates thumbnail and optionally HLS playlist for a video.
    Preserves all audio and subtitle tracks from MKV files.
    
    Args:
        video_path: Full path to the video file
        base_dir: Base directory for calculating relative paths
        thumbnail_only: If True, only generate thumbnail
    
    Returns:
        bool: True if successful, False otherwise
    """
    if not os.path.exists(video_path):
        logging.error(f"Video file does not exist: {video_path}")
        return False
    
    try:
        relative_path = os.path.relpath(video_path, base_dir)
        
        # Extract and save metadata
        metadata = save_metadata(video_path, relative_path)
        
        # Generate thumbnail
        thumbnail_success = generate_thumbnail(video_path, relative_path)
        
        # Stop here if only thumbnail was requested
        if thumbnail_only:
            return thumbnail_success
        
        # Generate HLS playlist if it doesn't exist
        hls_master_path = get_hls_path(relative_path)
        hls_dir = hls_master_path.parent
        
        if hls_master_path.exists():
            logging.info(f"HLS already exists for {relative_path}")
            return True
        
        logging.info(f"Generating HLS for {relative_path}...")
        hls_dir.mkdir(parents=True, exist_ok=True)
        
        # Extract subtitles if available
        if metadata:
            extract_subtitles(video_path, hls_dir, metadata)
        
        # Generate HLS playlist
        hls_success = generate_hls_playlist(video_path, hls_dir, metadata)
        
        # Generate preview thumbnails for seeking if HLS was successful
        if hls_success and metadata:
            generate_preview_thumbnails(video_path, hls_dir, metadata)
        
        return hls_success and thumbnail_success
        
    except Exception as e:
        logging.error(f"Unexpected error processing {video_path}: {e}")
        return False