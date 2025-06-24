import os
import subprocess
import logging
import hashlib
import shutil
import json
import time
from pathlib import Path

# Setup logging
logging.basicConfig(
    filename="logs/file_flix.log",
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Configuration
class Config:
    THUMBNAIL_DIR = Path("previews")
    HLS_DIR = Path("static/hls")
    METADATA_DIR = Path("metadata")
    THUMBNAIL_SIZE = (160, 90)
    THUMBNAIL_QUALITY = 5
    HLS_SEGMENT_DURATION = 4
    PREVIEW_COUNT = 20

def check_ffmpeg():
    """Checks if FFmpeg is installed and in the system's PATH."""
    try:
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        logger.info("FFmpeg detected")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        logger.error("FFmpeg not found")
        return False

def get_file_hash(relative_path):
    """Creates a unique hash from the file's relative path."""
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
    """Extract metadata about audio, subtitle, and video streams from a video file."""
    if not check_ffmpeg():
        logger.error("FFmpeg not found. Cannot extract video metadata.")
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
            "audio_streams": [],
            "subtitle_streams": [],
            "video_info": None,
            "format": data.get("format", {})
        }

        for stream in data.get("streams", []):
            stream_type = stream.get("codec_type")
            stream_index = stream.get("index", 0)
            tags = stream.get("tags", {})

            if stream_type == "video" and not metadata["video_info"]:
                metadata["video_info"] = {
                    "codec": stream.get("codec_name", "unknown"),
                    "width": stream.get("width", 0),
                    "height": stream.get("height", 0),
                    "duration": float(stream.get("duration", metadata["format"].get("duration", 0))),
                    "bit_rate": stream.get("bit_rate", None),
                    "index": stream_index
                }

            elif stream_type == "audio":
                metadata["audio_streams"].append({
                    "index": stream_index,
                    "codec": stream.get("codec_name", "unknown"),
                    "language": tags.get("language", "und"),
                    "title": tags.get("title", f"Audio {stream_index}"),
                    "channels": stream.get("channels", 2),
                    "bit_rate": stream.get("bit_rate", None)
                })

            elif stream_type == "subtitle":
                metadata["subtitle_streams"].append({
                    "index": stream_index,
                    "codec": stream.get("codec_name", "unknown"),
                    "language": tags.get("language", "und"),
                    "title": tags.get("title", f"Subtitle {stream_index}")
                })

        logger.info(f"Metadata extracted for {video_path}")
        return metadata

    except subprocess.CalledProcessError as e:
        logger.error(f"Error extracting metadata from {video_path}: {e.stderr}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing metadata JSON for {video_path}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error extracting metadata for {video_path}: {e}")
        return None

