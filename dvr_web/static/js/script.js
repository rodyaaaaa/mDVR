const modal = document.getElementById('addCamModal');

const addCamBtn = document.querySelector('.cam-config-header button');

const closeBtn = document.querySelector('.close');

let cameraPorts = {};
const preloader = document.getElementById('preloader');

function showPreloader() {
    preloader.classList.add('active');
}

function hidePreloader() {
    preloader.classList.remove('active');
}

function openModal() {
    modal.style.display = 'block';
}

function closeModal() {
    modal.style.display = 'none';
}

addCamBtn.addEventListener('click', openModal);

closeBtn.addEventListener('click', closeModal);

function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

function extractCameraIp(rtspUrl) {
    const match = rtspUrl.match(/@([\d.]+)(:|$|\/)/);
    return match ? match[1] : null;
}


function updateViewButtons() {
    const camFields = document.querySelectorAll('#cam-fields .cam-field');
    camFields.forEach(field => {
        const input = field.querySelector('input');
        const viewButton = field.querySelector('.view-cam');
        const camIp = extractCameraIp(input.value);

        if (camIp && cameraPorts[camIp]) {
            viewButton.style.display = 'inline-block';
        } else {
            viewButton.style.display = 'none';
        }
    });
}

function updateCameraPorts() {
    fetch('/get-camera-ports')
        .then(response => response.json())
        .then(data => {
            cameraPorts = data;
            updateViewButtons();
        })
        .catch(error => console.error('Error fetching camera ports:', error));
}

function viewCamera(button) {
    const field = button.closest('.cam-field');
    const input = field.querySelector('input');
    const camIp = extractCameraIp(input.value);

    if (camIp && cameraPorts[camIp]) {
        const port = cameraPorts[camIp];
        const vpnIp = window.location.hostname;
        window.open(`http://${vpnIp}:${port}`, '_blank');
    } else {
        showNotification('Camera port not available', true);
    }
}

document.addEventListener('DOMContentLoaded', updateCameraPorts);

function confirmAddCam() {
    const rtspUrl = document.getElementById('rtspUrlInput').value;
    if (rtspUrl) {
        addCam();
        const camFields = document.querySelectorAll('#cam-fields .cam-field input');
        camFields[camFields.length - 1].value = rtspUrl;

        saveVideoLinks();

        closeModal();
    } else {
        showNotification('Input rtsp-link, please', true);
    }
}

function showTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    document.querySelectorAll('.sidebar button').forEach(button => button.classList.remove('active'));
    const activeButton = document.querySelector(`.sidebar button[onclick="showTab('${tabId}')"]`);
    activeButton.classList.add('active');

    if (tabId === 'services') {
        startServiceStatusUpdates();
    } else {
        stopServiceStatusUpdates();
    }
    
    // Ініціалізація WebSocket з'єднання при переході на вкладку Reed Switch
    if (tabId === 'reed-switch') {
        initReedSwitchWebSocket();
    } else {
        closeReedSwitchWebSocket();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        const tabId = activeTab.id;
        const activeButton = document.querySelector(`.sidebar button[onclick="showTab('${tabId}')"]`);
        activeButton.classList.add('active');
    }
});

let camCounter = document.querySelectorAll('#cam-fields .cam-field').length;

function deleteCam(button) {
    const camField = button.closest('.cam-field');
    camField.remove();
    updateCamLabels();
    saveVideoLinks();
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
    showPreloader();
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
            hidePreloader();
            if (result.success) {
                updateCameraPorts();
                showNotification('Video links saved successfully!');
            } else {
                showNotification(`ERROR: ${result.error}`, true);
            }
        })
        .catch(error => {
            hidePreloader();
            console.error('Error saving video links:', error);
        });
}

function enableEdit(button) {
    const field = button.closest('.cam-field');
    const input = field.querySelector('input');
    input.disabled = false;
    input.focus();
    button.textContent = 'Save';
    button.onclick = () => saveCamEdit(field);
}

function saveCamEdit(field) {
    const input = field.querySelector('input');
    input.disabled = true;
    const editButton = field.querySelector('.edit-cam');
    editButton.textContent = 'Edit';
    editButton.onclick = () => enableEdit(editButton);

    saveVideoLinks();
}

function saveFtpConfig() {
    showPreloader();
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
            hidePreloader();
            if (result.success) {
                showNotification('The ftp settings is saved!');
                setTimeout(updateImei, 1000);
            } else {
                showNotification(`ERROR: ${result.error}`, true);
            }
        })
        .catch(error => {
            hidePreloader();
            console.error('ERROR:', error);
        });
}

