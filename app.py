# app.py
from flask import Flask, render_template, send_from_directory, request, jsonify, Response, abort
from flask_httpauth import HTTPBasicAuth
import os
import logging
import re
import mimetypes
import json
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from concurrent.futures import ThreadPoolExecutor

from config import Config
from utils import generate_thumbnail_and_hls, get_hls_path, get_thumbnail_path, check_ffmpeg, get_file_hash, extract_video_metadata, get_metadata_path

app = Flask(__name__)
app.config.from_object(Config)

# --- Globals & Setup ---
selected_dir = os.getcwd()
executor = ThreadPoolExecutor(max_workers=3)
observer = None
auth = HTTPBasicAuth()

# Basic Auth - In a real app, use a more secure method
users = {"admin": "password"}

@auth.verify_password
def verify_password(username, password):
    if username in users and users[username] == password:
        return username
    logging.warning(f"Auth failed for user: {username} from {request.remote_addr}")
    return None

def setup_logging():
    logging.basicConfig(
        level=Config.LOG_LEVEL,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(Config.LOG_DIR / 'fileflix.log'),
            logging.StreamHandler()
        ]
    )
    logging.info('FileFlix Starting Up...')

# --- File Watcher for Auto-Processing ---
class MediaFileHandler(FileSystemEventHandler):
    def process(self, event_path):
        ext = os.path.splitext(event_path)[1].lower()
        if ext in Config.SUPPORTED_VIDEO_FORMATS:
            logging.info(f"Video file change detected: {event_path}. Queuing for processing.")
            executor.submit(generate_thumbnail_and_hls, event_path, selected_dir, thumbnail_only=True)

    def on_created(self, event):
        if not event.is_directory:
            self.process(event.src_path)

    def on_modified(self, event):
        if not event.is_directory:
            self.process(event.src_path)

def start_watcher(path):
    global observer
    if observer:
        observer.stop()
        observer.join()
    
    observer = Observer()
    observer.schedule(MediaFileHandler(), path, recursive=True)
    observer.start()
    logging.info(f"Started directory watcher for: {path}")

# --- Core Routes ---
@app.route('/host')
@auth.login_required
def host():
    return render_template('host.html', current_dir=selected_dir)

@app.route('/')
@app.route('/client')
@auth.login_required
def client():
    return render_template('client.html')

@app.route('/files')
@auth.login_required
def list_files():
    """Lists files and folders in the current directory with subfolder support."""
    try:
        # Get current path from query parameter or use root
        current_path = request.args.get('path', '')
        
        # Ensure the path is within the selected directory
        target_dir = os.path.join(selected_dir, current_path)
        
        # Security check - prevent directory traversal
        if not os.path.realpath(target_dir).startswith(os.path.realpath(selected_dir)):
            return jsonify({'error': 'Invalid directory path'}), 403
        
        if not os.path.isdir(target_dir):
            return jsonify({'error': 'Directory not found'}), 404
            
        # Get folders and files
        folders = []
        files = []
        
        for item in os.listdir(target_dir):
            item_path = os.path.join(target_dir, item)
            rel_path = os.path.join(current_path, item) if current_path else item
            
            if os.path.isdir(item_path):
                folders.append({
                    'name': item,
                    'path': rel_path,
                    'type': 'folder'
                })
            else:
                ext = os.path.splitext(item)[1].lower()
                # Pre-generate thumbnails for videos if needed
                if ext in Config.SUPPORTED_VIDEO_FORMATS and not os.path.exists(get_thumbnail_path(rel_path)):
                    executor.submit(generate_thumbnail_and_hls, item_path, selected_dir, thumbnail_only=True)
                
                files.append({
                    'name': item,
                    'path': rel_path,
                    'size': os.path.getsize(item_path),
                    'modified': os.path.getmtime(item_path),
                    'type': get_file_type(item)
                })
        
        # Build breadcrumb path
        breadcrumb = []
        if current_path:
            parts = current_path.split(os.sep)
            current = ""
            for i, part in enumerate(parts):
                if part:
                    current = os.path.join(current, part)
                    breadcrumb.append({
                        'name': part,
                        'path': current
                    })
        
        return jsonify({
            'current_path': current_path,
            'breadcrumb': breadcrumb,
            'folders': folders,
            'files': files
        })
        
    except Exception as e:
        logging.error(f"Error listing files: {e}")
        return jsonify({'error': str(e)}), 500

