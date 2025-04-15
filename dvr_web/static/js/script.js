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
        // Закриваємо WebSocket з'єднання при переході на іншу вкладку
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
    serviceStatusInterval = setInterval(updateServiceStatus, 80);
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
// Видаляємо змінну локального таймера
// let reedSwitchAutoStopTimer = null;  // Таймер для автоматичної зупинки перевірки геркона
let reedSwitchCountdownInterval = null;  // Інтервал для оновлення відображення часу

// Функція для форматування часу у формат MM:SS
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

// Функція для оновлення UI стану геркона
function updateReedSwitchUI(data) {
    const statusIndicator = document.getElementById('reed-status-indicator');
    const statusText = document.getElementById('reed-status-text');
    const lastUpdated = document.getElementById('reed-last-updated');
    const initStatus = document.getElementById('reed-init-status');
    const autoStopTimer = document.getElementById('auto-stop-timer');
    const autoStopTime = document.getElementById('auto-stop-time');
    const reedOnRadio = document.getElementById('reed-switch-on');
    const reedOffRadio = document.getElementById('reed-switch-off');
    
    // Блокуємо або розблоковуємо перемикач Reed Switch у Settings
    if (data.hasOwnProperty('initialized')) {
        if (data.initialized) {
            reedOnRadio.disabled = true;
            reedOffRadio.disabled = true;
        } else {
            reedOnRadio.disabled = false;
            reedOffRadio.disabled = false;
        }
    }

    console.log(data);

    // Перевіряємо, чи геркон ініціалізовано
    if (data.hasOwnProperty('initialized')) {
        if (data.initialized) {
            initStatus.textContent = 'Initialized';
            initStatus.classList.add('initialized');
            initStatus.classList.remove('not-initialized');
            document.getElementById('init-reed-switch-btn').textContent = 'Re-initialize Reed Switch';
            
            // Перевіряємо інформацію про автоматичну зупинку
            if (data.hasOwnProperty('autostop') && data.autostop) {
                autoStopTimer.classList.remove('hidden');
                if (data.hasOwnProperty('seconds_left')) {
                    autoStopTime.textContent = formatTime(data.seconds_left);
                }
            } else {
                autoStopTimer.classList.add('hidden');
            }
        } else {
            initStatus.textContent = 'Not initialized';
            initStatus.classList.add('not-initialized');
            initStatus.classList.remove('initialized');
            document.getElementById('init-reed-switch-btn').textContent = 'Initialize Reed Switch';
            
            // Приховуємо таймер, якщо геркон не ініціалізовано
            autoStopTimer.classList.add('hidden');
            
            // Якщо геркон не ініціалізовано, не відображаємо його стан
            statusIndicator.classList.remove('open', 'closed');
            statusText.textContent = 'Unavailable (not initialized)';
            statusText.classList.remove('open', 'closed');
            return;
        }
    }

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

// Функція для ініціалізації геркона через API
function initializeReedSwitch() {
    const initButton = document.getElementById('init-reed-switch-btn');
    const stopButton = document.getElementById('stop-reed-switch-btn');
    const initStatus = document.getElementById('reed-init-status');
    const connectionStatus = document.getElementById('reed-connection-status');
    const autoStopTimer = document.getElementById('auto-stop-timer');
    
    // Приховуємо таймер перед початком ініціалізації
    autoStopTimer.classList.add('hidden');
    
    // Змінюємо текст кнопки та блокуємо її на час ініціалізації
    initButton.textContent = 'Initializing...';
    initButton.disabled = true;
    stopButton.disabled = true;
    
    // Закриваємо існуюче з'єднання, якщо воно є
    closeReedSwitchWebSocket();
    
    // Показуємо статус "Connecting..."
    connectionStatus.textContent = 'Connecting...';
    connectionStatus.classList.remove('connected', 'disconnected');
    
    // Виконуємо POST-запит на сервер для ініціалізації геркона
    fetch('/api/initialize-reed-switch', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        initButton.disabled = false;
        stopButton.disabled = false;
        
        if (data.success) {
            initStatus.textContent = 'Initialized';
            initStatus.classList.add('initialized');
            initStatus.classList.remove('not-initialized');
            initButton.textContent = 'Re-initialize Reed Switch';
            
            // Оновлюємо відображення стану геркона
            if (data.status) {
                // Додаємо інформацію про автоматичну зупинку
                const statusData = {
                    status: data.status,
                    timestamp: Math.floor(Date.now() / 1000),
                    initialized: true,
                    autostop: data.autostop || false,
                    seconds_left: data.seconds_left || 0
                };
                
                updateReedSwitchUI(statusData);
            }
            
            // Створюємо нове WebSocket з'єднання безпосередньо без перевірки статусу ініціалізації
            // Оскільки ми вже знаємо, що ініціалізація успішна
            createReedSwitchWebSocket();
            
            showNotification('Reed switch initialized successfully!');
        } else {
            initStatus.textContent = 'Initialization failed';
            initStatus.classList.add('not-initialized');
            initStatus.classList.remove('initialized');
            initButton.textContent = 'Try Again';
            
            // Оновлюємо статус з'єднання
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.classList.add('disconnected');
            connectionStatus.classList.remove('connected');
            
            // Перевіряємо, чи помилка пов'язана з перемикачем Reed Switch
            if (data.reed_switch_enabled) {
                // Показуємо спеціальне повідомлення з інструкцією
                showNotification('Error: Please set Reed Switch to OFF in Settings tab before initializing!', true);
                
                // Додаємо підказку для користувача, щоб він знав, що робити
                const switchTabBtn = document.querySelector('.sidebar button[onclick="showTab(\'video-options\')"]');
                if (switchTabBtn) {
                    switchTabBtn.classList.add('highlight');
                    setTimeout(() => {
                        switchTabBtn.classList.remove('highlight');
                    }, 3000);
                }
            } else {
                showNotification('Failed to initialize reed switch: ' + (data.error || 'Unknown error'), true);
            }
        }
    })
    .catch(error => {
        console.error('Error initializing reed switch:', error);
        initButton.disabled = false;
        stopButton.disabled = false;
        initButton.textContent = 'Try Again';
        initStatus.textContent = 'Initialization failed';
        
        // Оновлюємо статус з'єднання
        connectionStatus.textContent = 'Error';
        connectionStatus.classList.add('disconnected');
        connectionStatus.classList.remove('connected');
        
        showNotification('Error initializing reed switch: ' + error.message, true);
    });
}

