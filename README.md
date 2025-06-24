
---

## ✅ FileFlix

### 🎯 Purpose

A modern **Netflix-style** OTT streaming and file server for **local networks**—stream, browse, and download your media content securely and beautifully.

### 🚀 Core Highlights

* **Media Streaming**: Adaptive HLS video streaming with subtitle support.
* **File Explorer**: Google Drive-like interface with type-based categorization.
* **Rich UI/UX**: Inspired by Hotstar and Netflix for familiarity and ease.
* **LAN Access**: Accessible across devices on the same network.
* **Authentication**: Simple login system for basic security.
* **Auto Thumbnails + Directory Watcher**: Smart local media management.

---

## 📋 Setup Instructions (Cleaned Up)

### 🔧 Dependencies

Install Python packages:

```bash
pip install -r requirements.txt
```

Install FFmpeg and add it to your system PATH:

* [Download FFmpeg](https://ffmpeg.org/download.html)
* **Windows**: Add `C:\Program Files\ffmpeg\bin` to PATH
* **Linux/macOS**: Add `/usr/local/bin/ffmpeg` to PATH

Verify installation:

```bash
ffmpeg -version
```

### 🗂️ Recommended Folder Layout

```
FileFlix/
├── app.py
├── config.py
├── utils.py
├── static/
│   ├── css/...
│   ├── js/...
│   └── images/
├── templates/
├── cache/
├── logs/
```

### ▶️ Running the Server

```bash
python app.py
```

Access locally: [http://localhost:5000](http://localhost:5000)
Access on LAN: [http://<your-ip>:5000](http://<your-ip>:5000)
Host controls: [http://localhost:5000/host](http://localhost:5000/host)
**Default login:** `admin / password`

---

## 💡 Usage Tips

* Place media in `/media` or choose a custom directory via host controls.
* Add subtitles by naming `.srt` files same as the video.
* Customize themes in `static/css/client_style.css`.
* Explore logs in `logs/fileflix.log`.

---

## 🧰 Troubleshooting

| Issue                    | Solution                                                    |
| ------------------------ | ----------------------------------------------------------- |
| FFmpeg not found         | Ensure it's installed and PATH is correctly set             |
| Thumbnails not generated | Check FFmpeg setup and `cache/thumbnails` write permissions |
| Video won’t play         | Confirm HLS support and video format compatibility          |
| Auth problems            | Use default credentials or update them in `app.py`          |

---

## 📜 License

**MIT License** – Open to personal and commercial modification and distribution.

---

## 🚀 Future Enhancement Ideas (Optional)

If you're planning to extend the app, consider:

* **Mobile UI Optimization**
* **DLNA/Chromecast support**
* **User profiles with access control**
* **Dark/light theme toggle**
* **Docker container for deployment**

---