def get_file_type(filename):
    """Determine file type based on extension."""
    ext = os.path.splitext(filename)[1].lower()
    if ext in Config.SUPPORTED_VIDEO_FORMATS:
        return 'video'
    elif ext in Config.SUPPORTED_IMAGE_FORMATS:
        return 'image'
    elif ext in Config.SUPPORTED_DOCUMENT_FORMATS:
        return 'document'
    elif ext in Config.SUPPORTED_AUDIO_FORMATS:
        return 'audio'
    else:
        return 'other'

# --- File Serving Routes ---
@app.route('/file/<path:filepath>')
@auth.login_required
def serve_file(filepath):
    """Serves raw files for download or for non-video content."""
    return send_from_directory(selected_dir, filepath)

@app.route('/thumbnail/<path:filepath>')
@auth.login_required
def serve_thumbnail(filepath):
    """Serves a generated thumbnail for a video file."""
    thumb_path = get_thumbnail_path(filepath)
    if not os.path.exists(thumb_path):
        # Return a fallback image if thumbnail doesn't exist
        return send_from_directory(os.path.join(app.static_folder, 'images'), 'fallback.jpg'), 404
    return send_from_directory(Config.THUMBNAIL_DIR, os.path.basename(thumb_path))

# --- Video Streaming Routes ---
@app.route('/stream/<path:filepath>')
@auth.login_required
def stream_video(filepath):
    """Direct video streaming with byte-range support for better performance."""
    file_path = os.path.join(selected_dir, filepath)
    
    if not os.path.exists(file_path):
        return "File not found", 404
        
    file_size = os.path.getsize(file_path)
    content_type = mimetypes.guess_type(file_path)[0] or 'application/octet-stream'
    
    # Handle Range header for seeking
    range_header = request.headers.get('Range', None)
    if range_header:
        byte_range = range_header.replace('bytes=', '').split('-')
        start = int(byte_range[0])
        end = int(byte_range[1]) if byte_range[1] else file_size - 1
        
        if start >= file_size:
            return "Requested range not satisfiable", 416
            
        # Calculate chunk size for responsive streaming
        chunk_size = min(end - start + 1, 1024 * 1024)  # 1MB chunks
        
        def generate():
            with open(file_path, 'rb') as f:
                f.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    read_size = min(chunk_size, remaining)
                    data = f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data
                    
        resp = Response(generate(), 206, mimetype=content_type)
        resp.headers.add('Content-Range', f'bytes {start}-{end}/{file_size}')
        resp.headers.add('Accept-Ranges', 'bytes')
        resp.headers.add('Content-Length', str(end - start + 1))
        resp.headers.add('Access-Control-Allow-Origin', '*')
        resp.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
        return resp
    
    # If no range header, stream the whole file
    def generate():
        with open(file_path, 'rb') as f:
            while chunk := f.read(1024 * 1024):  # 1MB chunks
                yield chunk
                
    resp = Response(generate(), mimetype=content_type)
    resp.headers.add('Content-Length', str(file_size))
    resp.headers.add('Accept-Ranges', 'bytes')
    resp.headers.add('Access-Control-Allow-Origin', '*')
    resp.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
    return resp

@app.route('/hls/<path:filepath>')
@auth.login_required
def serve_hls_master(filepath):
    """Serves the HLS master playlist (.m3u8) and ensures it's generated if needed."""
    file_path = os.path.join(selected_dir, filepath)
    if not os.path.exists(file_path):
        logging.error(f"Source file not found: {filepath}")
        return "Source file not found", 404
        
    hls_path = get_hls_path(filepath)
    hls_dir = os.path.dirname(hls_path)
    master_playlist_name = os.path.basename(hls_path)
    
    # Generate HLS if it doesn't exist
    if not hls_path.exists():
        logging.info(f"HLS not found, generating for: {filepath}")
        generate_thumbnail_and_hls(file_path, selected_dir, thumbnail_only=False)
        
        # Double-check if generation was successful
        if not hls_path.exists():
            logging.error(f"Failed to generate HLS for: {filepath}")
            return "Failed to generate HLS playlist", 500
    
    logging.info(f"Serving HLS master playlist: {master_playlist_name}")
    return send_from_directory(hls_dir, master_playlist_name)

