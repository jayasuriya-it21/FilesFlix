FileFlix - OTT-Style Media Server
📌 Description
FileFlix is a lightweight, local media streaming and file-sharing platform built with Flask. It allows you to stream videos (MP4, MKV, etc.), view images and PDFs, and download files over your local network, with a modern UI inspired by Netflix and Hotstar, and Google Drive-like file browsing.
⚙️ Features

🎬 Stream videos with HLS adaptive bitrate and subtitle support
🖼️ Browse folders, view images/PDFs inline, download files
📂 Google Drive-like file explorer with search and categorization
🎨 Modern, responsive UI inspired by Hotstar
🔒 Basic authentication for secure LAN access
🖥️ Automatic thumbnail generation for videos
🧠 Directory monitoring for new files
📜 Logging and server controls

✅ Requirements

Python 3.8+
Flask
FFmpeg (for thumbnails and HLS)
Tkinter (for directory selection GUI)

📦 Setup
1. Install Python Dependencies
pip install -r requirements.txt

2. Install FFmpeg

Download from: https://ffmpeg.org/download.html
Add to PATH:
Windows: C:\Program Files\ffmpeg\bin
Linux: /usr/local/bin/ffmpeg


Verify:ffmpeg -version



3. Folder Structure
fileflix/
├── static/
│   ├── css/style.css
│   ├── js/main.js
│  
├── templates/
│   ├── client.html
│   └── host.html
├── cache/
│   ├── thumbnails/
│   ├── metadata/
│   └── temp/
├── logs/
├── media/
├── app.py
├── config.py
├── utils.py
├── requirements.txt
└── README.md

4. Run the Server
python app.py


Access: http://localhost:5000
Default credentials: admin/password
Host controls: /host

📺 Access from Other Devices

Connect devices to the same Wi-Fi/LAN.
Find your local IP:
Windows: ipconfig
Linux/macOS: ifconfig


Access: http://<your-local-ip>:5000

💡 Tips

Place media in /media or select a custom directory via /host.
Add .srt files with the same name as videos for subtitles.
Customize UI in static/css/style.css.
Check logs in logs/fileflix.log.

🛠️ Troubleshooting

FFmpeg not found: Ensure FFmpeg is in PATH.
No thumbnails: Verify FFmpeg installation and write permissions for cache/thumbnails.
Streaming issues: Check network bandwidth and file format support.
Authentication errors: Use admin/password or update app.py.

📄 License
MIT License. Free to use and modify.

Happy streaming with FileFlix 🍿
