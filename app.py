# app.py - FilesFlix Main Application
from flask import Flask, render_template, send_from_directory, request, jsonify, Response, redirect, url_for, flash, abort
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
import os
import logging
import json
import mimetypes
import secrets
from pathlib import Path
from werkzeug.utils import secure_filename
from urllib.parse import unquote
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from concurrent.futures import ThreadPoolExecutor
import psutil
import socket

from config import Config
from utils import generate_thumbnail_and_hls, get_hls_path, get_thumbnail_path, check_ffmpeg, get_file_hash, get_metadata_path, extract_video_metadata

app = Flask(__name__)
app.config.from_object(Config)

# Enable response compression for better performance
try:
    from flask_compress import Compress
    Compress(app)
except ImportError:
    # Compression not available, continue without it
    logging.info("Flask-Compress not available. Install for better performance: pip install Flask-Compress")

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access the host dashboard.'

# User class for Flask-Login
class User(UserMixin):
    def __init__(self, id):
        self.id = id

@login_manager.user_loader
def load_user(user_id):
    return User(user_id)

# --- Globals & Setup ---
selected_dir = Config.DEFAULT_MEDIA_DIR
executor = ThreadPoolExecutor(max_workers=3)
observer = None

def validate_file_path(filepath):
    """
    Validate and sanitize file path to prevent directory traversal attacks.
    Returns sanitized path or None if invalid.
    """
    if not filepath:
        return None
    
    # Decode URL-encoded path
    filepath = unquote(filepath)
    
    # Remove any potential directory traversal attempts
    filepath = os.path.normpath(filepath)
    
    # Ensure the path doesn't start with / or contain ..
    if filepath.startswith('/') or '..' in filepath:
        return None
    
    # Secure the filename components
    path_parts = filepath.split(os.sep)
    secure_parts = [secure_filename(part) for part in path_parts if part]
    
    if not all(secure_parts):
        return None
    
    sanitized_path = os.path.join(*secure_parts)
    
    # Ensure the final path is within the selected directory
    full_path = os.path.join(selected_dir, sanitized_path)
    full_path = os.path.abspath(full_path)
    selected_dir_abs = os.path.abspath(selected_dir)
    
    if not full_path.startswith(selected_dir_abs):
        return None
    
    return sanitized_path

def setup_logging():
    """Setup logging configuration"""
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
    """Start file system watcher"""
    global observer
    try:
        if observer:
            observer.stop()
            observer.join()
        
        observer = Observer()
        observer.schedule(MediaFileHandler(), path, recursive=True)
        observer.start()
        logging.info(f"Started directory watcher for: {path}")
    except Exception as e:
        logging.warning(f"Failed to start file watcher (this is non-critical): {e}")
        logging.info("File watcher disabled. New files will be processed on demand.")

@app.after_request
def add_security_headers(response):
    """Add security headers to all responses"""
    # Prevent clickjacking
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    # Prevent MIME type sniffing
    response.headers['X-Content-Type-Options'] = 'nosniff'
    # Enable XSS protection
    response.headers['X-XSS-Protection'] = '1; mode=block'
    # Referrer policy
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response

