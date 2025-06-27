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

let ext5vVSocket = null;
let ext5vVInterval = null;

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
        // Додаємо примусову синхронізацію при переході на вкладку
        forceSyncReedSwitch();
    } else if (tabId === 'home') {
        // На головній сторінці також є індикатор геркона
        initReedSwitchWebSocket();
        // Додаємо примусову синхронізацію при переході на вкладку
        forceSyncReedSwitch();
    } else {
        // Закриваємо WebSocket з'єднання при переході на іншу вкладку
        closeReedSwitchWebSocket();
        
        // Відновлюємо стан радіокнопок Reed Switch при переході на вкладку налаштувань
        if (tabId === 'video-options') {
            updateReedSwitchState();
        }
    }

    // EXT5V_V live logic: зупиняємо оновлення тільки якщо не на головній сторінці
    if (tabId !== 'home') {
        stopExt5vVUpdates();
    }
}

function startExt5vVUpdates() {
    stopExt5vVUpdates();
    // Можна зробити через WebSocket, але для простоти - через fetch кожну секунду
    ext5vVInterval = setInterval(() => {
        fetch('/api/ext5v-v')
            .then(response => response.json())
            .then(data => {
                document.getElementById('ext5v-v-output').textContent = data.value || 'No data';
            })
            .catch(() => {
                document.getElementById('ext5v-v-output').textContent = 'Error';
            });
    }, 1000);
}

function stopExt5vVUpdates() {
    if (ext5vVInterval) {
        clearInterval(ext5vVInterval);
        ext5vVInterval = null;
    }
}

window.addEventListener('beforeunload', () => {
    stopExt5vVUpdates();
});

document.addEventListener('DOMContentLoaded', () => {
    let activeTab = document.querySelector('.tab.active');
    if (!activeTab) {
        activeTab = document.getElementById('home');
        if (activeTab) activeTab.classList.add('active');
    }
    if (activeTab) {
        const tabId = activeTab.id;
        const activeButton = document.querySelector(`.sidebar button[onclick="showTab('${tabId}')"]`);
        if (activeButton) activeButton.classList.add('active');
    }
});

