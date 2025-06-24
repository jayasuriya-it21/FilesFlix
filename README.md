# ✅ FileFlix

## 🎯 Purpose

FileFlix is a modern, Netflix-inspired media server and streaming platform designed for local networks. It allows users to browse, stream, and download media files with a sleek, user-friendly interface. With distinct Host and Client roles, it supports secure media management and playback across devices on the same network.

### 🚀 Core Features
- **Host/Client Roles**: Hosts manage media directories and files; Clients browse and stream.
- **Media Streaming**: Adaptive HLS video streaming with subtitle and audio track support.
- **File Explorer**: Google Drive-like interface with grid/list views and type-based filters (videos, images, audio, documents, folders).
- **Search**: Fast, filterable search for files and folders.
- **Auto Thumbnails**: Automatically generated video thumbnails for a rich browsing experience.
- **Directory Watcher**: Monitors media directories for changes (Host-only).
- **Authentication**: Simple login for Host access to manage settings.
- **LAN Access**: Stream and download across devices on the same network.
- **Responsive Design**: Optimized for desktop and mobile with touch support.

---

## 📋 Setup Instructions

### 🔧 Prerequisites
- **Python 3.8+**: Ensure Python is installed.
- **FFmpeg**: Required for thumbnail generation and HLS streaming.
  - [Download FFmpeg](https://ffmpeg.org/download.html).
  - **Windows**: Add `C:\Program Files\ffmpeg\bin` to PATH.
  - **Linux/macOS**: Add `/usr/local/bin/ffmpeg` to PATH.
  - Verify: `ffmpeg -version`.
- **Dependencies**: Install Python packages:
  ```bash
  pip install -r requirements.txt
  ```

### 🗂️ Folder Structure
```
FileFlix/
├── .gitignore                 # Git ignore rules
├── app.py                     # Main Flask application
├── config.py                  # Configuration settings
├── run.py                     # Application entry point
├── utils.py                   # Utility functions
├── requirements.txt           # Python dependencies
├── static/                    # Static web assets
│   ├── css/                   # Stylesheets
│   │   ├── components.css     # Component styles
│   │   ├── explorer.css       # File explorer styles
│   │   ├── login.css          # Login page styles
│   │   ├── main.css           # Main application styles
│   │   └── player.css         # Media player styles
│   ├── images/                # Image assets
│   │   └── fallback.jpg       # Default/fallback image
│   └── js/                    # JavaScript files
│       ├── app.js             # Main application logic (file explorer, search, views)
│       ├── host.js            # Host page functionality
│       ├── player.js          # Media player controls
│       └── utils.js           # Utility functions
├── templates/                 # Jinja2 HTML templates
│   ├── base.html             # Base template
│   ├── host.html             # Host selection page
│   ├── index.html            # Main page template
│   └── login.html            # Login page template
├── cache/                    # Application cache (runtime)
│   ├── metadata/             # File metadata cache
│   └── previews/             # Preview cache
├── previews/                 # Generated preview files
├── thumbnails/               # Generated thumbnails
├── logs/                     # Application logs
│   └── fileflix.log          # Log file
└── .venv/                    # Python virtual environment (excluded from git)
```

### ▶️ Running the Server
1. Activate the virtual environment (if used):
   ```bash
   source .venv/bin/activate  # Linux/macOS
   .venv\Scripts\activate     # Windows
   ```
2. Run the application:
   ```bash
   python run.py
   ```
3. Access the app:
   - **Local**: [http://localhost:5000](http://localhost:5000)
   - **LAN**: [http://<your-ip>:5000](http://<your-ip>:5000)
   - **Host Controls**: [http://localhost:5000/host](http://localhost:5000/host)
4. **Default Login**: `admin` / `password` (for Host access).

---

## 💡 Usage Tips
- **Host Setup**: Log in as Host to select a media directory via the "Select Directory" button. Place media files in the chosen directory or use `/media` by default.
- **File Management**: Hosts can delete files directly from the explorer (select file, click delete).
- **Subtitles**: Add `.srt` files with the same name as videos for subtitle support.
- **View Modes**: Toggle between grid and list views for browsing.
- **Search**: Use the search bar to filter files by name or type.
- **Mobile Access**: Optimized for touch devices with responsive layouts.
- **Thumbnails**: Automatically generated for videos; ensure FFmpeg is configured.
- **Logs**: Check `logs/fileflix.log` for debugging.
- **Customization**: Modify themes in `static/css/main.css` or `static/css/explorer.css`.

---

## 🧰 Troubleshooting
| Issue                          | Solution                                                                 |
|--------------------------------|--------------------------------------------------------------------------|
| FFmpeg not found               | Ensure FFmpeg is installed and added to PATH. Verify with `ffmpeg -version`. |
| Thumbnails not generated       | Check FFmpeg setup and write permissions for `thumbnails/` and `cache/previews/`. |
| Video won’t play               | Ensure video format is supported (e.g., MP4, WebM) and HLS is enabled.    |
| Host controls missing          | Log in with Host credentials (`admin`/`password`) at `/host`.            |
| Network access issues          | Verify LAN IP and port; check firewall settings for port 5000.           |
| UI elements not loading        | Ensure `static/js/app.js`, `static/js/player.js`, and CSS files are present. |

---

## 📜 License
**MIT License** – Free for personal and commercial use, modification, and distribution.

---

## 🚀 Future Enhancements
- Add multiple user accounts with role-based access control.
- Implement dark/light theme toggle.
- Support DLNA/Chromecast for casting to smart TVs.
- Optimize mobile UI with progressive web app (PWA) support.
- Create a Docker image for easier deployment.
- Add playlist creation and media queue functionality.

---