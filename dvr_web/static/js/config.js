// Configuration functionality

// Video options functions
function saveVideoOptions() {
    showPreloader();
    const resolution = document.getElementById('rtsp-resolution').value.split('x');
    const transport = document.getElementById('rtsp-transport').value;
    const duration = document.getElementById('video-duration').value;
    const fps = document.getElementById('video-fps').value;
    const folderSize = document.getElementById('size-folder-limit-gb').value;
    const photoTimeout = document.getElementById('photo-timeout').value;
    
    // Get RS Timeout value if block is visible
    let rsTimeout = null;
    const rsTimeoutBlock = document.getElementById('rs-timeout-block');
    if (rsTimeoutBlock && rsTimeoutBlock.style.display !== 'none') {
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
    
    // Add RS Timeout value if it exists
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

// FTP config functions
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

// VPN config functions
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

// Initialize configuration functionality
document.addEventListener('DOMContentLoaded', () => {
    // Initialize write mode settings
    const initialMode = document.querySelector('input[name="write_mode"]:checked').value;
    toggleModeSettings(initialMode);
    
    // Update IMEI on page load
    updateImei();
    
    // Update IMEI every 10 seconds
    setInterval(updateImei, 10000);
}); 