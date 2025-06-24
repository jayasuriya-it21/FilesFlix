import os
import json
import mimetypes
from pathlib import Path
from flask import Flask, render_template, send_from_directory, request, jsonify, Response
from flask_httpauth import HTTPBasicAuth
import logging
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from config import Config
from utils import (
    get_file_hash, get_file_type, format_file_size, 
    extract_video_metadata, process_video_async,
    get_system_info, check_ffmpeg, generate_hls_playlist
)

app = Flask(__name__)
app.config.from_object(Config)

# Initialize auth
auth = HTTPBasicAuth()
users = {"admin": "password"}  # Change in production

@auth.verify_password
def verify_password(username, password):
    return username in users and users[username] == password

# Global variables
current_directory = os.getcwd()
file_watcher = None

class MediaFileHandler(FileSystemEventHandler):
    """Handle file system events for auto-processing"""
    
    def on_created(self, event):
        if not event.is_directory:
            self._process_file(event.src_path)
    
    def on_modified(self, event):
        if not event.is_directory:
            self._process_file(event.src_path)
    
    def _process_file(self, file_path):
        file_type = get_file_type(file_path)
        if file_type == 'video':
            logging.info(f"New video detected: {file_path}")
            process_video_async(file_path, current_directory)

def setup_logging():
    """Configure application logging"""
    log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    
    # File handler
    file_handler = logging.FileHandler(Config.LOG_DIR / 'fileflix.log')
    file_handler.setFormatter(logging.Formatter(log_format))
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter(log_format))
    
    # Configure root logger
    logging.basicConfig(
        level=Config.LOG_LEVEL,
        handlers=[file_handler, console_handler]
    )
    
    logging.info("FileFlix application starting...")

def start_file_watcher(path):
    """Start watching directory for file changes"""
    global file_watcher
    
    if file_watcher:
        file_watcher.stop()
        file_watcher.join()
    
    file_watcher = Observer()
    file_watcher.schedule(MediaFileHandler(), path, recursive=True)
    file_watcher.start()
    logging.info(f"File watcher started for: {path}")

# Routes
@app.route('/')
@auth.login_required
def index():
    """Main client interface"""
    return render_template('index.html')

@app.route('/host')
@auth.login_required
def host():
    """Host configuration interface"""
    return render_template('host.html', current_dir=current_directory)

