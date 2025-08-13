// Configuration functionality

// Video options functions
function saveVideoOptions() {
    showPreloader();
    const resolution = document.getElementById('rtsp-resolution').value.split('x');
    const transportEl = document.querySelector('input[name="rtsp_transport"]:checked');
    const transport = transportEl ? transportEl.value : 'tcp';
    const duration = document.getElementById('video-duration').value;
    const fps = document.getElementById('video-fps').value;
    const folderSize = document.getElementById('size-folder-limit-gb').value;
    const photoTimeout = document.getElementById('photo-timeout').value;

    const data = {
        rtsp_transport: transport,
        rtsp_resolution_x: parseInt(resolution[0]),
        rtsp_resolution_y: parseInt(resolution[1]),
        video_duration: duration,
        fps: parseInt(fps) || 15,
        size_folder_limit_gb: parseInt(folderSize) || 10,
        photo_timeout: parseInt(photoTimeout) || 10,
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

// VPN enable/disable
function updateVpnStatusUI(enabled) {
    const checkbox = document.getElementById('vpn-enabled');
    if (checkbox) checkbox.checked = !!enabled;
}

function loadVpnStatus() {
    fetch('/get-service-status/wg-quick@wg0.service')
        .then(r => r.json())
        .then(data => {
            const enabled = !!data.enabled;
            updateVpnStatusUI(enabled);
        })
        .catch(() => updateVpnStatusUI(false));
}

function toggleVpn(enabled) {
    showPreloader();
    fetch('/set-vpn-enabled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !!enabled })
    })
        .then(r => r.json())
        .then(result => {
            hidePreloader();
            if (result.success) {
                updateVpnStatusUI(!!result.enabled);
                showNotification(`VPN ${result.enabled ? 'enabled' : 'disabled'}`);
            } else {
                showNotification('ERROR: ' + (result.error || 'toggle failed'), true);
                loadVpnStatus();
            }
        })
        .catch(err => {
            hidePreloader();
            showNotification('ERROR: ' + err.message, true);
            loadVpnStatus();
        });
}

// FTP Upload enable/disable (mdvr_upload.timer)
function updateFtpUploadStatusUI(enabled, statusText) {
    const checkbox = document.getElementById('ftp-upload-enabled');
    const statusEl = document.getElementById('ftp-upload-status');
    if (checkbox) checkbox.checked = !!enabled;
    if (statusEl) statusEl.textContent = `Status: ${statusText || (enabled ? 'active' : 'inactive')}`;
}

function loadFtpUploadStatus() {
    const statusEl = document.getElementById('ftp-upload-status');
    if (statusEl) statusEl.textContent = 'Status: loading...';
    fetch('/get-service-status/mdvr_upload.timer')
        .then(r => r.json())
        .then(data => {
            const enabled = !!data.enabled;
            const status = data.status || 'unknown';
            updateFtpUploadStatusUI(enabled, status);
        })
        .catch(err => {
            console.error('Error fetching upload timer status:', err);
            updateFtpUploadStatusUI(false, 'error');
        });
}

function toggleFtpUpload(enabled) {
    showPreloader();
    fetch('/set-upload-enabled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !!enabled })
    })
        .then(r => r.json())
        .then(result => {
            hidePreloader();
            if (result.success) {
                updateFtpUploadStatusUI(!!result.enabled, result.status);
                showNotification(`FTP Upload ${result.enabled ? 'enabled' : 'disabled'}`);
            } else {
                showNotification('ERROR: ' + (result.error || 'toggle failed'), true);
                loadFtpUploadStatus();
            }
        })
        .catch(err => {
            hidePreloader();
            showNotification('ERROR: ' + err.message, true);
            loadFtpUploadStatus();
        });
}

