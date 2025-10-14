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

// Load current VPN config into textarea
function loadVpnConfig() {
    const ta = document.getElementById('vpn-config-text');
    if (!ta) return;
    fetch('/get-vpn-config')
        .then(r => r.json())
        .then(data => {
            if (typeof data.config === 'string') {
                ta.value = data.config;
                updateVpnNonPriorityUIFromConfig();
            }
        })
        .catch(err => {
            console.error('Error fetching VPN config:', err);
        });
}

// Delete VPN config file (clear contents after confirmation)
function deleteVpnConfig() {
    const ta = document.getElementById('vpn-config-text');
    const proceed = confirm('Are you sure you want to delete the VPN config? This will clear wg0.conf contents (a backup will be made).');
    if (!proceed) return;
    showPreloader();
    fetch('/delete-vpn-config', { method: 'POST' })
        .then(r => r.json())
        .then(result => {
            hidePreloader();
            if (result.success) {
                if (ta) ta.value = '';
                showNotification('VPN config deleted');
                // Sync non-priority checkbox (will become unchecked on empty config)
                updateVpnNonPriorityUIFromConfig();
            } else {
                showNotification('ERROR: ' + (result.error || 'delete failed'), true);
            }
        })
        .catch(err => {
            hidePreloader();
            showNotification('ERROR: ' + err.message, true);
        });
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

// Toggle Non-priority VPN settings: checked -> apply non-priority; unchecked -> restore priority (original config)
function applyVpnNonPriority(el) {
    const makeNonPriority = !el ? true : !!el.checked;
    const url = makeNonPriority ? '/apply-vpn-non-priority' : '/apply-vpn-priority';
    showPreloader();
    fetch(url, { method: 'POST' })
        .then(r => r.json())
        .then(result => {
            hidePreloader();
            if (result.success) {
                showNotification(makeNonPriority ? 'Applied non-priority VPN settings' : 'Restored priority VPN settings');
                // If VPN service is enabled, it was restarted by backend; refresh status indicator
                loadVpnStatus();
                loadVpnConfig(); // will also sync the non-priority checkbox
            } else {
                showNotification('ERROR: ' + (result.error || 'apply failed'), true);
                // Re-sync UI to actual config
                loadVpnConfig();
            }
        })
        .catch(err => {
            hidePreloader();
            showNotification('ERROR: ' + err.message, true);
            // Re-sync UI to actual config
            loadVpnConfig();
        });
}

// Determine if current config represents non-priority setup
function isConfigNonPriority(text) {
    if (typeof text !== 'string' || !text.trim()) return false;
    // Must have Table = off within [Interface]
    const hasTableOffInInterface = /\[Interface\][\s\S]*?table\s*=\s*off/i.test(text);
    // Must have PersistentKeepAlive = 25 somewhere (backend ensures in each [Peer])
    const hasPersistentKeepAlive = /persistentkeepalive\s*=\s*25/i.test(text);
    return hasTableOffInInterface && hasPersistentKeepAlive;
}

// Sync Non-priority VPN checkbox with current config
function updateVpnNonPriorityUIFromConfig() {
    const ta = document.getElementById('vpn-config-text');
    const cb = document.getElementById('vpn-non-priority');
    if (!cb) return;
    const text = ta ? ta.value : '';
    cb.checked = isConfigNonPriority(text);
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

    let doorPin = null;
    const doorPinInput = document.getElementById('door-sensor-pin-input');
    if (doorPinInput && doorPinInput.value.trim() !== '') {
        doorPin = doorPinInput.value.trim();
        if (isNaN(Number(doorPin)) || Number(doorPin) < 0) {
            hidePreloader();
            showNotification('Please enter a valid Door Sensor Pin (BCM, >= 0)', true);
            return;
        }
    }

    const data = {
        rs_timeout: rsTimeout !== null ? parseInt(rsTimeout) : undefined,
        door_sensor_pin: doorPin !== null ? parseInt(doorPin) : undefined,
    };

    fetch('/save-rs-settings', {
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
                // Sync non-priority checkbox with current textarea content
                updateVpnNonPriorityUIFromConfig();
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
                    // Sync non-priority checkbox with current textarea content
                    updateVpnNonPriorityUIFromConfig();
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
                // Keep mobile radios in sync with desktop radios
                syncWriteModeRadios(selectedMode);
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

// Sync helper between header (desktop) radios and sidebar (mobile) radios
function syncWriteModeRadios(mode) {
    const desktopSelector = `input[name="write_mode"][value="${mode}"]`;
    const mobileSelector = `input[name="write_mode_mobile"][value="${mode}"]`;
    const desktopRadio = document.querySelector(desktopSelector);
    const mobileRadio = document.querySelector(mobileSelector);
    if (desktopRadio) desktopRadio.checked = true;
    if (mobileRadio) mobileRadio.checked = true;
}

// Handler for mobile radios inside the sidebar
function updateWriteModeMobile(el) {
    if (!el) return;
    const mode = el.value;
    // Set the desktop radio to match, then reuse existing save flow
    const desktopRadio = document.querySelector(`input[name="write_mode"][value="${mode}"]`);
    if (desktopRadio) desktopRadio.checked = true;
    updateWriteMode();
}

// IMEI update function
function updateImei() {
    fetch('/get-imei')
        .then(response => response.json())
        .then(data => {
            if (data.imei) {
                const imeiElement = document.querySelector('header p');
                imeiElement.textContent = `IMEI: ${data.imei}`;
                const aboutImeiEl = document.getElementById('about-imei');
                if (aboutImeiEl) {
                    aboutImeiEl.textContent = data.imei;
                }
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
        loadVpnConfig();
    }
    // When showing Sensors settings, sync Reed Switch state and mode
    if (tabId === 'sensors-settings-content') {
        if (typeof loadReedSwitchStatus === 'function') loadReedSwitchStatus();
        if (typeof updateReedSwitchMode === 'function') updateReedSwitchMode();
        if (typeof updateReedSwitchTimeout === 'function') updateReedSwitchTimeout();
        if (typeof updateDoorSensorPin === 'function') updateDoorSensorPin();
    }
}

// Initialize configuration functionality
document.addEventListener('DOMContentLoaded', () => {
    const initialChecked = document.querySelector('input[name="write_mode"]:checked');
    const initialMode = initialChecked ? initialChecked.value : 'video';
    toggleModeSettings(initialMode);
    syncWriteModeRadios(initialMode);
    
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
        loadVpnConfig();
    }
});

// Validate car name input - allow only numbers and uppercase letters
function validateCarname(input) {
    input.value = input.value.replace(/[^A-Z0-9]/g, '');
    
    if (input.value.length > 6) {
        input.value = input.value.substring(0, 6);
    }
} 