// Функція для зупинки моніторингу геркона
function stopReedSwitchMonitoring() {
    const initButton = document.getElementById('init-reed-switch-btn');
    const stopButton = document.getElementById('stop-reed-switch-btn');
    const initStatus = document.getElementById('reed-init-status');
    const statusIndicator = document.getElementById('reed-status-indicator');
    const statusText = document.getElementById('reed-status-text');
    const connectionStatus = document.getElementById('reed-connection-status');
    const autoStopTimer = document.getElementById('auto-stop-timer');
    
    // Приховуємо таймер
    autoStopTimer.classList.add('hidden');
    
    // Змінюємо текст кнопки та блокуємо її на час зупинки
    stopButton.textContent = 'Stopping...';
    stopButton.disabled = true;
    initButton.disabled = true;
    
    // Закриваємо WebSocket з'єднання до відправки запиту
    closeReedSwitchWebSocket();
    
    // Оновлюємо статус підключення на Disconnected
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.classList.add('disconnected');
    connectionStatus.classList.remove('connected');
    
    // Виконуємо POST-запит на сервер для зупинки моніторингу геркона
    fetch('/api/stop-reed-switch', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        stopButton.disabled = false;
        initButton.disabled = false;
        
        if (data.success) {
            initStatus.textContent = 'Not initialized';
            initStatus.classList.add('not-initialized');
            initStatus.classList.remove('initialized');
            initButton.textContent = 'Initialize Reed Switch';
            stopButton.textContent = 'Stop Monitoring';
            
            // Оновлюємо відображення стану геркона
            statusIndicator.classList.remove('open', 'closed');
            statusText.textContent = 'Unavailable (monitoring stopped)';
            statusText.classList.remove('open', 'closed');
            
            showNotification('Reed switch monitoring stopped successfully!');
        } else {
            stopButton.textContent = 'Stop Monitoring';
            showNotification('Failed to stop reed switch monitoring: ' + (data.error || 'Unknown error'), true);
        }
    })
    .catch(error => {
        console.error('Error stopping reed switch monitoring:', error);
        stopButton.disabled = false;
        initButton.disabled = false;
        stopButton.textContent = 'Stop Monitoring';
        
        showNotification('Error stopping reed switch monitoring: ' + error.message, true);
    });
}

// Перевірка статусу ініціалізації при завантаженні вкладки
function checkReedSwitchInitialized() {
    fetch('/api/reed-switch-status')
        .then(response => response.json())
        .then(data => {
            updateReedSwitchUI(data);
        })
        .catch(error => {
            console.error('Error checking reed switch status:', error);
            showNotification('Error checking reed switch status', true);
        });
}

// Нова функція для створення WebSocket з'єднання без додаткової перевірки статусу
function createReedSwitchWebSocket() {
    // Закриваємо попереднє з'єднання, якщо воно існує
    closeReedSwitchWebSocket();
    
    // Створюємо нове з'єднання
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

// Функція ініціалізації WebSocket для геркона
function initReedSwitchWebSocket() {
    if (reedSwitchSocket && reedSwitchSocket.connected) {
        return; // З'єднання вже активне
    }
    
    closeReedSwitchWebSocket(); // Закриваємо попереднє з'єднання, якщо існує
    
    // Спочатку перевіряємо статус ініціалізації геркона
    fetch('/api/reed-switch-status')
        .then(response => response.json())
        .then(data => {
            updateReedSwitchUI(data);
            
            // Підключаємось через WebSocket тільки якщо геркон ініціалізовано
            if (data.initialized) {
                createReedSwitchWebSocket();
            } else {
                // Якщо геркон не ініціалізовано, встановлюємо статус підключення як відключено
                const connectionStatus = document.getElementById('reed-connection-status');
                connectionStatus.textContent = 'Disconnected';
                connectionStatus.classList.add('disconnected');
                connectionStatus.classList.remove('connected');
            }
        })
        .catch(error => {
            console.error('Error checking reed switch status:', error);
            // При помилці також показуємо статус відключено
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

// Додаємо обробник закриття з'єднання при закритті вікна
window.addEventListener('beforeunload', closeReedSwitchWebSocket);
