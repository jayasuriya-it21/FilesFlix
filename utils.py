# utils.py (Enhanced MKV handling with track extraction)
import os
import subprocess
import logging
import hashlib
import shutil
import json
import time
from pathlib import Path
from config import Config

def check_ffmpeg():
    """Checks if FFmpeg is installed and in the system's PATH."""
    return shutil.which("ffmpeg") is not None

def get_file_hash(relative_path):
    """Creates a unique and safe directory name from the file's relative path."""
    return hashlib.md5(relative_path.encode()).hexdigest()

def get_thumbnail_path(relative_path):
    """Gets the expected path for a video's thumbnail."""
    file_hash = get_file_hash(relative_path)
    return Config.THUMBNAIL_DIR / f"{file_hash}.jpg"

def get_hls_path(relative_path):
    """Gets the expected path for a video's HLS master playlist."""
    file_hash = get_file_hash(relative_path)
    return Config.HLS_DIR / file_hash / "master.m3u8"

def get_metadata_path(relative_path):
    """Gets the expected path for a video's metadata JSON file."""
    file_hash = get_file_hash(relative_path)
    return Config.METADATA_DIR / f"{file_hash}.json"

def extract_video_metadata(video_path):
    """Extract metadata about audio and subtitle tracks from a video file."""
    if not check_ffmpeg():
        logging.error("FFmpeg not found. Cannot extract video metadata.")
        return None
    
    try:
        # Use ffprobe to get stream information
        cmd = [
            "ffprobe", "-v", "quiet", 
            "-print_format", "json", 
            "-show_format", "-show_streams", 
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
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
    
    except subprocess.CalledProcessError as e:
        logging.error(f"Error extracting metadata from {video_path}: {e}")
        return None
    except json.JSONDecodeError as e:
        logging.error(f"Error parsing metadata JSON: {e}")
        return None
    except Exception as e:
        logging.error(f"Unexpected error extracting metadata: {e}")
        return None

def generate_thumbnail_and_hls(video_path, base_dir, thumbnail_only=False):
    """
    Generates thumbnail and optionally HLS playlist for a video.
    Preserves all audio and subtitle tracks from MKV files.
    """
    if not check_ffmpeg():
        logging.error("FFmpeg not found. Cannot process video files.")
        return

    try:
        relative_path = os.path.relpath(video_path, base_dir)
        
        # --- Extract and Save Metadata ---
        metadata_path = get_metadata_path(relative_path)
        metadata = None
        
        if not metadata_path.exists() or not thumbnail_only:
            logging.info(f"Extracting metadata for {relative_path}...")
            metadata_path.parent.mkdir(parents=True, exist_ok=True)
            metadata = extract_video_metadata(video_path)
            
            if metadata:
                with open(metadata_path, 'w') as f:
                    json.dump(metadata, f, indent=2)
                logging.info(f"Metadata saved to {metadata_path}")
            else:
                logging.warning(f"Failed to extract metadata for {relative_path}")
        
        # --- Thumbnail Generation ---
        thumb_path = get_thumbnail_path(relative_path)
        if not thumb_path.exists():
            logging.info(f"Generating thumbnail for {relative_path}...")
            thumb_path.parent.mkdir(parents=True, exist_ok=True)
            cmd_thumb = [
                "ffmpeg", "-hide_banner",
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
                subprocess.run(cmd_thumb, check=True, capture_output=True, text=True, timeout=30)
                logging.info(f"Thumbnail generated: {thumb_path}")
            except subprocess.TimeoutExpired:
                logging.warning(f"Thumbnail generation timed out for {relative_path}, trying simpler approach")
                # Fallback with simpler options
                cmd_thumb = [
                    "ffmpeg", "-hide_banner", 
                    "-i", video_path, 
                    "-ss", "00:00:05", 
                    "-vframes", "1", 
                    "-y",
                    str(thumb_path)
                ]
                subprocess.run(cmd_thumb, check=True, capture_output=True, text=True, timeout=30)
                logging.info(f"Thumbnail generated with fallback method: {thumb_path}")
        else:
            logging.info(f"Thumbnail already exists for {relative_path}.")

        # Stop here if only thumbnail was requested
        if thumbnail_only:
            return

        # --- HLS Generation with Multiple Audio/Subtitle Tracks ---
        hls_master_path = get_hls_path(relative_path)
        hls_dir = hls_master_path.parent
        
        if not hls_master_path.exists():
            logging.info(f"Generating HLS for {relative_path}...")
            hls_dir.mkdir(parents=True, exist_ok=True)
            
            # Load metadata if not already loaded
            if not metadata and metadata_path.exists():
                try:
                    with open(metadata_path, 'r') as f:
                        metadata = json.load(f)
                except Exception as e:
                    logging.error(f"Error loading metadata: {e}")
                    metadata = None
            
            # Check for hardware acceleration support
            try:
                # Try NVIDIA hardware acceleration first
                nvenc_check = subprocess.run(
                    ["ffmpeg", "-hide_banner", "-encoders"], 
                    capture_output=True, text=True
                )
                use_hwaccel = "nvenc" in nvenc_check.stdout
                
                # If NVIDIA not available, try platform-specific alternatives
                if not use_hwaccel:
                    if os.name == 'nt':  # Windows
                        use_hwaccel = "qsv" in nvenc_check.stdout  # Intel QuickSync
                    else:  # Linux/Mac
                        use_hwaccel = "vaapi" in nvenc_check.stdout or "videotoolbox" in nvenc_check.stdout
                
                hwaccel_option = []
                video_codec = []
                
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
                    logging.info("No hardware acceleration available, using software encoding with reduced quality")
                    # Software encoding but with efficiency presets
                    video_codec = ["-c:v", "libx264", "-preset", "superfast", "-crf", "26"]
            except Exception as e:
                logging.warning(f"Error detecting hardware acceleration, falling back to software: {e}")
                # Software encoding fallback
                video_codec = ["-c:v", "libx264", "-preset", "superfast", "-crf", "26"]
            
            # Start building the FFmpeg command
            cmd_hls = [
                "ffmpeg", "-hide_banner",
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
                
            # Add subtitle stream mapping based on metadata
            has_subtitle_tracks = False
            if metadata and metadata.get("subtitle_tracks"):
                has_subtitle_tracks = True
                for track in metadata["subtitle_tracks"]:
                    # Map and extract subtitles separately to avoid encoding issues
                    subtitle_file = os.path.join(hls_dir, f"subtitle_{track['index']}.vtt")
                    sub_cmd = [
                        "ffmpeg", "-hide_banner",
                        "-i", video_path,
                        "-map", f"0:{track['index']}",
                        "-c:s", "webvtt",
                        "-y", subtitle_file
                    ]
                    try:
                        subprocess.run(sub_cmd, capture_output=True, text=True, check=True)
                        logging.info(f"Extracted subtitle track {track['index']} to {subtitle_file}")
                    except Exception as e:
                        logging.error(f"Failed to extract subtitle track {track['index']}: {e}")
            
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
                "audio_tracks": [],
                "subtitle_tracks": []
            }
            
            if metadata:
                variant_manifest["audio_tracks"] = metadata.get("audio_tracks", [])
                variant_manifest["subtitle_tracks"] = metadata.get("subtitle_tracks", [])
            
            # Save the variant manifest for the player to use
            variant_manifest_path = os.path.join(hls_dir, "variants.json")
            with open(variant_manifest_path, 'w') as f:
                json.dump(variant_manifest, f, indent=2)
            
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
                str(hls_master_path)
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
                        logging.info(f"HLS generation for {relative_path} in progress: {line.strip()}")
                        last_log_time = current_time
                    
                    # Implement timeout
                    if current_time - start_time > 1800:  # 30 minute timeout
                        process.terminate()
                        logging.error(f"HLS generation timed out for {relative_path}")
                        break
                
                # Get return code
                process.wait()
                if process.returncode == 0:
                    logging.info(f"HLS playlist created: {hls_master_path}")
                    
                    # Generate thumbnail previews for seeking (10 thumbnails throughout the video)
                    if metadata and metadata.get("video_info") and metadata["video_info"].get("duration"):
                        duration = float(metadata["video_info"]["duration"])
                        preview_dir = os.path.join(hls_dir, "previews")
                        os.makedirs(preview_dir, exist_ok=True)
                        
                        # Generate a thumbnail every 10% of the video
                        for i in range(10):
                            seek_time = duration * i / 10
                            preview_path = os.path.join(preview_dir, f"preview_{i}.jpg")
                            
                            preview_cmd = [
                                "ffmpeg", "-hide_banner",
                                "-ss", str(seek_time),
                                "-i", video_path,
                                "-vframes", "1",
                                "-vf", "scale=160:-1",
                                "-q:v", "5",
                                "-y", preview_path
                            ]
                            
                            try:
                                subprocess.run(preview_cmd, capture_output=True, check=True, timeout=10)
                            except Exception as e:
                                logging.warning(f"Failed to generate preview thumbnail {i}: {e}")
                else:
                    logging.error(f"HLS generation failed with code {process.returncode}")
                    
            except Exception as e:
                logging.error(f"Error during HLS generation: {e}")
                # Cleanup partial files
                if hls_dir.exists():
                    for file in hls_dir.glob("*.ts"):
                        file.unlink(missing_ok=True)
                    for file in hls_dir.glob("*.m3u8"):
                        file.unlink(missing_ok=True)
                return
        else:
            logging.info(f"HLS already exists for {relative_path}.")

    except subprocess.CalledProcessError as e:
        logging.error(f"FFmpeg failed for {video_path}. Error: {e.stderr}")
    except subprocess.TimeoutExpired:
        logging.error(f"FFmpeg timed out while processing {video_path}. It may be corrupt or too large.")
    except Exception as e:
        logging.error(f"An unexpected error occurred while processing {video_path}: {e}")