// Запускаємо live-оновлення EXT5V_V при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    startExt5vVUpdates();
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
    const resolution = document.getElementById('rtsp-resolution').value.split('x');
    const transport = document.getElementById('rtsp-transport').value;
    const duration = document.getElementById('video-duration').value;
    const fps = document.getElementById('video-fps').value;
    const folderSize = document.getElementById('size-folder-limit-gb').value;
    const photoTimeout = document.getElementById('photo-timeout').value;
    
    // Отримуємо значення RS Timeout, якщо блок видимий
    let rsTimeout = null;
    const rsTimeoutBlock = document.getElementById('rs-timeout-block');
    if (rsTimeoutBlock && rsTimeoutBlock.style.display !== 'none') {
        const rsTimeoutInput = document.getElementById('rs-timeout-input');
        if (rsTimeoutInput && rsTimeoutInput.value.trim() !== '') {
            rsTimeout = rsTimeoutInput.value.trim();
            
            // Перевірка валідності значення таймаута
            if (isNaN(Number(rsTimeout)) || Number(rsTimeout) < 0) {
                hidePreloader();
                showNotification('Please enter a valid RS Timeout value (in seconds)', true);
                return;
            }
        }
    }

    const data = {
        rtsp_transport: transport,
        rtsp_resolution_x: parseInt(resolution[0]),
        rtsp_resolution_y: parseInt(resolution[1]),
        video_duration: duration,
        fps: parseInt(fps) || 15,
        size_folder_limit_gb: parseInt(folderSize) || 10,
        photo_timeout: parseInt(photoTimeout) || 10,
    };
    
    // Додаємо значення RS Timeout, якщо воно є
    if (rsTimeout !== null) {
        data.rs_timeout = parseInt(rsTimeout);
    }

    fetch('/save-video-options', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
        .then(response => response.json())
        .then(result => {
            hidePreloader();
            if (result.success) {
                showNotification('Video options saved successfully!');
            } else {
                showNotification('ERROR: ' + result.error, true);
            }
        })
        .catch(error => {
            hidePreloader();
            showNotification('ERROR: ' + error.message, true);
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
    fetch('/api/toggle-reed-switch', {
         method: 'POST',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({reed_switch: state})
    })
    .then(response => response.json())
    .then(result => {
         hidePreloader();
         if(result.success) {
              showNotification('Reed Switch updated successfully!');
              // Оновлюємо стан після успішного перемикання
              setTimeout(updateReedSwitchState, 500);
              
              // Показуємо або приховуємо блок таймауту залежно від стану
              const rsTimeoutBlock = document.getElementById('rs-timeout-block');
              if (rsTimeoutBlock) {
                  rsTimeoutBlock.style.display = state === 'on' ? 'flex' : 'none';
              }
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
    fetch('/api/get-reed-switch-status')
        .then(response => response.json())
        .then(data => {
            const reedOnRadio = document.getElementById('reed-switch-on');
            const reedOffRadio = document.getElementById('reed-switch-off');
            const rsTimeoutBlock = document.getElementById('rs-timeout-block');
            const rsTimeoutInput = document.getElementById('rs-timeout-input');
            
            if (!reedOnRadio || !reedOffRadio) {
                console.error('Reed switch radio buttons not found');
                return;
            }
            
            if (data.state === "on") {
                reedOnRadio.checked = true;
                if (rsTimeoutBlock) {
                    rsTimeoutBlock.style.display = 'flex';
                    
                    // Отримуємо значення таймаута
                    if (rsTimeoutInput) {
                        fetch('/api/get-rs-timeout')
                            .then(response => response.json())
                            .then(timeoutData => {
                                if (timeoutData && typeof timeoutData.timeout !== 'undefined') {
                                    rsTimeoutInput.value = timeoutData.timeout;
                                } else {
                                    rsTimeoutInput.value = "0";
                                }
                            })
                            .catch(error => {
                                console.error('Error fetching RS timeout:', error);
                                rsTimeoutInput.value = "0";
                            });
                    }
                }
            } else {
                reedOffRadio.checked = true;
                if (rsTimeoutBlock) rsTimeoutBlock.style.display = 'none';
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
    
    // При кліку на вкладку налаштувань також оновлюємо стан Reed Switch
    const videoOptionsBtn = document.querySelector('.sidebar button[onclick="showTab(\'video-options\')"]');
    if (videoOptionsBtn) {
        videoOptionsBtn.addEventListener('click', updateReedSwitchState);
    }
    
    // Перевіряємо початковий стан Reed Switch для правильного відображення поля RS Timeout
    const reedOnRadio = document.getElementById('reed-switch-on');
    const rsTimeoutBlock = document.getElementById('rs-timeout-block');
    if (reedOnRadio && rsTimeoutBlock) {
        rsTimeoutBlock.style.display = reedOnRadio.checked ? 'flex' : 'none';
    }
});

function validateCarname(input) {
    input.value = input.value.replace(/[^a-zA-Z0-9]/g, '');
}

function updateServiceStatus() {
    const serviceSelector = document.getElementById('service-selector');
    if (!serviceSelector) {
        return;
    }
    
    fetch(`/get-service-status/${serviceSelector.value}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showNotification(data.error, true);
                return;
            }
            
            const serviceActive = document.getElementById('service-active');
            const serviceEnabled = document.getElementById('service-enabled');
            
            serviceActive.textContent = data.status;
            serviceActive.className = data.status === 'active' ? '' : 'error';
            
            serviceEnabled.textContent = data.enabled ? 'Yes' : 'No';
            serviceEnabled.className = data.enabled ? '' : 'error';
        })
        .catch(error => {
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
    updateServiceStatus(); // Immediately update status when tab is opened
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
            
            // Оновлюємо статус ініціалізації
            initStatus.textContent = 'Initialized';
            initStatus.classList.add('initialized');
            initStatus.classList.remove('not-initialized');
        } else {
            reedOnRadio.disabled = false;
            reedOffRadio.disabled = false;
            
            // Оновлюємо статус ініціалізації
            initStatus.textContent = 'Not initialized';
            initStatus.classList.add('not-initialized');
            initStatus.classList.remove('initialized');
        }
    }
    
    console.log("Отримано оновлення через WebSocket:", data);
    
    // Оновлення відображення статусу геркона
    if (data.hasOwnProperty('status')) {
        statusIndicator.classList.remove('closed');
        statusIndicator.classList.remove('opened');
        statusIndicator.classList.remove('unknown');
        
        console.log(`Поточний статус геркона: ${data.status}, тип: ${typeof data.status}`);
        
        // Додаємо логування для перевірки
        if (data.status === 'closed') {
            console.log('Статус: закрито (closed)');
            statusIndicator.classList.add('closed');
            statusText.textContent = 'Closed (Magnet detected)';
        } else if (data.status === 'opened') {
            console.log('Статус: відкрито (opened)');
            statusIndicator.classList.add('opened');
            statusText.textContent = 'Opened';
        } else {
            console.log(`Статус: невідомий (${data.status})`);
            statusIndicator.classList.add('unknown');
            statusText.textContent = `Unknown (${data.status})`;
        }
        
        // Оновлюємо час останнього оновлення
        if (data.hasOwnProperty('timestamp')) {
            const date = new Date(data.timestamp * 1000);
            lastUpdated.textContent = date.toLocaleTimeString();
        }
    }
    
    // Оновлення таймера автоматичної зупинки
    if (data.hasOwnProperty('autostop')) {
        if (data.autostop && data.hasOwnProperty('seconds_left')) {
            autoStopTimer.style.display = 'block';
            autoStopTime.textContent = formatTime(data.seconds_left);
            
            // Якщо час закінчився, оновлюємо статус ініціалізації
            if (data.seconds_left <= 0 && initStatus) {
                initStatus.textContent = 'Not initialized';
                initStatus.classList.add('not-initialized');
                initStatus.classList.remove('initialized');
            }
        } else {
            autoStopTimer.style.display = 'none';
        }
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
    
    console.log("Створюємо нове WebSocket з'єднання...");
    
    // Створюємо нове з'єднання
    reedSwitchSocket = io('/ws', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        forceNew: true
    });
    
    reedSwitchSocket.on('connect', function() {
        console.log("Reed Switch WebSocket з'єднання встановлено");
        const connectionStatus = document.getElementById('reed-connection-status');
        connectionStatus.textContent = 'Connected';
        connectionStatus.classList.add('connected');
        connectionStatus.classList.remove('disconnected');
        
        // Відправляємо запит на отримання початкового стану
        reedSwitchSocket.emit('get_status');
        console.log("Відправлено запит get_status");
    });
    
    reedSwitchSocket.on('connection_established', function(data) {
        console.log("Отримано підтвердження встановлення з'єднання:", data);
    });
    
    reedSwitchSocket.on('reed_switch_update', function(data) {
        console.log("Отримано оновлення reed_switch_update:", data);
        updateReedSwitchUI(data);
    });
    
    reedSwitchSocket.on('disconnect', function() {
        console.log('Reed Switch WebSocket з\'єднання закрито');
        const connectionStatus = document.getElementById('reed-connection-status');
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.classList.add('disconnected');
        connectionStatus.classList.remove('connected');
        
        // Спробуємо повторно підключитися через 2 секунди
        reedSwitchReconnectTimer = setTimeout(() => {
            console.log("Спроба повторного підключення WebSocket...");
            createReedSwitchWebSocket();
        }, 2000);
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

// Ініціалізація Reed Switch WebSocket при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    // Ініціалізуємо WebSocket для геркона після завантаження сторінки
    initReedSwitchWebSocket();
});

// CPU Load Chart
let cpuChartInterval = null;
function drawCpuChart(history) {
    const canvas = document.getElementById('cpu-load-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Темний фон
    ctx.fillStyle = '#1b263b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Осі
    ctx.strokeStyle = '#415a77';
    ctx.beginPath();
    ctx.moveTo(30, 10);
    ctx.lineTo(30, canvas.height - 20);
    ctx.lineTo(canvas.width - 10, canvas.height - 20);
    ctx.stroke();
    // Y labels
    ctx.fillStyle = '#bfc9da';
    ctx.font = '12px Arial';
    ctx.fillText('100%', 2, 18);
    ctx.fillText('0%', 10, canvas.height - 22);
    // Draw line
    if (!history || !history.length) return;
    const maxY = 100;
    const minY = 0;
    const points = history.slice(-60);
    const stepX = (canvas.width - 40) / 59;
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((val, i) => {
        const x = 30 + i * stepX;
        const y = 10 + (maxY - val) * (canvas.height - 30) / (maxY - minY);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Current value
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(points[points.length - 1].toFixed(1) + '%', canvas.width - 60, 30);
}

function startCpuChartUpdates() {
    if (cpuChartInterval) clearInterval(cpuChartInterval);
    function updateCpuChart() {
        fetch('/api/cpu-load')
            .then(r => r.json())
            .then(data => {
                if (data.history) drawCpuChart(data.history);
            });
    }
    updateCpuChart();
    cpuChartInterval = setInterval(updateCpuChart, 1000);
}

document.addEventListener('DOMContentLoaded', startCpuChartUpdates);

// Memory Usage Chart
let memChartInterval = null;
function drawMemChart(percentHistory) {
    const canvas = document.getElementById('mem-usage-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Темний фон
    ctx.fillStyle = '#1b263b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Осі
    ctx.strokeStyle = '#415a77';
    ctx.beginPath();
    ctx.moveTo(30, 10);
    ctx.lineTo(30, canvas.height - 20);
    ctx.lineTo(canvas.width - 10, canvas.height - 20);
    ctx.stroke();
    // Y labels
    ctx.fillStyle = '#bfc9da';
    ctx.font = '12px Arial';
    ctx.fillText('100%', 2, 18);
    ctx.fillText('0%', 10, canvas.height - 22);
    // Draw line
    if (!percentHistory || !percentHistory.length) return;
    const maxY = 100;
    const minY = 0;
    const points = percentHistory.slice(-60);
    const stepX = (canvas.width - 40) / 59;
    ctx.strokeStyle = '#e67e22';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((val, i) => {
        const x = 30 + i * stepX;
        const y = 10 + (maxY - val) * (canvas.height - 30) / (maxY - minY);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Current value
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(points[points.length - 1].toFixed(1) + '%', canvas.width - 60, 30);
}

let memPercentHistory = [];
function startMemChartUpdates() {
    if (memChartInterval) clearInterval(memChartInterval);
    function updateMemChart() {
        fetch('/api/mem-usage')
            .then(r => r.json())
            .then(data => {
                if (typeof data.percent === 'number') {
                    memPercentHistory.push(data.percent);
                    if (memPercentHistory.length > 60) memPercentHistory = memPercentHistory.slice(-60);
                    drawMemChart(memPercentHistory);
                }
            });
    }
    updateMemChart();
    memChartInterval = setInterval(updateMemChart, 1000);
}

document.addEventListener('DOMContentLoaded', startMemChartUpdates);

// Disk Usage Text (not chart)
function formatGB(bytes) {
    return (bytes / (1024 ** 3)).toFixed(2) + ' GB';
}

let diskTextInterval = null;
function updateDiskUsageText() {
    fetch('/api/disk-usage')
        .then(r => r.json())
        .then(data => {
            if (typeof data.total === 'number' && typeof data.used === 'number') {
                document.getElementById('disk-usage-text').textContent =
                    `Used: ${formatGB(data.used)} / Total: ${formatGB(data.total)}`;
            } else {
                document.getElementById('disk-usage-text').textContent = 'No data';
            }
        })
        .catch(() => {
            document.getElementById('disk-usage-text').textContent = 'Error';
        });
}

document.addEventListener('DOMContentLoaded', () => {
    updateDiskUsageText();
    diskTextInterval = setInterval(updateDiskUsageText, 1000);
});

// Функція для примусової синхронізації стану геркона з сервером
function forceSyncReedSwitch() {
    fetch('/api/sync-reed-switch', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log("Примусова синхронізація успішна:", data.state);
        } else {
            console.error("Помилка примусової синхронізації:", data.error);
        }
    })
    .catch(error => {
        console.error("Помилка при примусовій синхронізації:", error);
    });
}

// Нова функція для регулярного опитування стану геркона
function setupReedSwitchPolling() {
    // Створюємо таймер для резервного опитування стану кожні 2 секунди
    const pollingInterval = 2000; // 2 секунди
    
    // Функція для виконання опитування
    function pollReedSwitchStatus() {
        // Перевіряємо, чи ми зараз на вкладці Reed Switch або Home
        const reedTabActive = document.getElementById('reed-switch').classList.contains('active');
        const homeTabActive = document.getElementById('home').classList.contains('active');
        
        // Якщо ні одна з вкладок не активна, не опитуємо
        if (!reedTabActive && !homeTabActive) {
            return;
        }
        
        // Відправляємо запит на сервер
        fetch('/api/reed-switch-status')
            .then(response => response.json())
            .then(data => {
                console.log('Отримано дані через HTTP polling:', data);
                updateReedSwitchUI(data);
                
                // Кожне четверте опитування робимо примусову синхронізацію
                if (Math.random() < 0.25) {
                    forceSyncReedSwitch();
                }
            })
            .catch(error => {
                console.error('Помилка при отриманні стану геркона через HTTP:', error);
            });
    }
    
    // Запускаємо опитування з вказаним інтервалом
    return setInterval(pollReedSwitchStatus, pollingInterval);
}

// Ініціалізація Reed Switch WebSocket при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    // Ініціалізуємо WebSocket для геркона після завантаження сторінки
    initReedSwitchWebSocket();
    
    // Запускаємо резервне опитування стану геркона
    const reedSwitchPollingInterval = setupReedSwitchPolling();
    
    // Додаємо обробник для зупинки опитування при закритті сторінки
    window.addEventListener('beforeunload', () => {
        clearInterval(reedSwitchPollingInterval);
    });
});