function saveVideoOptions() {
    showPreloader();
    const rtspTransport = document.getElementById('rtsp-transport').value;
    const rtspResolution = document.getElementById('rtsp-resolution').value;

    if (!rtspResolution.includes('x')) {
        hidePreloader();
        showNotification('Invalid resolution format! Use "WIDTHxHEIGHT".', true);
        return;
    }

    const [rtspResX, rtspResY] = rtspResolution.split('x').map(Number);

    const selectedMode = document.querySelector('input[name="write_mode"]:checked').value;

    const data = {
        rtsp_transport: rtspTransport,
        rtsp_resolution_x: rtspResX,
        rtsp_resolution_y: rtspResY,
        folder_size: document.getElementById('size-folder-limit-gb').value,
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
            hidePreloader();
            if (result.success) {
                showNotification('The settings is saved!');
            } else {
                showNotification(`ERROR ${result.error}`, true)
            }
        })
        .catch(error => {
            hidePreloader();
            showNotification('Connection error', true)
        });
}

function saveVpnConfig() {
    showPreloader();
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
            hidePreloader();
            if (result.success) {
                showNotification('VPN config saved successfully!');
                setTimeout(updateImei, 1000);
            } else {
                showNotification(`ERROR: ${result.error}`, true);
            }
        })
        .catch(error => {
            hidePreloader();
            console.error('Error saving VPN config:', error);
        });
}

function updateWriteMode() {
    showPreloader();
    const selectedMode = document.querySelector('input[name="write_mode"]:checked').value;

    fetch('/save-write-mode', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({write_mode: selectedMode})
    })
        .then(response => response.json())
        .then(result => {
            hidePreloader();
            if (result.success) {
                toggleModeSettings(selectedMode);
                showNotification('Recording mode updated!');
            } else {
                showNotification(`ERROR: ${result.error}`, true);
            }
        })
        .catch(error => {
            hidePreloader();
            showNotification(`ERROR: ${error.message}`, true);
        });
}

function toggleModeSettings(mode) {
    const isPhotoMode = mode === 'photo';
    const videoModeElements = document.querySelectorAll('.video-mode');
    const photoModeElements = document.querySelectorAll('.photo-mode');

    videoModeElements.forEach(el => el.style.display = isPhotoMode ? 'none' : 'flex');
    photoModeElements.forEach(el => el.style.display = isPhotoMode ? 'flex' : 'none');
}

function toggleReedSwitch() {
    showPreloader();
    const state = document.querySelector('input[name="reed_switch"]:checked').value;
    fetch('/toggle-reed-switch', {
         method: 'POST',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({reed_switch: state})
    })
    .then(response => response.json())
    .then(result => {
         hidePreloader();
         if(result.success) {
              showNotification('Reed Switch updated successfully!');
         } else {
              showNotification('ERROR: ' + result.error, true);
         }
    })
    .catch(error => {
         hidePreloader();
         showNotification('ERROR: ' + error.message, true);
    });
}


document.addEventListener('DOMContentLoaded', () => {
    const initialMode = document.querySelector('input[name="write_mode"]:checked').value;
    toggleModeSettings(initialMode);
});


function updateReedSwitchState() {
    fetch('/get-reed-switch-status')
        .then(response => response.json())
        .then(data => {
            const reedOnRadio = document.getElementById('reed-switch-on');
            const reedOffRadio = document.getElementById('reed-switch-off');
            if (data.state === "on") {
                reedOnRadio.checked = true;
            } else {
                reedOffRadio.checked = true;
            }
        })
        .catch(error => console.error('Error fetching reed switch status:', error));
}

function updateImei() {
    fetch('/get-imei')
        .then(response => response.json())
        .then(data => {
            if (data.imei) {
                const imeiElement = document.querySelector('header p');
                imeiElement.textContent = `IMEI: ${data.imei}`;
            }
        })
        .catch(error => console.error('Error fetching IMEI:', error));
}

// Оновлювати IMEI кожні 10 секунд
setInterval(updateImei, 10000);

// Викликати оновлення статусу при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    updateReedSwitchState();
    updateImei();
    const initialMode = document.querySelector('input[name="write_mode"]:checked').value;
    toggleModeSettings(initialMode);
});

function validateCarname(input) {
    input.value = input.value.replace(/[^a-zA-Z0-9]/g, '');
}

