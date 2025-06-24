import os
import hashlib
import json
import logging
import mimetypes
import re
import subprocess
import shutil
import math
from datetime import datetime
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    request,
    jsonify,
    send_file,
    render_template,
    Response,
    session,
    redirect,
    url_for,
    g,
)
from waitress import serve
import psutil
from PIL import Image
import requests

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.urandom(24)  # Secure session key

# Set a valid default directory that exists
default_dirs = [
    os.path.expanduser("~/Videos"),
    os.path.expanduser("~/Documents"),
    os.path.expanduser("~/Desktop"),
    os.path.expanduser("~"),
    os.getcwd()
]

# Find the first existing directory
for dir_path in default_dirs:
    try:
        if os.path.exists(dir_path) and os.path.isdir(dir_path) and os.access(dir_path, os.R_OK):
            app.config["BASE_DIR"] = os.path.abspath(dir_path)
            break
    except (OSError, IOError):
        continue
else:
    # Fallback to current directory
    app.config["BASE_DIR"] = os.path.abspath(".")

# Add request logger middleware to capture IP and user info
@app.before_request
def request_logger():
    """Log information about each request"""
    g.client_ip = request.remote_addr
    g.user = session.get("username", "Anonymous")
    
    # Only log API and page requests, not static files
    if not request.path.startswith('/static/'):
        endpoint = request.endpoint or 'Unknown'
        method = request.method
        path = request.path
        logger.info(f"Request: {method} {path} (Endpoint: {endpoint})", 
                   extra={'ip': g.client_ip, 'user': g.user})

app.config["ALLOWED_EXTENSIONS"] = {
    ".mp4",
    ".mkv",
    ".avi",
    ".mov",
    ".wmv",
    ".flv",
    ".webm",
    ".mp3",
    ".wav",
    ".aac",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".pdf",
    ".txt",
    ".doc",
    ".docx",
}

# Setup logging
# Configure logging to use both file and console handlers
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create file handler for logging to a file
file_handler = logging.FileHandler("logs/file_flix.log")
file_handler.setLevel(logging.INFO)
file_format = logging.Formatter("%(asctime)s - %(levelname)s - [%(ip)s] [%(user)s] - %(message)s")
file_handler.setFormatter(file_format)

# Create console handler for logging to the console
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_format = logging.Formatter("%(asctime)s - %(levelname)s - [%(ip)s] [%(user)s] - %(message)s")
console_handler.setFormatter(console_format)

# Add both handlers to the logger
logger.addHandler(file_handler)
logger.addHandler(console_handler)

# Create a filter to add IP address and user info to log records
class ContextFilter(logging.Filter):
    """
    This filter adds IP address and user information to log records
    """
    def filter(self, record):
        # Only add context info if we're within Flask application context
        try:
            record.ip = getattr(g, 'client_ip', 'N/A')
            record.user = getattr(g, 'user', 'Anonymous')
        except RuntimeError:
            # Outside application context (e.g., during startup)
            record.ip = 'N/A'
            record.user = 'System'
        return True

logger.addFilter(ContextFilter())

# Ensure directories exist
os.makedirs("logs", exist_ok=True)
os.makedirs("previews", exist_ok=True)

# Hardcoded host credentials (replace with secure storage in production)
HOST_USERNAME = "admin"
HOST_PASSWORD_HASH = hashlib.sha256("admin123".encode()).hexdigest()

def check_ffmpeg():
    """Check if FFmpeg is available."""
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

# Add a function to log route activity with parameters
def log_route_activity(action, details=None):
    """Log an activity on a route with relevant details"""
    user_info = session.get("username", "Anonymous")
    if session.get("is_host"):
        user_info += " (Host)"
    
    log_message = f"Activity: {action}"
    if details:
        if isinstance(details, dict):
            details_str = ", ".join([f"{k}={v}" for k, v in details.items()])
            log_message += f" - Details: {details_str}"
        else:
            log_message += f" - Details: {details}"
    
    logger.info(log_message)

