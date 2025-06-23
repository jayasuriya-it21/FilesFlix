# app.py
from flask import Flask, render_template, send_from_directory, request, jsonify, Response
from flask_httpauth import HTTPBasicAuth
import os
import logging
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from concurrent.futures import ThreadPoolExecutor

from config import Config
from utils import generate_thumbnail_and_hls, get_hls_path, get_thumbnail_path

app = Flask(__name__)
app.config.from_object(Config)

# --- Globals & Setup ---
selected_dir = os.getcwd()
executor = ThreadPoolExecutor(max_workers=2)  # For background thumbnail/HLS generation
observer = None
auth = HTTPBasicAuth()

# Basic Auth - In a real app, use a more secure method
users = {"admin": "password"}

@auth.verify_password
def verify_password(username, password):
    if username in users and users[username] == password:
        logging.info(f"Auth success for user: {username}")
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
            # Run HLS and thumbnail generation in the background
            executor.submit(generate_thumbnail_and_hls, event_path, selected_dir)

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

                # Pre-generate thumbnails/HLS for videos if they don't exist
                if ext in Config.SUPPORTED_VIDEO_FORMATS:
                    if not os.path.exists(get_thumbnail_path(rel_path)) or not os.path.exists(get_hls_path(rel_path)):
                         executor.submit(generate_thumbnail_and_hls, full_path, selected_dir)
                
                all_files.append({
                    'name': name,
                    'path': rel_path,
                    'size': os.path.getsize(full_path),
                    'modified': os.path.getmtime(full_path)
                })
        logging.info(f"Found {len(all_files)} files in total for user {auth.current_user()}.")
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

@app.route('/hls/<path:filepath>')
@auth.login_required
def serve_hls_master(filepath):
    """Serves the HLS master playlist (.m3u8)."""
    hls_dir = os.path.dirname(get_hls_path(filepath))
    master_playlist_name = os.path.basename(get_hls_path(filepath))
    
    if not os.path.exists(os.path.join(hls_dir, master_playlist_name)):
        logging.error(f"HLS playlist not found for: {filepath}")
        return "Not Found", 404
        
    logging.info(f"Serving HLS master playlist: {master_playlist_name}")
    return send_from_directory(hls_dir, master_playlist_name)

@app.route('/hls/<videohash>/<path:filename>')
@auth.login_required
def serve_hls_files(videohash, filename):
    """Serves HLS segment files (.ts) and variant playlists."""
    hls_dir = os.path.join(Config.HLS_DIR, videohash)
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

# --- Main ---
if __name__ == '__main__':
    # Ensure all directories are created BEFORE anything else runs.
    Config.init_app(app)
    
    # Now it's safe to set up logging.
    setup_logging()
    
    # Start other services.
    start_watcher(selected_dir)
    
    # Run the app.
    logging.info(f"Starting Flask server on http://{Config.HOST}:{Config.PORT}")
    app.run(debug=True, host=Config.HOST, port=Config.PORT, threaded=True, use_reloader=False)