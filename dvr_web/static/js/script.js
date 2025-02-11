function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function showTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

let camCounter = document.querySelectorAll('#cam-fields .cam-field').length;

function deleteCam(button) {
    const camField = button.closest('.cam-field');
    camField.remove();
    updateCamLabels();
}

function updateCamLabels() {
    const camFields = document.querySelectorAll('#cam-fields .cam-field');
    camFields.forEach((field, index) => {
        field.querySelector('label').textContent = `Cam ${index + 1}:`;
    });
    camCounter = camFields.length;
}

function addCam() {
    camCounter++;
    const camFields = document.getElementById('cam-fields');
    const newCamField = document.createElement('div');
    newCamField.classList.add('cam-field');
    newCamField.innerHTML = `
        <label>Cam ${camCounter}:</label>
        <input type="text" placeholder="Select RTSP url://">
        <button class="delete-cam" onclick="deleteCam(this)">×</button>
    `;
    camFields.appendChild(newCamField);
    updateCamLabels();
}

function changeStream(select) {
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.src = `https://example.com/${select.value}.mp4`;
}

function changeLog(select) {
    showNotification(`You a select: ${select.value}`);
}

function saveVideoLinks() {
    const camFields = document.querySelectorAll('#cam-fields .cam-field input');
    const videoLinks = Array.from(camFields).map(input => input.value);

    const data = {
        camera_list: videoLinks
    };

    fetch('/save-video-links', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                showNotification('Video links saved successfully!');
            } else {
                showNotification(`ERROR: ${result.error}`, true);
            }
        })
        .catch(error => {
            console.error('Error saving video links:', error);
        });
}

function saveFtpConfig() {
    const activeTab = document.getElementById('ftp-config');
    const inputs = activeTab.querySelectorAll('input');

    const ftpConfig = {
        server: inputs[0].value,
        port: inputs[1].value,
        user: inputs[2].value,
        password: inputs[3].value,
        car_name: inputs[4].value
    };

    const data = {
        ftp: ftpConfig
    };

    fetch('/save-ftp-config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
        .then(response => response.json())
        .then(result => {
            result.success
                ? showNotification('The ftp settings is saved!')
                : showNotification(`ERROR: ${result.error}`, true);
        })
        .catch(error => console.error('Помилка:', error));
}

function saveVideoOptions() {
    const rtspTransport = document.getElementById('rtsp-transport').value;
    const rtspResolution = document.getElementById('rtsp-resolution').value;

    if (!rtspResolution.includes('x')) {
        showNotification('Невірний формат роздільної здатності! Використовуйте "ШИРИНАxВИСОТА"', true);
        return;
    }

    const [rtspResX, rtspResY] = rtspResolution.split('x').map(Number);

    const selectedMode = document.querySelector('input[name="write_mode"]:checked').value;

    const data = {
        rtsp_transport: rtspTransport,
        rtsp_resolution_x: rtspResX,
        rtsp_resolution_y: rtspResY,
        video_duration: selectedMode === 'video' ? document.getElementById('video-duration').value : null,
        fps: selectedMode === 'video' ? parseInt(document.getElementById('video-fps').value) : null,
        photo_timeout: selectedMode === 'photo' ? parseInt(document.getElementById('photo-timeout').value) : null
    };

    fetch('/save-video-options', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                showNotification('The settings is saved!');
            } else {
                showNotification(`ERROR ${result.error}`, true)
            }
        })
        .catch(error => showNotification('Connection error', true));
}

function saveVpnConfig() {
    const vpnConfig = document.querySelector('#vpn-config textarea').value;

    fetch('/save-vpn-config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({vpn_config: vpnConfig}),
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                showNotification('VPN config saved successfully!');
            } else {
                showNotification(`ERROR: ${result.error}`, true);
            }
        })
        .catch(error => {
            console.error('Error saving VPN config:', error);
        });
}

function updateWriteMode() {
    const selectedMode = document.querySelector('input[name="write_mode"]:checked').value;

    fetch('/save-write-mode', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({write_mode: selectedMode})
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                toggleModeSettings(selectedMode);
                showNotification('Режим запису оновлено!');
            } else {
                showNotification(`Помилка: ${result.error}`, true);
            }
        })
        .catch(error => {
            showNotification(`Помилка: ${error.message}`, true);
        });
}

function toggleModeSettings(mode) {
    const isPhotoMode = mode === '1'; // теперь значение приходит как '0' или '1'
    const videoModeElements = document.querySelectorAll('.video-mode');
    const photoModeElements = document.querySelectorAll('.photo-mode');

    videoModeElements.forEach(el => el.style.display = isPhotoMode ? 'none' : 'flex');
    photoModeElements.forEach(el => el.style.display = isPhotoMode ? 'flex' : 'none');
}

document.addEventListener('DOMContentLoaded', () => {
    const initialMode = document.querySelector('input[name="write_mode"]:checked').value;
    toggleModeSettings(initialMode);
});