def generate_thumbnail_and_hls(video_path, base_dir, thumbnail_only=False):
    """
    Generates thumbnail, seek previews, and optionally HLS playlist for a video.
    Preserves all audio and subtitle tracks from MKV files.
    """
    if not check_ffmpeg():
        logger.error("FFmpeg not found. Cannot process video files.")
        return

    try:
        relative_path = os.path.relpath(video_path, base_dir)
        file_hash = get_file_hash(relative_path)
        hls_dir = Config.HLS_DIR / file_hash
        preview_dir = hls_dir / "previews"

        # --- Extract and Save Metadata ---
        metadata_path = get_metadata_path(relative_path)
        metadata = None

        if not metadata_path.exists() or not thumbnail_only:
            logger.info(f"Extracting metadata for {relative_path}...")
            metadata_path.parent.mkdir(parents=True, exist_ok=True)
            metadata = extract_video_metadata(video_path)

            if metadata:
                with open(metadata_path, "w") as f:
                    json.dump(metadata, f, indent=2)
                logger.info(f"Metadata saved to {metadata_path}")
            else:
                logger.warning(f"Failed to extract metadata for {relative_path}")

        # --- Thumbnail Generation ---
        thumb_path = get_thumbnail_path(relative_path)
        if not thumb_path.exists():
            logger.info(f"Generating thumbnail for {relative_path}...")
            thumb_path.parent.mkdir(parents=True, exist_ok=True)
            cmd_thumb = [
                "ffmpeg", "-hide_banner",
                "-i", video_path,
                "-ss", "00:00:10",
                "-map", "0:v:0?",
                "-vframes", "1",
                "-vf", f"scale={Config.THUMBNAIL_SIZE[0]}:{Config.THUMBNAIL_SIZE[1]}",
                "-q:v", str(Config.THUMBNAIL_QUALITY),
                "-y",
                str(thumb_path)
            ]

            try:
                subprocess.run(cmd_thumb, check=True, capture_output=True, text=True, timeout=15)
                logger.info(f"Thumbnail generated: {thumb_path}")
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
                logger.warning(f"Thumbnail generation failed for {relative_path}: {e}")
                cmd_fallback = [
                    "ffmpeg", "-hide_banner",
                    "-i", video_path,
                    "-ss", "00:00:05",
                    "-vframes", "1",
                    "-y",
                    str(thumb_path)
                ]
                subprocess.run(cmd_fallback, check=True, capture_output=True, text=True, timeout=10)
                logger.info(f"Fallback thumbnail generated: {thumb_path}")

        # --- Seek Preview Thumbnails ---
        if not thumbnail_only and metadata and metadata["video_info"].get("duration"):
            duration = float(metadata["video_info"]["duration"])
            preview_dir.mkdir(parents=True, exist_ok=True)
            existing_previews = len(list(preview_dir.glob("preview_*.jpg")))
            if existing_previews < Config.PREVIEW_COUNT:
                logger.info(f"Generating {Config.PREVIEW_COUNT} seek previews for {relative_path}...")
                for i in range(Config.PREVIEW_COUNT):
                    preview_path = preview_dir / f"preview_{i:03d}.jpg"
                    if preview_path.exists():
                        continue
                    seek_time = duration * i / Config.PREVIEW_COUNT
                    cmd_preview = [
                        "ffmpeg", "-hide_banner",
                        "-ss", str(seek_time),
                        "-i", video_path,
                        "-vframes", "1",
                        "-vf", f"scale={Config.THUMBNAIL_SIZE[0]}:{Config.THUMBNAIL_SIZE[1]}",
                        "-q:v", str(Config.THUMBNAIL_QUALITY),
                        "-y",
                        str(preview_path)
                    ]
                    try:
                        subprocess.run(cmd_preview, capture_output=True, check=True, text=True, timeout=10)
                        logger.debug(f"Generated preview {i}: {preview_path}")
                    except Exception as e:
                        logger.warning(f"Failed to generate preview {i} for {relative_path}: {e}")

        if thumbnail_only:
            return

        # --- HLS Generation with Audio/Subtitle Tracks ---
        hls_master_path = get_hls_path(relative_path)
        if not hls_master_path.exists():
            logger.info(f"Generating HLS for {relative_path}...")
            hls_dir.mkdir(parents=True, exist_ok=True)

            # Load metadata if not already loaded
            if not metadata and metadata_path.exists():
                with open(metadata_path, "r") as f:
                    metadata = json.load(f)

            # Detect hardware acceleration
            video_codec = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]
            hwaccel_option = []
            try:
                encoders = subprocess.run(
                    ["ffmpeg", "-hide_banner", "-encoders"],
                    capture_output=True, text=True
                ).stdout
                if "h264_nvenc" in encoders:
                    logger.info("Using NVIDIA NVENC")
                    video_codec = ["-c:v", "h264_nvenc", "-preset", "p4"]
                elif "h264_qsv" in encoders and os.name == "nt":
                    logger.info("Using Intel QuickSync")
                    video_codec = ["-c:v", "h264_qsv", "-preset", "medium"]
                elif "hls" in encoders:
                    logger.info(f"Using hls for encoding")
                    video_codec = ["-c:v", "hls"]
                else:
                    logger.info("Using software encoding")
            except Exception as e:
                logger.warning(f"Failed to encode video {relative_path}: {e}")
                video_codec = None

            # Build FFmpeg HLS command
            cmd_hls = [
                "ffmpeg", "-hide_banner",
                "-i",
                video_path,
                "-map",
                "0:v:0",
            ]

            # Map audio tracks
            audio_streams = metadata.get("audio_streams", []) if metadata else []
            for i, track in enumerate(audio_streams):
                cmd_hls.extend(["-map", f"0:{track['index']}"])
                cmd_hls.extend([f"-c:a:{i}", "aac", f"-b:a:{i}", "128k"])

            # Extract subtitle tracks
            subtitle_streams = metadata.get("subtitle_streams", []) if metadata else []
            for track in subtitle_streams:
                subtitle_file = hls_dir / f"subtitle_{track['index']}.vtt"
                if not subtitle_file.exists():
                    cmd_sub = [
                        "ffmpeg", "-hide_banner",
                        "-i", video_path,
                        "-map", f"0:{track['index']}",
                        "-c:s", "webvtt",
                        "-y", str(subtitle_file)
                    ]
                    try:
                        subprocess.run(cmd_sub, capture_output=True, text=True, check=True, timeout=30)
                        logger.info(f"Extracted subtitle {track['index']}: {subtitle_file}")
                    except Exception as e:
                        logger.error(f"Failed to extract subtitle {track['index']} for {relative_path}: {e}")

            cmd_hls.extend(hwaccel_option + video_codec)
            cmd_hls.extend([
                "-hls_time", str(Config.HLS_SEGMENT_DURATION),
                "-hls_list_size", "0",
                "-hls_segment_type", "mpegts",
                "-hls_playlist_type", "vod",
                "-hls_segment_filename", str(hls_dir / "segment%03d.ts"),
                "-hls_flags", "independent_segments",
                "-f", "hls",
                "-y", str(hls_master_path)
            ])

            # Generate variant manifest
            variant_manifest = {
                "video": {"index": 0, "name": "Main Video"},
                "audio_streams": audio_streams,
                "subtitle_streams": [{"index": track["index"], "name": track["title"], "language": track["language"]} for track in subtitle_streams]
            }
            with open(hls_dir / "variants.json", "w") as f:
                json.dump(variant_manifest, f, indent=2)

            # Run HLS generation
            try:
                process = subprocess.Popen(
                    cmd_hls,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                    universal_newlines=True
                )
                start_time = time.time()
                last_log = start_time

                for line in process.stderr:
                    if time.time() - last_log > 10:
                        logger.debug(f"HLS progress for {relative_path}: {line.strip()}")
                        last_log = time.time()
                    if time.time() - start_time > 1800:
                        process.terminate()
                        logger.error(f"HLS generation timed out for {relative_path}")
                        break

                process.wait()
                if process.returncode == 0:
                    logger.info(f"HLS generated: {hls_master_path}")
                else:
                    logger.error(f"HLS generation failed for {relative_path} with code {process.returncode}")
            except Exception as e:
                logger.error(f"Error generating HLS for {relative_path}: {e}")
                shutil.rmtree(hls_dir, ignore_errors=True)

    except Exception as e:
        logger.error(f"Unexpected error processing {relative_path}: {e}")