# Create login required decorator with logging
def login_required(f):
    """Decorator to restrict access to Host routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("is_host"):
            logger.warning(f"Unauthorized access attempt to {request.path}", 
                         extra={'ip': request.remote_addr, 'user': 'Anonymous'})
            log_route_activity("Unauthorized access attempt", {"route": request.path})
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function

@app.route("/login", methods=["GET", "POST"])
def login():
    """Handle Host login."""
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        if username == HOST_USERNAME and password_hash == HOST_PASSWORD_HASH:
            session["is_host"] = True
            session["username"] = username
            logger.info(f"Host login successful", extra={'ip': request.remote_addr, 'user': username})
            log_route_activity("Login", {"username": username, "status": "success"})
            return redirect(url_for("host"))
        
        logger.warning(f"Failed login attempt", extra={'ip': request.remote_addr, 'user': 'Unknown'})
        log_route_activity("Login", {"username": username, "status": "failed"})
        return render_template("login.html", error="Invalid credentials", is_host=False, logged_in=False)
    
    log_route_activity("Login page view")
    return render_template("login.html", is_host=False, logged_in=False)

@app.route("/logout")
@login_required
def logout():
    """Handle Host logout."""
    username = session.get("username", "Unknown")
    session.pop("is_host", None)
    session.pop("username", None)
    logger.info(f"Host logout", extra={'ip': request.remote_addr, 'user': username})
    log_route_activity("Logout", {"username": username})
    return redirect(url_for("login"))

@app.route("/")
def index():
    """Render main client view."""
    log_route_activity("Home page view")
    is_host = session.get("is_host", False)
    # Clients can access without login, Hosts need authentication for admin features
    return render_template("index.html", is_host=is_host, logged_in=is_host)

@app.route("/host")
@login_required
def host():
    """Render Host dashboard."""
    log_route_activity("Host dashboard view")
    is_host = session.get("is_host", False)
    current_dir = app.config.get("BASE_DIR", "")
    return render_template("host.html", is_host=is_host, logged_in=is_host, current_dir=current_dir)

@app.route("/favicon.ico")
def favicon():
    """Serve favicon."""
    return '', 204  # No content

@app.route("/api/files", methods=["GET"])
def list_files():
    """List files and directories for Client and Host."""
    path = request.args.get("path", "")
    file_type = request.args.get("type", "all")
    
    log_route_activity("List files", {"path": path, "filter": file_type})
    logger.info(f"List files request - Path: '{path}', Filter: '{file_type}'", extra={'ip': request.remote_addr, 'user': g.user})
    
    # Make sure we have a valid BASE_DIR
    if not os.path.isdir(app.config["BASE_DIR"]):
        # Try to find a valid directory
        for dir_path in default_dirs:
            if os.path.exists(dir_path) and os.path.isdir(dir_path) and os.access(dir_path, os.R_OK):
                app.config["BASE_DIR"] = os.path.abspath(dir_path)
                logger.info(f"Reset BASE_DIR to: {app.config['BASE_DIR']}", extra={'ip': request.remote_addr, 'user': g.user})
                break
        else:
            logger.error("No valid base directory found", extra={'ip': request.remote_addr, 'user': g.user})
            return jsonify({"success": False, "error": "No valid directory available"}), 500
    
    # Handle empty path or root request
    if not path or path == "/" or path == "\\":
        full_path = app.config["BASE_DIR"]
        logger.info(f"Using base directory: {full_path}", extra={'ip': request.remote_addr, 'user': g.user})
    else:
        # Remove leading slash and join with base directory
        clean_path = path.lstrip("/").lstrip("\\")
        full_path = os.path.join(app.config["BASE_DIR"], clean_path)
        logger.info(f"Path resolved to: {full_path}", extra={'ip': request.remote_addr, 'user': g.user})
      # Normalize the path
    full_path = os.path.abspath(full_path)
    base_dir = os.path.abspath(app.config["BASE_DIR"])
    
    # Log for debugging
    logger.info(f"List files - Processing request: path={path}, full_path={full_path}, base_dir={base_dir}", 
               extra={'ip': request.remote_addr, 'user': g.user})
      # Security check: ensure path is within base directory - but allow the base directory itself
    # On Windows, handle case sensitivity in path comparison
    if os.name == 'nt':
        # Case-insensitive comparison for Windows
        if full_path.lower() != base_dir.lower() and not full_path.lower().startswith(base_dir.lower()):
            logger.warning(f"Forbidden path access attempt: {path} -> {full_path}, base dir: {base_dir}", 
                         extra={'ip': request.remote_addr, 'user': g.user})
            return jsonify({"success": False, "error": "Access denied"}), 403
    else:
        # Case-sensitive comparison for Unix-like systems
        if full_path != base_dir and not full_path.startswith(base_dir):
            logger.warning(f"Forbidden path access attempt: {path} -> {full_path}, base dir: {base_dir}", 
                         extra={'ip': request.remote_addr, 'user': g.user})
            return jsonify({"success": False, "error": "Access denied"}), 403

    if not os.path.exists(full_path):
        logger.warning(f"Path does not exist: {full_path}", 
                     extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"success": False, "error": "Path not found"}), 404

    try:
        items = []
        if os.path.isdir(full_path):
            for item in sorted(Path(full_path).iterdir()):
                if item.name.startswith("."):
                    continue
                
                try:
                    # Check if the item is accessible (not a broken symlink)
                    if not item.exists():
                        logger.debug(f"Skipping broken symlink: {item}", 
                                   extra={'ip': request.remote_addr, 'user': g.user})
                        continue
                    
                    stats = item.stat()
                    item_type = "folder" if item.is_dir() else get_file_type(item)
                    
                    # Apply filter
                    if file_type != "all" and item_type != file_type and item_type != "folder":
                        continue
                    
                    relative_path = os.path.relpath(item, base_dir).replace("\\", "/")
                    
                    items.append({
                        "name": item.name,
                        "path": relative_path,
                        "type": item_type,
                        "size": stats.st_size if item.is_file() else 0,
                        "mtime": datetime.fromtimestamp(stats.st_mtime).isoformat(),
                    })
                except (OSError, IOError, FileNotFoundError) as item_error:
                    # Skip files/folders that can't be accessed (broken symlinks, permissions, etc.)
                    logger.debug(f"Skipping inaccessible item {item}: {item_error}", 
                               extra={'ip': request.remote_addr, 'user': g.user})
                    continue
        
        current_path = os.path.relpath(full_path, base_dir).replace("\\", "/")
        if current_path == ".":
            current_path = ""
            
        return jsonify({
            "success": True,
            "files": items, 
            "path": current_path,
            "total": len(items)
        })
    except Exception as e:
        logger.error(f"Error listing files in {full_path}: {e}", 
                   extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"success": False, "error": "Failed to list files"}), 500

def get_file_type(file_path):
    """Determine file type based on extension."""
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type:
        if mime_type.startswith('video'):
            return 'video'
        elif mime_type.startswith('audio'):
            return 'audio'
        elif mime_type.startswith('image'):
            return 'image'
        elif mime_type.startswith('text') or mime_type == 'application/pdf':
            return 'document'
    
    # Fallback based on extension
    ext = file_path.suffix.lower()
    if ext in ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm']:
        return 'video'
    elif ext in ['.mp3', '.wav', '.aac', '.flac', '.ogg']:
        return 'audio'
    elif ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']:
        return 'image'
    elif ext in ['.pdf', '.txt', '.doc', '.docx']:
        return 'document'
    
    return 'file'

@app.route("/api/search", methods=["GET"])
def search_files():
    """Search files and directories for Client."""
    query = request.args.get("q", "").lower()
    
    log_route_activity("Search files", {"query": query})
    
    if not query:
        logger.info(f"Empty search query", extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"results": []})

    try:
        results = []
        match_count = 0
        
        for root, _, files in os.walk(app.config["BASE_DIR"]):
            if not root.startswith(app.config["BASE_DIR"]):
                continue
            for name in files + [d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d))]:
                if query in name.lower():
                    item_path = os.path.join(root, name)
                    stats = os.stat(item_path)
                    item_type = "folder" if os.path.isdir(item_path) else mimetypes.guess_type(item_path)[0]
                    if os.path.isfile(item_path) and Path(item_path).suffix.lower() not in app.config["ALLOWED_EXTENSIONS"]:
                        continue
                    
                    match_count += 1
                    results.append({
                        "name": name,
                        "path": os.path.relpath(item_path, app.config["BASE_DIR"]).replace("\\", "/"),
                        "type": item_type or "file",
                        "size": stats.st_size,
                        "mtime": datetime.fromtimestamp(stats.st_mtime).isoformat(),
                    })
        
        logger.info(f"Search completed: '{query}' - Found {match_count} matches", 
                 extra={'ip': request.remote_addr, 'user': g.user})
        
        return jsonify({"results": results})
    except Exception as e:
        logger.error(f"Search error for query '{query}': {str(e)}", 
                  extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"error": "Search failed", "results": []}), 500

@app.route("/api/stream/<path:file_path>")
def stream_file(file_path):
    """Stream media files for Client."""
    log_route_activity("Stream file", {"file": file_path})
    
    full_path = os.path.join(app.config["BASE_DIR"], file_path)
    if not os.path.exists(full_path) or not full_path.startswith(app.config["BASE_DIR"]):
        logger.warning(f"File not found: {file_path}", extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"error": "File not found"}), 404

    try:
        range_header = request.headers.get("Range", None)
        if not range_header:
            return send_file(full_path, mimetype=mimetypes.guess_type(full_path)[0])

        size = os.path.getsize(full_path)
        byte1, byte2 = 0, None
        m = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if m:
            byte1 = int(m.group(1))
            if m.group(2):
                byte2 = int(m.group(2))

        length = size - byte1 if byte2 is None else byte2 - byte1 + 1
        resp = Response(
            get_file_chunk(full_path, byte1, length),
            206,
            mimetype=mimetypes.guess_type(full_path)[0],
            direct_passthrough=True,
        )
        resp.headers.set("Content-Range", f"bytes {byte1}-{byte1 + length - 1}/{size}")
        resp.headers.set("Accept-Ranges", "bytes")
        logger.info(f"Streaming file: {file_path}")
        return resp
    except Exception as e:
        logger.error(f"Error streaming file {file_path}: {e}")
        return jsonify({"error": "Streaming failed"}), 500

def get_file_chunk(file_path, start, length):
    """Helper to read file chunk."""
    with open(file_path, "rb") as f:
        f.seek(start)
        return f.read(length)

@app.route("/api/metadata/<path:file_path>")
def get_metadata(file_path):
    """Fetch media metadata for Client."""
    log_route_activity("Fetch metadata", {"file": file_path})
    
    full_path = os.path.join(app.config["BASE_DIR"], file_path)
    if not os.path.exists(full_path) or not full_path.startswith(app.config["BASE_DIR"]):
        logger.warning(f"Metadata requested for non-existent file: {file_path}", 
                     extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"error": "File not found"}), 404

    try:
        if not check_ffmpeg():
            logger.warning(f"FFmpeg not available for metadata extraction: {file_path}", 
                         extra={'ip': request.remote_addr, 'user': g.user})
            return jsonify({"error": "FFmpeg not available"}), 500

        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            full_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        metadata = json.loads(result.stdout)

        audio_streams = [
            {"index": i, "title": s.get("tags", {}).get("title", f"Audio {i}"), "language": s.get("tags", {}).get("language", "und")}
            for i, s in enumerate(metadata.get("streams", [])) if s.get("codec_type") == "audio"
        ]
        subtitle_streams = [
            {"index": i, "title": s.get("tags", {}).get("title", f"Subtitle {i}"), "language": s.get("tags", {}).get("language", "und")}
            for i, s in enumerate(metadata.get("streams", [])) if s.get("codec_type") == "subtitle"
        ]
        
        duration = float(metadata.get("format", {}).get("duration", 0))
        
        logger.info(f"Metadata extracted for {file_path}: duration={duration:.2f}s, "
                  f"audio_streams={len(audio_streams)}, subtitle_streams={len(subtitle_streams)}", 
                  extra={'ip': request.remote_addr, 'user': g.user})

        return jsonify({
            "duration": duration,
            "audio_streams": audio_streams,
            "subtitle_streams": subtitle_streams,
        })
    except Exception as e:
        logger.error(f"Error fetching metadata for {file_path}: {e}", 
                   extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"error": "Failed to fetch metadata"}), 500

@app.route("/api/hls/<path:file_path>")
def stream_hls(file_path):
    """Generate HLS playlist for Client."""
    full_path = os.path.join(app.config["BASE_DIR"], file_path)
    if not os.path.exists(full_path) or not full_path.startswith(app.config["BASE_DIR"]):
        return jsonify({"error": "File not found"}), 404

    try:
        if not check_ffmpeg():
            return jsonify({"error": "FFmpeg not available"}), 500

        file_hash = hashlib.md5(full_path.encode()).hexdigest()
        hls_dir = os.path.join("static", "hls", file_hash)
        os.makedirs(hls_dir, exist_ok=True)
        m3u8_path = os.path.join(hls_dir, "playlist.m3u8")

        if not os.path.exists(m3u8_path):
            cmd = [
                "ffmpeg",
                "-i",
                full_path,
                "-c:v",
                "libx264",
                "-c:a",
                "aac",
                "-f",
                "hls",
                "-hls_time",
                "10",
                "-hls_list_size",
                "0",
                "-hls_segment_filename",
                os.path.join(hls_dir, "segment_%03d.ts"),
                m3u8_path,
            ]
            subprocess.run(cmd, capture_output=True, check=True)

        return send_file(m3u8_path, mimetype="application/x-mpegURL")
    except Exception as e:
        logger.error(f"Error generating HLS for {file_path}: {e}")
        return jsonify({"error": "HLS streaming failed"}), 500

@app.route("/api/hls/<hash>/<segment>")
def serve_hls_segment(hash, segment):
    """Serve HLS segments and subtitles for Client."""
    segment_path = os.path.join("static", "hls", hash, segment)
    if not os.path.exists(segment_path):
        return jsonify({"error": "Segment not found"}), 404

    try:
        if segment.endswith(".vtt"):
            return send_file(segment_path, mimetype="text/vtt")
        return send_file(segment_path, mimetype="video/mp2t")
    except Exception as e:
        logger.error(f"Error serving HLS segment {segment}: {e}")
        return jsonify({"error": "Failed to serve segment"}), 500

@app.route("/api/previews/<hash>/<preview>")
def serve_preview(hash, preview):
    """Serve preview thumbnails for Client."""
    preview_path = os.path.join("previews", hash, preview)
    if not os.path.exists(preview_path):
        return jsonify({"error": "Preview not found"}), 404

    try:
        return send_file(preview_path, mimetype="image/jpeg")
    except Exception as e:
        logger.error(f"Error serving preview {preview}: {e}")
        return jsonify({"error": "Failed to serve preview"}), 500

@app.route("/api/generate_previews/<path:file_path>")
def generate_previews(file_path):
    """Generate preview thumbnails for Client."""
    log_route_activity("Generate previews", {"file": file_path})
    
    full_path = os.path.join(app.config["BASE_DIR"], file_path)
    if not os.path.exists(full_path) or not full_path.startswith(app.config["BASE_DIR"]):
        logger.warning(f"Previews requested for non-existent file: {file_path}", 
                     extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"error": "File not found"}), 404

    try:
        if not check_ffmpeg():
            logger.warning(f"FFmpeg not available for preview generation: {file_path}", 
                         extra={'ip': request.remote_addr, 'user': g.user})
            return jsonify({"error": "FFmpeg not available"}), 500

        file_hash = hashlib.md5(full_path.encode()).hexdigest()
        preview_dir = os.path.join("previews", file_hash)
        os.makedirs(preview_dir, exist_ok=True)

        cmd = [
            "ffmpeg",
            "-i",
            full_path,
            "-vf",
            "fps=1/10",
            "-s",
            "160x90",
            os.path.join(preview_dir, "preview_%03d.jpg"),
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        logger.info(f"Generated previews for {file_path}", 
                  extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"Error generating previews for {file_path}: {e}", 
                   extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"error": "Failed to generate previews"}), 500

@app.route("/api/system_status")
@login_required
def system_status():
    """Fetch system status for Host."""
    log_route_activity("System status check")
    try:
        cpu_usage = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        memory_usage = memory.percent
        ffmpeg_available = check_ffmpeg()
        
        # Get local IP address
        import socket
        try:
            # Connect to a remote address to get the local IP
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                local_ip = s.getsockname()[0]
        except Exception:
            local_ip = "127.0.0.1"
        
        # Get server URL
        server_url = f"http://{local_ip}:5000"
        
        status_data = {
            "success": True,
            "status": {
                "server": True,
                "ffmpeg": ffmpeg_available,
                "cpu": f"{cpu_usage:.1f}",
                "memory": f"{memory_usage:.1f}",
                "directory": app.config["BASE_DIR"],
                "ip": local_ip,
                "url": server_url.lower()
            }
        }
        
        logger.info(f"System status retrieved: CPU={cpu_usage:.1f}%, Memory={memory_usage:.1f}%, FFmpeg={ffmpeg_available}", 
                   extra={'ip': request.remote_addr, 'user': g.user})
        
        return jsonify(status_data)
    except Exception as e:
        logger.error(f"Error fetching system status: {e}", extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"success": False, "error": "Failed to fetch system status"}), 500

# Add alternative endpoint with hyphen for frontend compatibility
@app.route("/api/system-status")
@login_required
def system_status_alt():
    """Alternative endpoint for system status with hyphen."""
    return system_status()

@app.route("/api/set_directory", methods=["POST"])
def set_directory():
    """Set media directory for Host."""
    try:
        # Handle both form data and JSON request
        if request.is_json:
            data = request.json
            new_dir = data.get("directory", "").strip()
        else:
            new_dir = request.form.get("directory", "").strip()
        
        log_route_activity("Set directory", {"directory": new_dir})
        logger.info(f"Set directory request received: {new_dir}", extra={'ip': request.remote_addr, 'user': g.user})
        
        if not new_dir:
            logger.error("Empty directory path", extra={'ip': request.remote_addr, 'user': g.user})
            return jsonify({"success": False, "error": "Directory path is required"}), 400
        
        if not os.path.exists(new_dir):
            logger.error(f"Directory does not exist: {new_dir}", extra={'ip': request.remote_addr, 'user': g.user})
            return jsonify({"success": False, "error": "Directory does not exist"}), 400
        
        if not os.path.isdir(new_dir):
            logger.error(f"Path is not a directory: {new_dir}", extra={'ip': request.remote_addr, 'user': g.user})
            return jsonify({"success": False, "error": "Path is not a directory"}), 400

        # Try to access the directory
        if not os.access(new_dir, os.R_OK):
            logger.error(f"Directory not readable: {new_dir}", extra={'ip': request.remote_addr, 'user': g.user})
            return jsonify({"success": False, "error": "Directory not readable"}), 400

        new_dir = os.path.abspath(new_dir)
        app.config["BASE_DIR"] = new_dir
        logger.info(f"Media directory set to: {new_dir}", extra={'ip': request.remote_addr, 'user': g.user})
        
        # Return directory info along with success
        return jsonify({
            "success": True, 
            "directory": new_dir,
            "readable": os.access(new_dir, os.R_OK),
            "writable": os.access(new_dir, os.W_OK)
        })
    except Exception as e:
        logger.error(f"Error setting directory: {e}", extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"success": False, "error": f"Failed to set directory: {str(e)}"}), 500

# Add alternative endpoint with hyphen for frontend compatibility
@app.route("/api/set-directory", methods=["POST"])
def set_directory_alt():
    """Alternative endpoint for set directory with hyphen."""
    return set_directory()

# Add select directory endpoint for frontend
@app.route("/api/select-directory", methods=["GET", "POST"])
def select_directory():
    """Select directory endpoint for frontend compatibility."""
    if request.method == "GET":
        # Return current directory info and suggested directories
        log_route_activity("Get directory suggestions")
        
        # Common directories that users might want to use
        suggestions = []
        common_dirs = [
            os.path.expanduser("~/Videos"),
            os.path.expanduser("~/Movies"),
            os.path.expanduser("~/Music"),
            os.path.expanduser("~/Pictures"),
            os.path.expanduser("~/Documents"),
            os.path.expanduser("~/Downloads"),
            os.path.expanduser("~/Desktop"),
            "C:\\Users\\Public\\Videos" if os.name == 'nt' else "/home/shared/videos",
            "D:\\Movies" if os.name == 'nt' else "/media",
            "E:\\Media" if os.name == 'nt' else "/mnt/media"
        ]
        
        for dir_path in common_dirs:
            try:
                if os.path.exists(dir_path) and os.path.isdir(dir_path) and os.access(dir_path, os.R_OK):
                    suggestions.append({
                        "path": os.path.abspath(dir_path),
                        "name": os.path.basename(dir_path) or dir_path,
                        "exists": True
                    })
            except (OSError, IOError):
                continue
        
        return jsonify({
            "success": True,
            "current_directory": app.config["BASE_DIR"],
            "suggestions": suggestions[:10],  # Limit to 10 suggestions
            "message": "Directory suggestions available"
        })
    else:
        # Handle POST request to set directory
        return set_directory()

# Add scan media endpoint
@app.route("/api/scan-media", methods=["GET", "POST"])
@login_required
def scan_media():
    """Scan media files in current directory."""
    log_route_activity("Scan media")
    try:
        # Get current directory
        base_dir = app.config["BASE_DIR"]
        
        if not os.path.exists(base_dir):
            logger.warning(f"Base directory does not exist: {base_dir}", extra={'ip': request.remote_addr, 'user': g.user})
            return jsonify({"success": False, "error": "Base directory does not exist"}), 400
        
        # Count media files
        media_count = 0
        total_size = 0
        
        for root, dirs, files in os.walk(base_dir):
            for file in files:
                file_path = os.path.join(root, file)
                if Path(file_path).suffix.lower() in app.config["ALLOWED_EXTENSIONS"]:
                    media_count += 1
                    try:
                        total_size += os.path.getsize(file_path)
                    except (OSError, IOError):
                        continue
        
        result = {
            "success": True,
            "scan_results": {
                "directory": base_dir,
                "media_files": media_count,
                "total_size": total_size,
                "total_size_formatted": format_file_size(total_size)
            }
        }
        
        logger.info(f"Media scan completed: {media_count} files, {format_file_size(total_size)}", 
                   extra={'ip': request.remote_addr, 'user': g.user})
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error scanning media: {e}", extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"success": False, "error": "Failed to scan media"}), 500

def format_file_size(bytes_size):
    """Format file size to human readable format."""
    if bytes_size == 0:
        return "0 B"
    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = int(math.floor(math.log(bytes_size, 1024)))
    p = math.pow(1024, i)
    s = round(bytes_size / p, 2)
    return f"{s} {size_names[i]}"

@app.route("/api/hls/<hash>/audio_<int:index>.m3u8")
def serve_audio_track(hash, index):
    """Serve specific audio track HLS playlist for Client."""
    # Placeholder: Requires FFmpeg to extract and transcode audio track
    try:
        hls_dir = os.path.join("static", "hls", hash)
        audio_m3u8 = os.path.join(hls_dir, f"audio_{index}.m3u8")
        if not os.path.exists(audio_m3u8):
            # Simulate audio track generation (replace with actual FFmpeg command)
            os.makedirs(hls_dir, exist_ok=True)
            with open(audio_m3u8, "w") as f:
                f.write("#EXTM3U\n#EXT-X-VERSION:3\n")
            logger.info(f"Generated placeholder audio track {index} for hash {hash}")
        return send_file(audio_m3u8, mimetype="application/x-mpegURL")
    except Exception as e:
        logger.error(f"Error serving audio track {index} for hash {hash}: {e}")
        return jsonify({"error": "Failed to serve audio track"}), 500

@app.route("/api/hls/<hash>/subtitle_<int:index>.vtt")
def serve_subtitle_track(hash, index):
    """Serve specific subtitle track for Client."""
    try:
        hls_dir = os.path.join("static", "hls", hash)
        subtitle_vtt = os.path.join(hls_dir, f"subtitle_{index}.vtt")
        if not os.path.exists(subtitle_vtt):
            # Simulate subtitle extraction (replace with actual FFmpeg command)
            os.makedirs(hls_dir, exist_ok=True)
            with open(subtitle_vtt, "w") as f:
                f.write("WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nPlaceholder subtitle\n")
            logger.info(f"Generated placeholder subtitle {index} for hash {hash}")
        return send_file(subtitle_vtt, mimetype="text/vtt")
    except Exception as e:
        logger.error(f"Error serving subtitle {index} for hash {hash}: {e}")
        return jsonify({"error": "Failed to serve subtitle track"}), 500

@app.route("/api/log_client_activity", methods=["POST"])
def log_client_activity():
    """Log client-side activity."""
    try:
        data = request.json
        if not data:
            return jsonify({"success": False, "message": "No data provided"}), 400
            
        action = data.get('action', 'Unknown')
        details = data.get('details', {})
        url = data.get('url', 'Unknown')
        
        details_str = ", ".join([f"{k}={v}" for k, v in details.items()]) if details else "None"
        log_message = f"Client Activity: {action} - URL: {url} - Details: {details_str}"
        
        logger.info(log_message, extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"Error logging client activity: {e}", extra={'ip': request.remote_addr, 'user': g.user})
        return jsonify({"success": False, "message": str(e)}), 500

@app.errorhandler(404)
def not_found_error(error):
    """Handle 404 errors by rendering the 404 page."""
    return render_template("404.html"), 404

if __name__ == "__main__":
    logger.info("Starting FileFlix server...")
    serve(app, host="0.0.0.0", port=5000)