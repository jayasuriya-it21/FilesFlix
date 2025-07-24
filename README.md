# FilesFlix - Personal Media Streaming Platform

FilesFlix is a modern, Netflix-inspired personal media streaming server built with Flask. It automatically discovers your media files and provides a beautiful web interface for streaming videos, viewing images, and managing your media collection.

## ✨ Features

### 🎬 Media Streaming
- **Adaptive Video Streaming**: Automatic HLS (HTTP Live Streaming) with multiple quality options
- **Direct Streaming**: Fast MP4 streaming for compatible files
- **Video.js Player**: Modern OTT-style player with Netflix-like controls
- **Thumbnail Generation**: Automatic video thumbnails and preview images
- **Multi-format Support**: MP4, AVI, MKV, MOV, WMV, and more

### 🖼️ Media Management
- **Smart Discovery**: Automatic scanning of media directories
- **Real-time Updates**: File system monitoring with live updates
- **Advanced Filtering**: Filter by media type (videos, images, documents)
- **Search Functionality**: Quick search across your media collection
- **Download Support**: Direct file downloads

### 🛡️ Security & Authentication
- **Flask-Login Authentication**: Secure session-based login system
- **Protected Admin Area**: Host dashboard with system monitoring
- **CSRF Protection**: Built-in security features

### � System Monitoring
- **Real-time Stats**: CPU, memory, and disk usage monitoring
- **Media Analytics**: File count and size statistics
- **Directory Management**: Browse and manage media directories
- **Activity Logging**: Comprehensive logging system

## 🚀 Quick Start

### Prerequisites
- Python 3.8 or higher
- FFmpeg (for video processing)

### Installation

1. **Clone and navigate to the project**:
   ```bash
   cd FilesFlix
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure FFmpeg** (if not in PATH):
   ```python
   # Edit config.py
   FFMPEG_PATH = r"C:\path\to\ffmpeg.exe"
   FFPROBE_PATH = r"C:\path\to\ffprobe.exe"
   ```

4. **Run the server**:
   ```bash
   python app.py
   ```

5. **Access the application**:
   - **Client Interface**: http://localhost:5000
   - **Host Dashboard**: http://localhost:5000/host

### Default Credentials
- **Username**: `admin`
- **Password**: `password123`

## 🔧 Configuration

### Media Directory
By default, FilesFlix serves media from its own directory. To change this:

1. Use the host dashboard at `/host`
2. Enter your media directory path
3. Click "Update Directory" to scan for new media

### Supported File Types

**Videos**: mp4, avi, mkv, mov, wmv, flv, webm, m4v  
**Images**: jpg, jpeg, png, gif, bmp, webp, svg  
**Documents**: pdf, txt, doc, docx, ppt, pptx, xls, xlsx  

## 🎯 API Endpoints

### Public Endpoints
- `GET /` - Client interface
- `GET /client` - Media browser
- `GET /stream/<path>` - Direct video streaming
- `GET /hls/<path>` - HLS streaming
- `GET /file/<path>` - File access
- `GET /thumbnail/<path>` - Video thumbnails

### Protected Endpoints (Require Authentication)
- `GET /host` - Host dashboard
- `GET /api/system` - System statistics
- `POST /api/directory` - Update media directory
- `GET /api/scan` - Trigger media scan

### Authentication
- `GET /login` - Login page
- `POST /login` - Authenticate user
- `GET /logout` - Logout user

## 🏗️ Architecture

### Backend Components
- **Flask**: Web framework with session management
- **Flask-Login**: Authentication system
- **Watchdog**: File system monitoring
- **FFmpeg**: Video processing and thumbnail generation
- **psutil**: System monitoring

### Frontend Features
- **Responsive Design**: Mobile-friendly interface
- **Modern UI**: Netflix-inspired dark theme
- **Progressive Loading**: Lazy loading for better performance
- **Video.js Integration**: Professional video player

### File Structure
```
FilesFlix/
├── app.py              # Main Flask application
├── config.py           # Configuration settings
├── utils.py            # Utility functions
├── requirements.txt    # Python dependencies
├── templates/          # HTML templates
│   ├── client.html     # Media browser interface
│   ├── host.html       # Admin dashboard
│   └── login.html      # Authentication page
├── static/             # Static assets
│   ├── css/           # Stylesheets
│   └── images/        # Images and fallbacks
└── logs/              # Application logs
```

## � Security Features

- **Session-based Authentication**: Secure login system
- **CSRF Protection**: Prevents cross-site request forgery
- **Input Validation**: Sanitized file paths and user inputs
- **Secure Headers**: HTTP security headers
- **Admin-only Access**: Protected host dashboard

## 📱 Browser Compatibility

- **Chrome/Edge**: Full support including HLS
- **Firefox**: Full support with Video.js
- **Safari**: Native HLS support
- **Mobile**: Responsive design for iOS/Android

## 🛠️ Troubleshooting

### Video Playback Issues
1. Ensure FFmpeg is installed and accessible
2. Check video format compatibility
3. Verify file permissions

### Authentication Problems
1. Clear browser cookies/session data
2. Check default credentials (admin/password123)
3. Restart the server

### Performance Optimization
1. Use SSD storage for media files
2. Enable hardware acceleration in FFmpeg
3. Adjust streaming quality in config.py

## 📋 System Requirements

### Minimum Requirements
- **CPU**: 2 cores, 2.0 GHz
- **RAM**: 2 GB
- **Storage**: 1 GB free space
- **Network**: 10 Mbps for local streaming

### Recommended Requirements
- **CPU**: 4+ cores, 3.0 GHz
- **RAM**: 4+ GB
- **Storage**: SSD with 10+ GB free space
- **Network**: 100 Mbps for multiple users

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section
2. Review the logs in `/logs/fileflix.log`
3. Open an issue on the repository

---

**FilesFlix** - Transform your media collection into a professional streaming experience! �✨
