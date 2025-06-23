/* static/js/main.js */

async function loadFiles(path = '') {
    try {
        const response = await fetch(`/files?path=${encodeURIComponent(path)}`, {
            headers: {
                'Authorization': 'Basic ' + btoa('admin:password') // Hardcoded for simplicity; use a login prompt in production
            }
        });
        if (response.status === 401) {
            console.error('Authentication failed. Please log in.');
            alert('Authentication required. Please use admin/password or check server settings.');
            return;
        }
        const data = await response.json();
        if (data.status === 'error') {
            console.error('Error fetching files:', data.message);
            document.getElementById('file-grid').innerHTML = '<p>No files found or directory inaccessible.</p>';
            return;
        }

        const grid = document.getElementById('file-grid');
        const breadcrumb = document.getElementById('breadcrumb');
        grid.innerHTML = '';

        // Update breadcrumb
        const pathParts = path.split('/').filter(p => p);
        let breadcrumbHtml = '<a href="#" onclick="loadFiles(\'\')">Home</a>';
        let currentPath = '';
        for (const part of pathParts) {
            currentPath += `${part}/`;
            breadcrumbHtml += ` > <a href="#" onclick="loadFiles('${currentPath.slice(0, -1)}')">${part}</a>`;
        }
        breadcrumb.innerHTML = breadcrumbHtml;

        // Check if empty
        if (data.folders.length === 0 && data.files.length === 0) {
            grid.innerHTML = '<p>No files or folders found in this directory.</p>';
            return;
        }

        // Render folders
        data.folders.forEach(folder => {
            const card = document.createElement('div');
            card.className = 'file-card';
            card.innerHTML = `
                <div class="file-placeholder"><i class="fas fa-folder"></i> ${folder.name}</div>
                <div class="file-info">
                    <h5>${folder.name}</h5>
                </div>
            `;
            card.onclick = () => loadFiles(folder.path);
            grid.appendChild(card);
        });

        // Render files
        data.files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'file-card';
            const ext = file.name.split('.').pop().toLowerCase();
            let content = '';
            let actions = `<a href="/file/${encodeURIComponent(file.path)}" class="btn">Download</a>`;

            if (['mp4', 'mkv', 'mov', 'avi', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) {
                content = `<img src="/cache/thumbnails/${encodeURIComponent(file.name)}.jpg" alt="${file.name}" onerror="this.src='/static/images/fallback.jpg'">`;
                actions += ` <a href="#" class="btn" onclick="openVideo('${encodeURIComponent(file.path)}')">Play</a>`;
            } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
                content = `<img src="/file/${encodeURIComponent(file.path)}" alt="${file.name}">`;
                actions += ` <a href="#" class="btn" onclick="openPreview('${encodeURIComponent(file.path)}', 'image')">View</a>`;
            } else if (ext === 'pdf') {
                content = `<embed src="/file/${encodeURIComponent(file.path)}" type="application/pdf">`;
                actions += ` <a href="#" class="btn" onclick="openPreview('${encodeURIComponent(file.path)}', 'pdf')">View</a>`;
            } else {
                content = `<div class="file-placeholder"><i class="fas fa-file"></i> ${file.name}</div>`;
            }

            card.innerHTML = `
                ${content}
                <div class="file-info">
                    <h5>${file.name}</h5>
                    ${actions}
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading files:', error);
        document.getElementById('file-grid').innerHTML = '<p>Error loading files. Check console for details.</p>';
    }
}

function filterFiles(type) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.tab[data-type="${type}"]`).classList.add('active');
    document.querySelectorAll('.file-card').forEach(card => {
        const fileName = card.querySelector('h5').textContent;
        const ext = fileName.split('.').pop().toLowerCase();
        const isFolder = card.querySelector('.fa-folder');
        let show = false;
        if (type === 'all' || isFolder) {
            show = true;
        } else if (type === 'video' && ['mp4', 'mkv', 'mov', 'avi', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) {
            show = true;
        } else if (type === 'image' && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
            show = true;
        } else if (type === 'document' && ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) {
            show = true;
        } else if (type === 'other' && !['mp4', 'mkv', 'mov', 'avi', 'wmv', 'flv', 'webm', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) {
            show = true;
        }
        card.style.display = show ? 'block' : 'none';
    });
}

function searchFiles() {
    const query = document.getElementById('search').value.toLowerCase();
    document.querySelectorAll('.file-card').forEach(card => {
        const fileName = card.querySelector('h5').textContent.toLowerCase();
        card.style.display = fileName.includes(query) ? 'block' : 'none';
    });
}

function openVideo(path) {
    const modal = document.getElementById('modal');
    const content = document.getElementById('modal-content');
    content.innerHTML = `
        <video id="video-player" class="video-js vjs-default-skin" controls preload="auto" width="100%">
            <source src="/hls/${path}" type="application/x-mpegURL">
        </video>
    `;
    modal.style.display = 'flex';
    const player = videojs('video-player', {
        controls: true,
        fluid: true,
        autoplay: false,
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        html5: {
            hls: {
                overrideNative: true
            }
        }
    });
    const srtPath = path.replace(/\.\w+$/, '.srt');
    fetch(`/srt/${srtPath}`, {
        headers: {
            'Authorization': 'Basic ' + btoa('admin:password')
        }
    })
        .then(res => res.ok ? res.blob() : null)
        .then(blob => {
            if (blob) {
                const url = URL.createObjectURL(blob);
                player.addRemoteTextTrack({ src: url, kind: 'subtitles', label: 'English' }, false);
            }
        });
}

function openPreview(path, type) {
    const modal = document.getElementById('modal');
    const content = document.getElementById('modal-content');
    if (type === 'pdf') {
        content.innerHTML = `<embed src="/file/${path}" type="application/pdf" width="100%" height="600px">`;
    } else if (type === 'image') {
        content.innerHTML = `<img src="/file/${path}" style="max-width: 100%;">`;
    }
    modal.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => filterFiles(tab.getAttribute('data-type')));
    });
    document.getElementById('search').addEventListener('input', searchFiles);
    document.querySelector('.close').addEventListener('click', () => {
        const modal = document.getElementById('modal');
        modal.style.display = 'none';
        const player = videojs.getPlayer('video-player');
        if (player) {
            player.dispose();
        }
    });
});