def generate_audio_track(video_path, base_dir, audio_index):
    """Generates HLS playlist for a specific audio track."""
    if not check_ffmpeg():
        logger.error("FFmpeg not found. Cannot generate audio track.")
        return None

    try:
        relative_path = os.path.relpath(video_path, base_dir)
        file_hash = get_file_hash(relative_path)
        hls_dir = Config.HLS_DIR / file_hash
        audio_m3u8 = hls_dir / f"audio_{audio_index}.m3u8"

        if not audio_m3u8.exists():
            hls_dir.mkdir(parents=True, exist_ok=True)
            cmd_audio = [
                "ffmpeg", "-hide_banner",
                "-i", video_path,
                "-map", f"0:a:{audio_index}",
                "-c:a", "aac",
                "-b:a", "128k",
                "-hls_time", str(Config.HLS_SEGMENT_DURATION),
                "-hls_list_size", "0",
                "-hls_segment_filename", str(hls_dir / f"audio_{audio_index}_%03d.ts"),
                "-f", "hls",
                "-y", str(audio_m3u8)
            ]
            subprocess.run(cmd_audio, capture_output=True, text=True, check=True, timeout=300)
            logger.info(f"Generated audio track {audio_index} for {relative_path}")
        return audio_m3u8
    except Exception as e:
        logger.error(f"Error generating audio track {audio_index} for {relative_path}: {e}")
        return None