@app.route('/api/files')
@auth.login_required
def list_files():
    """List files and folders with pagination and filtering"""
    try:
        path = request.args.get('path', '')
        file_type = request.args.get('type', 'all')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 50))
        
        # Construct full path
        if path:
            full_path = os.path.join(current_directory, path)
        else:
            full_path = current_directory
        
        # Security check
        if not os.path.realpath(full_path).startswith(os.path.realpath(current_directory)):
            return jsonify({'error': 'Access denied'}), 403
        
        if not os.path.exists(full_path):
            return jsonify({'error': 'Path not found'}), 404
        
        items = []
        
        # List directory contents
        for item_name in sorted(os.listdir(full_path)):
            item_path = os.path.join(full_path, item_name)
            relative_path = os.path.relpath(item_path, current_directory)
            
            if os.path.isdir(item_path):
                items.append({
                    'name': item_name,
                    'path': relative_path.replace('\\', '/'),
                    'type': 'folder',
                    'size': 0,
                    'modified': os.path.getmtime(item_path)
                })
            else:
                item_type = get_file_type(item_name)
                
                # Filter by type if specified
                if file_type != 'all' and item_type != file_type:
                    continue
                
                file_size = os.path.getsize(item_path)
                
                item_data = {
                    'name': item_name,
                    'path': relative_path.replace('\\', '/'),
                    'type': item_type,
                    'size': file_size,
                    'size_formatted': format_file_size(file_size),
                    'modified': os.path.getmtime(item_path)
                }
                
                # For videos, trigger async processing
                if item_type == 'video':
                    process_video_async(item_path, current_directory)
                    
                    # Add thumbnail info
                    file_hash = get_file_hash(relative_path)
                    thumbnail_path = Config.THUMBNAIL_DIR / f"{file_hash}.jpg"
                    item_data['has_thumbnail'] = thumbnail_path.exists()
                
                items.append(item_data)
        
        # Pagination
        total_items = len(items)
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_items = items[start_idx:end_idx]
        
        # Build breadcrumb
        breadcrumb = []
        if path:
            parts = path.split('/')
            current_path = ''
            for part in parts:
                if part:
                    current_path = f"{current_path}/{part}" if current_path else part
                    breadcrumb.append({
                        'name': part,
                        'path': current_path
                    })
        
        return jsonify({
            'items': paginated_items,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total_items,
                'pages': (total_items + per_page - 1) // per_page
            },
            'breadcrumb': breadcrumb,
            'current_path': path
        })
        
    except Exception as e:
        logging.error(f"Error listing files: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/file/<path:file_path>')
@auth.login_required
def serve_file(file_path):
    """Serve raw files"""
    try:
        full_path = os.path.join(current_directory, file_path)
        
        # Security check
        if not os.path.realpath(full_path).startswith(os.path.realpath(current_directory)):
            return "Access denied", 403
        
        if not os.path.exists(full_path):
            return "File not found", 404
        
        return send_from_directory(
            os.path.dirname(full_path),
            os.path.basename(full_path),
            as_attachment=request.args.get('download') == 'true'
        )
        
    except Exception as e:
        logging.error(f"Error serving file {file_path}: {e}")
        return "Internal server error", 500

@app.route('/api/thumbnail/<path:file_path>')
@auth.login_required
def serve_thumbnail(file_path):
    """Serve video thumbnail"""
    try:
        file_hash = get_file_hash(file_path)
        thumbnail_path = Config.THUMBNAIL_DIR / f"{file_hash}.jpg"
        
        if thumbnail_path.exists():
            return send_from_directory(
                Config.THUMBNAIL_DIR,
                f"{file_hash}.jpg"
            )
        else:
            # Return default thumbnail
            return send_from_directory(
                app.static_folder + '/images',
                'fallback.jpg'
            )
            
    except Exception as e:
        logging.error(f"Error serving thumbnail: {e}")
        return "Error", 500

@app.route('/api/stream/<path:file_path>')
@auth.login_required
def stream_video(file_path):
    """Stream video with range support"""
    try:
        full_path = os.path.join(current_directory, file_path)
        
        if not os.path.exists(full_path):
            return "File not found", 404
        
        file_size = os.path.getsize(full_path)
        range_header = request.headers.get('Range')
        
        def generate_chunks(start=0, end=None):
            if end is None:
                end = file_size - 1
            
            with open(full_path, 'rb') as f:
                f.seek(start)
                remaining = end - start + 1
                
                while remaining > 0:
                    chunk_size = min(Config.CHUNK_SIZE, remaining)
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk
        
        if range_header:
            # Parse range header
            ranges = range_header.replace('bytes=', '').split('-')
            start = int(ranges[0]) if ranges[0] else 0
            end = int(ranges[1]) if ranges[1] else file_size - 1
            
            response = Response(
                generate_chunks(start, end),
                206,  # Partial Content
                headers={
                    'Content-Range': f'bytes {start}-{end}/{file_size}',
                    'Accept-Ranges': 'bytes',
                    'Content-Length': str(end - start + 1),
                    'Content-Type': mimetypes.guess_type(full_path)[0] or 'video/mp4'
                }
            )
        else:
            response = Response(
                generate_chunks(),
                headers={
                    'Content-Length': str(file_size),
                    'Accept-Ranges': 'bytes',
                    'Content-Type': mimetypes.guess_type(full_path)[0] or 'video/mp4'
                }
            )
        
        return response
        
    except Exception as e:
        logging.error(f"Error streaming video: {e}")
        return "Error", 500

@app.route('/api/hls/<path:file_path>')
@auth.login_required
def serve_hls(file_path):
    """Serve HLS playlist, generate if needed"""
    try:
        file_hash = get_file_hash(file_path)
        hls_dir = Config.HLS_DIR / file_hash
        playlist_path = hls_dir / 'playlist.m3u8'
        
        # Generate HLS if doesn't exist
        if not playlist_path.exists():
            full_path = os.path.join(current_directory, file_path)
            if not os.path.exists(full_path):
                return "Source file not found", 404
            
            logging.info(f"Generating HLS for {file_path}")
            success = generate_hls_playlist(full_path, hls_dir)
            
            if not success:
                return "Failed to generate HLS", 500
        
        return send_from_directory(hls_dir, 'playlist.m3u8')
        
    except Exception as e:
        logging.error(f"Error serving HLS: {e}")
        return "Error", 500

@app.route('/api/hls/<file_hash>/<filename>')
@auth.login_required
def serve_hls_segment(file_hash, filename):
    """Serve HLS segments"""
    try:
        hls_dir = Config.HLS_DIR / file_hash
        return send_from_directory(hls_dir, filename)
    except Exception as e:
        logging.error(f"Error serving HLS segment: {e}")
        return "Error", 500

@app.route('/api/metadata/<path:file_path>')
@auth.login_required
def serve_metadata(file_path):
    """Serve video metadata"""
    try:
        file_hash = get_file_hash(file_path)
        metadata_path = Config.METADATA_DIR / f"{file_hash}.json"
        
        if metadata_path.exists():
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            return jsonify(metadata)
        else:
            # Extract metadata on demand
            full_path = os.path.join(current_directory, file_path)
            metadata = extract_video_metadata(full_path)
            
            if metadata:
                metadata_path.parent.mkdir(parents=True, exist_ok=True)
                with open(metadata_path, 'w') as f:
                    json.dump(metadata, f, indent=2)
                return jsonify(metadata)
            else:
                return jsonify({'error': 'Could not extract metadata'}), 404
                
    except Exception as e:
        logging.error(f"Error serving metadata: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/previews/<file_hash>/<filename>')
@auth.login_required
def serve_preview(file_hash, filename):
    """Serve preview thumbnails"""
    try:
        preview_dir = Config.PREVIEW_DIR / file_hash
        return send_from_directory(preview_dir, filename)
    except Exception as e:
        logging.error(f"Error serving preview: {e}")
        return "Error", 500

@app.route('/api/system')
@auth.login_required
def system_status():
    """Get system status"""
    try:
        return jsonify({
            'status': 'ok',
            'directory': current_directory,
            'ffmpeg_available': check_ffmpeg(),
            'system_info': get_system_info()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/set-directory', methods=['POST'])
@auth.login_required
def set_directory():
    """Set media directory"""
    try:
        global current_directory
        
        data = request.get_json()
        new_dir = data.get('directory')
        
        if not new_dir or not os.path.isdir(new_dir):
            return jsonify({'error': 'Invalid directory'}), 400
        
        current_directory = os.path.abspath(new_dir)
        start_file_watcher(current_directory)
        
        logging.info(f"Directory changed to: {current_directory}")
        
        return jsonify({
            'success': True,
            'directory': current_directory
        })
        
    except Exception as e:
        logging.error(f"Error setting directory: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Initialize application
    Config.init_app(app)
    setup_logging()
    
    # Check dependencies
    if not check_ffmpeg():
        logging.error("FFmpeg not found! Video processing will not work.")
        logging.error("Please install FFmpeg: https://ffmpeg.org/download.html")
    
    # Start file watcher
    start_file_watcher(current_directory)
    
    try:
        logging.info(f"Starting FileFlix on http://{Config.HOST}:{Config.PORT}")
        app.run(
            host=Config.HOST,
            port=Config.PORT,
            debug=Config.DEBUG,
            threaded=True,
            use_reloader=False
        )
    except KeyboardInterrupt:
        logging.info("Application stopped by user")
    finally:
        if file_watcher:
            file_watcher.stop()
            file_watcher.join()