function updateServiceStatus() {
    const serviceSelector = document.getElementById('service-selector');
    const serviceActive = document.getElementById('service-active');
    const serviceEnabled = document.getElementById('service-enabled');
    
    if (!serviceSelector.value) {
        serviceActive.textContent = '-';
        serviceEnabled.textContent = '-';
        return;
    }

    showPreloader();
    
    fetch(`/get-service-status/${serviceSelector.value}`)
        .then(response => response.json())
        .then(data => {
            hidePreloader();
            if (data.error) {
                showNotification(data.error, true);
                return;
            }
            
            serviceActive.textContent = data.status;
            serviceActive.className = data.status === 'active' ? '' : 'error';
            
            serviceEnabled.textContent = data.enabled ? 'Yes' : 'No';
            serviceEnabled.className = data.enabled ? '' : 'error';
        })
        .catch(error => {
            hidePreloader();
            showNotification('Error fetching service status', true);
            console.error('Error:', error);
        });
}

// Оновлюємо стан сервісу кожні 5 секунд, якщо вкладка Services активна
let serviceStatusInterval;

function startServiceStatusUpdates() {
    if (serviceStatusInterval) {
        clearInterval(serviceStatusInterval);
    }
    serviceStatusInterval = setInterval(updateServiceStatus, 5000);
}

function stopServiceStatusUpdates() {
    if (serviceStatusInterval) {
        clearInterval(serviceStatusInterval);
        serviceStatusInterval = null;
    }
}

// Глобальна змінна для WebSocket з'єднання
let reedSwitchSocket = null;
let reedSwitchReconnectTimer = null;

// Функція ініціалізації WebSocket для геркона
function initReedSwitchWebSocket() {
    if (reedSwitchSocket && reedSwitchSocket.connected) {
        return; // З'єднання вже активне
    }
    
    closeReedSwitchWebSocket(); // Закриваємо попереднє з'єднання, якщо існує
    
    // Використовуємо socket.io для з'єднання
    reedSwitchSocket = io('/ws', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
    
    reedSwitchSocket.on('connect', function() {
        console.log("Reed Switch WebSocket з'єднання встановлено");
        const connectionStatus = document.getElementById('reed-connection-status');
        connectionStatus.textContent = 'Connected';
        connectionStatus.classList.add('connected');
        connectionStatus.classList.remove('disconnected');
        
        // Відправляємо запит на отримання початкового стану
        reedSwitchSocket.emit('get_status');
    });
    
    reedSwitchSocket.on('reed_switch_update', function(data) {
        updateReedSwitchUI(data);
    });
    
    reedSwitchSocket.on('disconnect', function() {
        console.log('Reed Switch WebSocket з\'єднання закрито');
        const connectionStatus = document.getElementById('reed-connection-status');
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.classList.add('disconnected');
        connectionStatus.classList.remove('connected');
    });
    
    reedSwitchSocket.on('connect_error', function(error) {
        console.error(`Reed Switch WebSocket помилка підключення: ${error.message}`);
        const connectionStatus = document.getElementById('reed-connection-status');
        connectionStatus.textContent = 'Error';
        connectionStatus.classList.add('disconnected');
        connectionStatus.classList.remove('connected');
    });
}

// Функція для закриття WebSocket з'єднання
function closeReedSwitchWebSocket() {
    if (reedSwitchReconnectTimer) {
        clearTimeout(reedSwitchReconnectTimer);
        reedSwitchReconnectTimer = null;
    }
    
    if (reedSwitchSocket) {
        reedSwitchSocket.disconnect();
        reedSwitchSocket = null;
    }
}

// Функція для оновлення UI стану геркона
function updateReedSwitchUI(data) {
    const statusIndicator = document.getElementById('reed-status-indicator');
    const statusText = document.getElementById('reed-status-text');
    const lastUpdated = document.getElementById('reed-last-updated');
    
    console.log(data.status)

    // Встановлення статусу (відкритий/закритий)
    if (data.status === 'open') {
        statusIndicator.classList.add('open');
        statusIndicator.classList.remove('closed');
        statusText.textContent = 'Відкритий';
        statusText.classList.add('open');
        statusText.classList.remove('closed');
    } else if (data.status === 'closed') {
        statusIndicator.classList.add('closed');
        statusIndicator.classList.remove('open');
        statusText.textContent = 'Закритий';
        statusText.classList.add('closed');
        statusText.classList.remove('open');
    } else {
        statusIndicator.classList.remove('open', 'closed');
        statusText.textContent = 'Невідомо';
        statusText.classList.remove('open', 'closed');
    }
    
    // Оновлення часу останнього оновлення
    if (data.timestamp) {
        const date = new Date(data.timestamp * 1000);
        lastUpdated.textContent = date.toLocaleString('uk-UA');
    } else {
        lastUpdated.textContent = new Date().toLocaleString('uk-UA');
    }
}

// Додаємо обробник закриття з'єднання при закритті вікна
window.addEventListener('beforeunload', closeReedSwitchWebSocket);
