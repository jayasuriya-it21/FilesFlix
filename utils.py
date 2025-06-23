# utils.py (Revised for Robustness)
import os
import subprocess
import logging
import hashlib
from config import Config
import shutil

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

# In utils.py

def generate_thumbnail_and_hls(video_path, base_dir):
    """
    A single function to generate both thumbnail and HLS playlist for a video.
    Designed to be run in a background thread.
    """
    if not check_ffmpeg():
        logging.error("FFmpeg not found. Cannot process video files.")
        return

    try:
        relative_path = os.path.relpath(video_path, base_dir)
        
        # --- Thumbnail Generation ---
        thumb_path = get_thumbnail_path(relative_path)
        if not thumb_path.exists():
            logging.info(f"Generating thumbnail for {relative_path}...")
            thumb_path.parent.mkdir(parents=True, exist_ok=True)
            cmd_thumb = [
                "ffmpeg", "-hide_banner",
                "-err_detect", "ignore_err", 
                "-i", video_path,
                "-ss", "00:00:10",
                # Explicitly map only the video stream to prevent errors
                "-map", "0:v:0?",
                "-vframes", "1",
                "-vf", f"scale={Config.THUMBNAIL_SIZE[0]}:-1",
                "-q:v", str(Config.THUMBNAIL_QUALITY),
                str(thumb_path)
            ]
            subprocess.run(cmd_thumb, check=True, capture_output=True, text=True, timeout=120)
            logging.info(f"Thumbnail created: {thumb_path}")
        else:
            logging.info(f"Thumbnail already exists for {relative_path}.")

        # --- HLS Generation ---
        hls_master_path = get_hls_path(relative_path)
        hls_dir = hls_master_path.parent
        if not hls_master_path.exists():
            logging.info(f"Generating HLS for {relative_path}...")
            hls_dir.mkdir(parents=True, exist_ok=True)
            cmd_hls = [
                "ffmpeg", "-hide_banner",
                "-err_detect", "ignore_err",
                "-i", video_path,
                # --- Stream Mapping ---
                # Map the best video stream
                "-map", "0:v:0?",
                # Map the best audio stream
                "-map", "0:a:0?",
                # --- Video Settings ---
                "-c:v", "libx264",
                "-crf", "23",
                "-preset", "veryfast",
                # --- Audio Settings ---
                "-c:a", "aac",
                "-b:a", "128k",
                # --- HLS Settings ---
                "-hls_time", "10",
                "-hls_list_size", "0",
                "-hls_segment_filename", str(hls_dir / "segment%03d.ts"),
                "-start_number", "0",
                str(hls_master_path)
            ]
            subprocess.run(cmd_hls, check=True, capture_output=True, text=True, timeout=600)
            logging.info(f"HLS playlist created: {hls_master_path}")
        else:
            logging.info(f"HLS already exists for {relative_path}.")

    except subprocess.CalledProcessError as e:
        logging.error(f"FFmpeg failed for {video_path}.")
        logging.error(f"FFmpeg stderr: {e.stderr}")
    except subprocess.TimeoutExpired:
        logging.error(f"FFmpeg timed out while processing {video_path}. It may be corrupt or too large.")
    except Exception as e:
        logging.error(f"An unexpected error occurred while processing {video_path}: {e}")