function saveRSConfig() {
    showPreloader();

    let rsTimeout = null;
    const rsTimeoutInput = document.getElementById('rs-timeout-input');
    if (rsTimeoutInput && rsTimeoutInput.value.trim() !== '') {
        rsTimeout = rsTimeoutInput.value.trim();
        
        // Validate timeout value
        if (isNaN(Number(rsTimeout)) || Number(rsTimeout) < 0) {
            hidePreloader();
            showNotification('Please enter a valid RS Timeout value (in seconds)', true);
            return;
        }
    }

    const data = {
        rs_timeout: parseInt(rsTimeout),
    };

    fetch('/save-rs-timeout', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
        .then(response => response.json())
        .then(result => {
            hidePreloader();
            if (result.success) {
                showNotification('Sensors options saved successfully!');
            } else {
                showNotification('ERROR: ' + result.error, true);
            }
        })
        .catch(error => {
            hidePreloader();
            showNotification('ERROR: ' + error.message, true);
        });
}

// FTP config functions
function saveFtpConfig() {
    showPreloader();
    
    // Get the FTP form inputs by their correct IDs
    const server = document.getElementById('ftp-server-ip').value;
    const port = parseInt(document.getElementById('ftp-server-port').value) || 21;
    const user = document.getElementById('ftp-server-login').value;
    const password = document.getElementById('ftp-server-passwd').value;
    const car_name = document.getElementById('ftp-server-carname').value;

    const ftpConfig = {
        server: server,
        port: port,
        user: user,
        password: password,
        car_name: car_name
    };
    
    console.log("FTP config to save:", ftpConfig);

    const data = {
        ftp: ftpConfig
    };

    fetch('/save-ftp-config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
    })
    .then(result => {
        hidePreloader();
        if (result.success) {
            showNotification('The FTP settings have been saved!');
            setTimeout(updateImei, 1000);
        } else {
            showNotification(`ERROR: ${result.error}`, true);
        }
    })
    .catch(error => {
        hidePreloader();
        showNotification(`ERROR: ${error.message}`, true);
        console.error('ERROR saving FTP config:', error);
    });
}

// VPN config functions
function saveVpnConfig() {
    showPreloader();
    const vpnConfig = document.querySelector('#vpn-config-text').value;

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

function uploadVpnConfigFile() {
    const fileInput = document.getElementById('vpn-config-file');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        showNotification('Please select a configuration file first', true);
        return;
    }
    
    const file = fileInput.files[0];
    showPreloader();
    
    const reader = new FileReader();
    reader.onload = function(e) {
        // Update the textarea with the file contents
        const fileContent = e.target.result;
        document.getElementById('vpn-config-text').value = fileContent;
        
        // Save the uploaded configuration
        fetch('/save-vpn-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({vpn_config: fileContent}),
        })
            .then(response => response.json())
            .then(result => {
                hidePreloader();
                if (result.success) {
                    showNotification('VPN config file uploaded and saved successfully!');
                    setTimeout(updateImei, 1000);
                } else {
                    showNotification(`ERROR: ${result.error}`, true);
                }
            })
            .catch(error => {
                hidePreloader();
                showNotification(`ERROR: ${error.message}`, true);
            });
    };
    
    reader.onerror = function() {
        hidePreloader();
        showNotification('Error reading file', true);
    };
    
    reader.readAsText(file);
}

// Write mode functions
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

// IMEI update function
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

// Show Settings Tab function - додамо код для відображення фіксованої кнопки
function showSettingsTab(tabId) {
    const allSettingsContent = document.querySelectorAll('.settings-content');
    allSettingsContent.forEach(content => {
        content.classList.remove('active');
    });
    
    const allTabs = document.querySelectorAll('.settings-tab');
    allTabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    const selectedContent = document.getElementById(tabId);
    selectedContent.classList.add('active');
    
    const activeTabId = tabId.replace('-content', '-tab');
    const activeTab = document.getElementById(activeTabId);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    // When showing FTP settings, refresh upload timer status
    if (tabId === 'ftp-settings-content') {
        loadFtpUploadStatus();
    }
    // When showing VPN settings, refresh VPN service status
    if (tabId === 'vpn-settings-content') {
        loadVpnStatus();
    }
}

// Initialize configuration functionality
document.addEventListener('DOMContentLoaded', () => {
    const initialMode = document.querySelector('input[name="write_mode"]:checked').value;
    toggleModeSettings(initialMode);
    
    updateImei();
    
    setInterval(updateImei, 10000);
    
    document.getElementById('general-settings-tab').addEventListener('click', () => showSettingsTab('general-settings-content'));
    document.getElementById('sensors-settings-tab').addEventListener('click', () => showSettingsTab('sensors-settings-content'));
    document.getElementById('ftp-settings-tab').addEventListener('click', () => showSettingsTab('ftp-settings-content'));
    document.getElementById('vpn-settings-tab').addEventListener('click', () => showSettingsTab('vpn-settings-content'));
    // Preload statuses for initial active tab if needed
    const activeSettings = document.querySelector('.settings-content.active');
    if (activeSettings && activeSettings.id === 'ftp-settings-content') {
        loadFtpUploadStatus();
    }
    if (activeSettings && activeSettings.id === 'vpn-settings-content') {
        loadVpnStatus();
    }
});

// Validate car name input - allow only numbers and uppercase letters
function validateCarname(input) {
    input.value = input.value.replace(/[^A-Z0-9]/g, '');
    
    if (input.value.length > 6) {
        input.value = input.value.substring(0, 6);
    }
} 