@app.route('/hls/<videohash>/<path:filename>')
@auth.login_required
def serve_hls_files(videohash, filename):
    """Serves HLS segment files (.ts) and variant playlists."""
    hls_dir = os.path.join(Config.HLS_DIR, videohash)
    if not os.path.exists(os.path.join(hls_dir, filename)):
        logging.error(f"HLS playlist not found for: {filename}")
        return "Not Found", 404
        
    logging.info(f"Serving HLS file: {filename} from {hls_dir}")
    return send_from_directory(hls_dir, filename)

@app.route('/metadata/<path:filepath>')
@auth.login_required
def serve_metadata(filepath):
    """Serves metadata about video tracks."""
    metadata_path = get_metadata_path(filepath)
    if not os.path.exists(metadata_path):
        # If metadata doesn't exist, try to generate it on the fly
        file_path = os.path.join(selected_dir, filepath)
        if os.path.exists(file_path):
            metadata = extract_video_metadata(file_path)
            if metadata:
                metadata_path.parent.mkdir(parents=True, exist_ok=True)
                with open(metadata_path, 'w') as f:
                    json.dump(metadata, f, indent=2)
                return jsonify(metadata)
        return jsonify({"error": "Metadata not available"}), 404
    
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    return jsonify(metadata)

@app.route('/hls/<videohash>/subtitle_<int:index>.vtt')
@auth.login_required
def serve_subtitle(videohash, index):
    """Serves extracted subtitle files."""
    subtitle_path = os.path.join(Config.HLS_DIR, videohash, f"subtitle_{index}.vtt")
    if not os.path.exists(subtitle_path):
        return "Subtitle not found", 404
    
    return send_from_directory(os.path.dirname(subtitle_path), os.path.basename(subtitle_path))

@app.route('/hls/<videohash>/variants.json')
@auth.login_required
def serve_variants(videohash):
    """Serves the variants manifest with track information."""
    variants_path = os.path.join(Config.HLS_DIR, videohash, "variants.json")
    if not os.path.exists(variants_path):
        return jsonify({"error": "Variants not available"}), 404
    
    with open(variants_path, 'r') as f:
        variants = json.load(f)
    return jsonify(variants)

@app.route('/hls/<videohash>/previews/<filename>')
@auth.login_required
def serve_preview(videohash, filename):
    """Serves preview thumbnails for seeking."""
    preview_dir = os.path.join(Config.HLS_DIR, videohash, "previews")
    return send_from_directory(preview_dir, filename)

# --- Control Routes ---
@app.route('/set_dir', methods=['POST'])
@auth.login_required
def set_dir():
    global selected_dir
    new_dir = request.json.get('directory')
    if new_dir and os.path.isdir(new_dir):
        selected_dir = os.path.abspath(new_dir)
        logging.info(f"Directory changed to: {selected_dir} by user {auth.current_user()}")
        start_watcher(selected_dir)
        return jsonify({'status': 'success', 'dir': selected_dir})
    logging.warning(f"Invalid directory requested: {new_dir}")
    return jsonify({'status': 'error', 'message': 'Invalid directory path'})

# --- Main ---
if __name__ == '__main__':
    # Ensure all directories are created
    Config.init_app(app)
    
    # Set up logging
    setup_logging()
    
    # Check for FFmpeg
    if not check_ffmpeg():
        logging.error("FFmpeg not found. Video processing will not work!")
    
    # Start watcher
    start_watcher(selected_dir)
    
    # Run the app
    logging.info(f"Starting Flask server on http://{Config.HOST}:{Config.PORT}")
    app.run(host=Config.HOST, port=Config.PORT, threaded=True, use_reloader=False)