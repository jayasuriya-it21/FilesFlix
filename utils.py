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
    return shutil.which("ffmpeg") is not None

def get_file_hash(relative_path):
    return hashlib.md5(relative_path.encode()).hexdigest()

def get_thumbnail_path(relative_path):
    file_hash = get_file_hash(relative_path)
    return Config.THUMBNAIL_DIR / f"{file_hash}.jpg"

def get_hls_path(relative_path):
    file_hash = get_file_hash(relative_path)
    return Config.HLS_DIR / file_hash / "master.m3u8"

def get_metadata_path(relative_path):
    file_hash = get_file_hash(relative_path)
    return Config.METADATA_DIR / f"{file_hash}.json"

def extract_video_metadata(video_path):
    if not check_ffmpeg():
        logging.error("FFmpeg not found. Cannot extract video metadata.")
        return None
    
    try:
        cmd = [
            "ffprobe", "-v", "quiet", 
            "-print_format", "json", 
            "-show_format", "-show_streams", 
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        data = json.loads(result.stdout)
        metadata = {
            "audio_tracks": [],
            "subtitle_tracks": [],
            "video_info": None,
            "format": data.get("format", {})
        }
        
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
    if not check_ffmpeg():
        logging.error("FFmpeg not found. Cannot process video files.")
        return

    try:
        relative_path = os.path.relpath(video_path, base_dir)
        thumb_path = get_thumbnail_path(relative_path)
        hls_master_path = get_hls_path(relative_path)
        hls_dir = hls_master_path.parent
        
        if not thumb_path.exists():
            logging.info(f"Generating thumbnail for {relative_path}...")
            thumb_path.parent.mkdir(parents=True, exist_ok=True)
            cmd_thumb = [
                "ffmpeg", "-hide_banner",
                "-err_detect", "ignore_err", 
                "-i", video_path,
                "-ss", "00:00:10",
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
        
        if thumbnail_only:
            return
        
        if not hls_master_path.exists():
            logging.info(f"Generating HLS for {relative_path}...")
            hls_dir.mkdir(parents=True, exist_ok=True)
            
            metadata_path = get_metadata_path(relative_path)
            metadata = None
            if metadata_path.exists():
                try:
                    with open(metadata_path, 'r') as f:
                        metadata = json.load(f)
                except Exception as e:
                    logging.error(f"Error loading metadata: {e}")
                    metadata = None
            
            cmd_hls = [
                "ffmpeg", "-hide_banner",
                "-err_detect", "ignore_err",
                "-i", video_path,
                "-map", "0:v:0?",
            ]
            
            if metadata and metadata.get("audio_tracks"):
                for track in metadata["audio_tracks"]:
                    cmd_hls.extend(["-map", f"0:{track['index']}"])
            else:
                cmd_hls.extend(["-map", "0:a?"])
            
            if metadata and metadata.get("subtitle_tracks"):
                for track in metadata["subtitle_tracks"]:
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
            
            cmd_hls.extend([
                "-c:v", "libx264",
                "-preset", "superfast",
                "-crf", "26",
                "-c:a", "aac",
                "-b:a", "128k",
                "-hls_time", "4",
                "-hls_list_size", "0",
                "-hls_segment_type", "mpegts",
                "-hls_playlist_type", "event",
                "-hls_segment_filename", str(hls_dir / "segment%03d.ts"),
                "-f", "hls",
                "-y", str(hls_master_path)
            ])
            
            try:
                subprocess.run(cmd_hls, check=True, capture_output=True, text=True)
                logging.info(f"HLS playlist created: {hls_master_path}")
            except subprocess.CalledProcessError as e:
                logging.error(f"FFmpeg failed for {video_path}. Error: {e.stderr}")
            except Exception as e:
                logging.error(f"An unexpected error occurred while processing {video_path}: {e}")
        else:
            logging.info(f"HLS already exists for {relative_path}.")
    except Exception as e:
        logging.error(f"Error processing video {video_path}: {e}")
                    