def get_system_info():
    """Get system information"""
    try:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('.')
        
        # Get local IP addresses
        hostname = socket.gethostname()
        local_ips = []
        try:
            # Get all network interfaces
            for interface, addrs in psutil.net_if_addrs().items():
                for addr in addrs:
                    if addr.family == socket.AF_INET and not addr.address.startswith('127.'):
                        local_ips.append(addr.address)
        except:
            local_ips = [socket.gethostbyname(hostname)]
        
        return {
            'cpu_percent': cpu_percent,
            'memory_percent': memory.percent,
            'memory_used': memory.used // (1024**3),  # GB
            'memory_total': memory.total // (1024**3),  # GB
            'disk_percent': disk.percent,
            'disk_used': disk.used // (1024**3),  # GB
            'disk_total': disk.total // (1024**3),  # GB
            'ffmpeg_available': check_ffmpeg(),
            'local_ips': local_ips,
            'hostname': hostname
        }
    except Exception as e:
        logging.error(f"Error getting system info: {e}")
        return {}

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Host login page with rate limiting and secure authentication"""
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        # Basic input validation
        if not username or not password:
            flash('Username and password are required', 'error')
            return render_template('login.html')
        
        # Constant time comparison to prevent timing attacks
        username_valid = secrets.compare_digest(username, Config.HOST_USERNAME)
        password_valid = secrets.compare_digest(password, Config.HOST_PASSWORD)
        
        if username_valid and password_valid:
            user = User(username)
            login_user(user)
            logging.info(f"Host login successful for: {username}")
            return redirect(url_for('host_dashboard'))
        else:
            logging.warning(f"Host login failed for: {username}")
            flash('Invalid credentials', 'error')
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    """Host logout"""
    logout_user()
    flash('You have been logged out', 'info')
    return redirect(url_for('client'))

# --- Core Routes ---
@app.route('/')
def index():
    """Public client interface"""
    return render_template('client.html')

@app.route('/client')
def client():
    """Alternative client route"""
    return render_template('client.html')

# Legacy endpoints for backward compatibility
@app.route('/files')
def files():
    """Legacy endpoint for file listing"""
    return api_list_files()

@app.route('/file/<path:filepath>')
def serve_file(filepath):
    """Legacy endpoint for file serving"""
    return api_serve_file(filepath)

@app.route('/thumbnail/<path:filepath>')
def serve_thumbnail(filepath):
    """Legacy endpoint for thumbnails"""
    return api_serve_thumbnail(filepath)

@app.route('/stream/<path:filepath>')
def serve_stream(filepath):
    """Legacy endpoint for streaming"""
    return api_stream_video(filepath)

@app.route('/hls/<path:filepath>')
def serve_hls(filepath):
    """Legacy endpoint for HLS"""
    return api_serve_hls_master(filepath)

@app.route('/metadata/<path:filepath>')
def serve_metadata(filepath):
    """Legacy endpoint for metadata"""
    return api_serve_metadata(filepath)

@app.route('/host')
@login_required
def host_dashboard():
    """Protected host dashboard"""
    system_info = get_system_info()
    return render_template('host.html', 
                         current_dir=selected_dir, 
                         system_info=system_info)

# --- API Routes ---
@app.route('/api/files')
def api_list_files():
    """API endpoint to list files"""
    try:
        search_query = request.args.get('search', '').lower()
        all_files = []
        
        for root, _, files in os.walk(selected_dir):
            for name in files:
                if search_query and search_query not in name.lower():
                    continue
                    
                full_path = os.path.join(root, name)
                rel_path = os.path.relpath(full_path, selected_dir)
                ext = os.path.splitext(name)[1].lower()

                # Pre-generate thumbnails for videos if they don't exist
                if ext in Config.SUPPORTED_VIDEO_FORMATS and not get_thumbnail_path(rel_path).exists():
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
        return jsonify({'error': str(e)}), 500

@app.route('/api/system')
@login_required
def api_system_info():
    """API endpoint for system information"""
    return jsonify(get_system_info())

@app.route('/api/file/<path:filepath>')
def api_serve_file(filepath):
    """API endpoint to serve/download files with security validation"""
    sanitized_filepath = validate_file_path(filepath)
    if not sanitized_filepath:
        logging.warning(f"Invalid file path requested: {filepath}")
        abort(400, description="Invalid file path")
    
    full_path = os.path.join(selected_dir, sanitized_filepath)
    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        abort(404, description="File not found")
    
    return send_from_directory(selected_dir, sanitized_filepath)

@app.route('/api/thumbnail/<path:filepath>')
def api_serve_thumbnail(filepath):
    """API endpoint to serve thumbnails with security validation"""
    sanitized_filepath = validate_file_path(filepath)
    if not sanitized_filepath:
        abort(400, description="Invalid file path")
    
    thumb_path = get_thumbnail_path(sanitized_filepath)
    if not thumb_path.exists():
        return send_from_directory(os.path.join(app.static_folder, 'images'), 'fallback.jpg'), 404
    return send_from_directory(Config.THUMBNAIL_DIR, thumb_path.name)

@app.route('/api/metadata/<path:filepath>')
def api_serve_metadata(filepath):
    """API endpoint to serve video metadata with security validation"""
    sanitized_filepath = validate_file_path(filepath)
    if not sanitized_filepath:
        abort(400, description="Invalid file path")
    
    metadata_path = get_metadata_path(sanitized_filepath)
    if not metadata_path.exists():
        # Generate metadata on the fly
        file_path = os.path.join(selected_dir, sanitized_filepath)
        if os.path.exists(file_path):
            try:
                metadata = extract_video_metadata(file_path)
                if metadata:
                    metadata_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(metadata_path, 'w') as f:
                        json.dump(metadata, f, indent=2)
                    return jsonify(metadata)
            except Exception as e:
                logging.error(f"Error generating metadata for {sanitized_filepath}: {e}")
        return jsonify({"error": "Metadata not available"}), 404
    
    try:
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)
        return jsonify(metadata)
    except Exception as e:
        logging.error(f"Error reading metadata for {sanitized_filepath}: {e}")
        return jsonify({"error": "Error reading metadata"}), 500

# --- Video Streaming Routes ---
@app.route('/api/stream/<path:filepath>')
def api_stream_video(filepath):
    """API endpoint for direct video streaming with byte-range support and security validation"""
    sanitized_filepath = validate_file_path(filepath)
    if not sanitized_filepath:
        abort(400, description="Invalid file path")
    
    file_path = os.path.join(selected_dir, sanitized_filepath)
    
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        abort(404, description="File not found")
    
    try:
        file_size = os.path.getsize(file_path)
    except OSError as e:
        logging.error(f"Error getting file size for {sanitized_filepath}: {e}")
        abort(500, description="Error accessing file")
    
    # Handle Range header for seeking
    range_header = request.headers.get('Range', None)
    if range_header:
        try:
            byte_range = range_header.replace('bytes=', '').split('-')
            start = int(byte_range[0]) if byte_range[0] else 0
            end = int(byte_range[1]) if byte_range[1] else file_size - 1
            
            if start >= file_size or start < 0 or end >= file_size or end < start:
                abort(416, description="Requested range not satisfiable")
                
            chunk_size = min(end - start + 1, 1024 * 1024)  # 1MB chunks max
            
            def generate():
                try:
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
                except Exception as e:
                    logging.error(f"Error streaming file {sanitized_filepath}: {e}")
                    return
                        
            resp = Response(generate(), 206, mimetype=mimetypes.guess_type(file_path)[0])
            resp.headers.add('Content-Range', f'bytes {start}-{end}/{file_size}')
            resp.headers.add('Accept-Ranges', 'bytes')
            resp.headers.add('Content-Length', str(end - start + 1))
            # Add caching headers
            resp.headers.add('Cache-Control', 'public, max-age=3600')
            return resp
        except (ValueError, IndexError) as e:
            logging.warning(f"Invalid range header: {range_header}")
            abort(400, description="Invalid range header")
    
    # Stream the whole file with chunked response
    def generate():
        try:
            with open(file_path, 'rb') as f:
                while True:
                    chunk = f.read(1024 * 1024)  # 1MB chunks
                    if not chunk:
                        break
                    yield chunk
        except Exception as e:
            logging.error(f"Error streaming file {sanitized_filepath}: {e}")
            return
                
    resp = Response(generate(), mimetype=mimetypes.guess_type(file_path)[0])
    resp.headers.add('Cache-Control', 'public, max-age=3600')
    resp.headers.add('Content-Length', str(file_size))
    return resp

@app.route('/api/hls/<path:filepath>')
def api_serve_hls_master(filepath):
    """API endpoint for HLS master playlist with security validation"""
    sanitized_filepath = validate_file_path(filepath)
    if not sanitized_filepath:
        abort(400, description="Invalid file path")
    
    file_path = os.path.join(selected_dir, sanitized_filepath)
    if not os.path.exists(file_path):
        logging.error(f"Source file not found: {sanitized_filepath}")
        abort(404, description="Source file not found")
        
    hls_path = get_hls_path(sanitized_filepath)
    
    # Generate HLS if it doesn't exist
    if not hls_path.exists():
        logging.info(f"HLS not found, generating for: {sanitized_filepath}")
        try:
            generate_thumbnail_and_hls(file_path, selected_dir, thumbnail_only=False)
        except Exception as e:
            logging.error(f"Error generating HLS for {sanitized_filepath}: {e}")
            abort(500, description="Failed to generate HLS playlist")
            
        if not hls_path.exists():
            logging.error(f"Failed to generate HLS for: {sanitized_filepath}")
            abort(500, description="Failed to generate HLS playlist")
    
    logging.info(f"Serving HLS master playlist: {hls_path.name}")
    resp = send_from_directory(hls_path.parent, hls_path.name)
    resp.headers.add('Cache-Control', 'public, max-age=300')  # 5 minutes cache
    return resp

@app.route('/api/hls/<videohash>/<path:filename>')
def api_serve_hls_files(videohash, filename):
    """API endpoint for HLS segment files"""
    hls_dir = Config.HLS_DIR / videohash
    file_path = hls_dir / filename
    
    if not file_path.exists():
        logging.error(f"HLS file not found: {filename}")
        return "Not Found", 404
        
    logging.info(f"Serving HLS file: {filename}")
    return send_from_directory(hls_dir, filename)

@app.route('/api/previews/<videohash>/preview_<int:num>.jpg')
def api_serve_preview(videohash, num):
    """API endpoint for preview thumbnails"""
    preview_dir = Config.HLS_DIR / videohash / "previews"
    preview_file = preview_dir / f"preview_{num}.jpg"
    
    if not preview_file.exists():
        return "Preview not found", 404
    
    return send_from_directory(preview_dir, preview_file.name)

@app.route('/api/set_directory', methods=['POST'])
@login_required
def api_set_directory():
    """API endpoint to set media directory with validation"""
    global selected_dir
    
    try:
        data = request.get_json()
        if not data or 'directory' not in data:
            return jsonify({'error': 'Directory path required'}), 400
        
        new_dir = data['directory'].strip()
        
        if not new_dir:
            return jsonify({'error': 'Directory path cannot be empty'}), 400
        
        # Validate directory path
        new_dir = os.path.abspath(new_dir)
        if not os.path.isdir(new_dir):
            return jsonify({'error': 'Invalid directory path'}), 400
        
        # Check if directory is readable
        if not os.access(new_dir, os.R_OK):
            return jsonify({'error': 'Directory is not readable'}), 400
        
        selected_dir = new_dir
        logging.info(f"Directory changed to: {selected_dir} by user {current_user.id}")
        start_watcher(selected_dir)
        return jsonify({'status': 'success', 'directory': selected_dir})
    
    except Exception as e:
        logging.error(f"Error setting directory: {e}")
        return jsonify({'error': 'Internal server error'}), 500

# --- Error Handlers ---
@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# --- Main Application ---
if __name__ == '__main__':
    # Initialize app
    Config.init_app(app)
    setup_logging()
    
    # Set the secret key from config
    app.secret_key = Config.SECRET_KEY
    
    # Check for FFmpeg
    if not check_ffmpeg():
        logging.warning("FFmpeg not found. Video processing will be limited!")
    
    # Start file watcher
    start_watcher(selected_dir)
    
    # Run the app
    logging.info(f"Starting FilesFlix server on http://{Config.HOST}:{Config.PORT}")
    logging.info(f"Client interface: http://{Config.HOST}:{Config.PORT}")
    logging.info(f"Host dashboard: http://{Config.HOST}:{Config.PORT}/host")
    logging.info("Default credentials: admin/password123 (change via environment variables)")
    
    try:
        app.run(host=Config.HOST, port=Config.PORT, debug=False, threaded=True)
    except KeyboardInterrupt:
        logging.info("Server shutdown requested")
    except Exception as e:
        logging.error(f"Server error: {e}")
    finally:
        # Cleanup resources
        if observer:
            observer.stop()
            observer.join()
        executor.shutdown(wait=True)