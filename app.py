# app.py (Updated with optimizations)
from flask import Flask, render_template, send_from_directory, request, jsonify, Response, abort
from flask_httpauth import HTTPBasicAuth
import os
import logging
import re  # Added missing import
import mimetypes
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from concurrent.futures import ThreadPoolExecutor

from config import Config
from utils import generate_thumbnail_and_hls, get_hls_path, get_thumbnail_path, check_ffmpeg, get_file_hash

app = Flask(__name__)
app.config.from_object(Config)

# --- Globals & Setup ---
selected_dir = os.getcwd()
executor = ThreadPoolExecutor(max_workers=3)  # Increased worker count for better responsiveness
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
    # Basic logging setup
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
            # Only generate thumbnail immediately, defer HLS for on-demand
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
    """Recursively lists all files and their cache status."""
    try:
        all_files = []
        for root, _, files in os.walk(selected_dir):
            for name in files:
                full_path = os.path.join(root, name)
                rel_path = os.path.relpath(full_path, selected_dir)
                ext = os.path.splitext(name)[1].lower()

                # Pre-generate thumbnails for videos if they don't exist
                # But defer HLS generation to when they're actually needed
                if ext in Config.SUPPORTED_VIDEO_FORMATS and not os.path.exists(get_thumbnail_path(rel_path)):
                    executor.submit(generate_thumbnail_and_hls, full_path, selected_dir, thumbnail_only=True)
                
                all_files.append({
                    'name': name,
                    'path': rel_path,
                    'size': os.path.getsize(full_path),
                    'modified': os.path.getmtime(full_path)
                })
        return jsonify(all_files)
    except Exception as e:
        logging.error(f"Error listing files in {selected_dir}: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

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
    
    # Handle Range header for seeking
    range_header = request.headers.get('Range', None)
    if range_header:
        byte_range = range_header.replace('bytes=', '').split('-')
        start = int(byte_range[0])
        end = int(byte_range[1]) if byte_range[1] else file_size - 1
        
        if start >= file_size:
            return "Requested range not satisfiable", 416
            
        # Calculate chunk size - use smaller chunks for better response
        chunk_size = min(end - start + 1, 1024 * 1024)  # 1MB chunks for responsive streaming
        
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
                    
        resp = Response(generate(), 206, mimetype=mimetypes.guess_type(file_path)[0])
        resp.headers.add('Content-Range', f'bytes {start}-{end}/{file_size}')
        resp.headers.add('Accept-Ranges', 'bytes')
        resp.headers.add('Content-Length', str(end - start + 1))
        return resp
    
    # If no range header, stream the whole file (though clients usually request ranges)
    def generate():
        with open(file_path, 'rb') as f:
            while chunk := f.read(1024 * 1024):  # 1MB chunks
                yield chunk
                
    return Response(generate(), mimetype=mimetypes.guess_type(file_path)[0])

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
        # Use the full function that generates both thumbnail and HLS
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

@app.route('/srt/<path:filepath>')
@auth.login_required
def serve_srt(filepath):
    """Serves subtitle files."""
    return send_from_directory(selected_dir, filepath)

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


# --- Main ---
if __name__ == '__main__':
    # Ensure all directories are created BEFORE anything else runs.
    Config.init_app(app)
    
    # Now it's safe to set up logging.
    setup_logging()
    
    # Check for FFmpeg
    if not check_ffmpeg():
        logging.error("FFmpeg not found. Video processing will not work!")
    
    # Start other services.
    start_watcher(selected_dir)
    
    # Run the app.
    logging.info(f"Starting Flask server on http://{Config.HOST}:{Config.PORT}")
    app.run(host=Config.HOST, port=Config.PORT, threaded=True, use_reloader=False)