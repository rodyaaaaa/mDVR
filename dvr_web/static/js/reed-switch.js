// Reed Switch functionality

// Global variables for WebSocket connection
let reedSwitchSocket = null;
let reedSwitchReconnectTimer = null;
let reedSwitchCountdownInterval = null;  // Interval for updating time display

// Reed Switch UI update function
function updateReedSwitchUI(data) {
    const statusIndicator = document.getElementById('reed-status-indicator');
    const statusText = document.getElementById('reed-status-text');
    const lastUpdated = document.getElementById('reed-last-updated');
    const initStatus = document.getElementById('reed-init-status');
    const autoStopTimer = document.getElementById('auto-stop-timer');
    const autoStopTime = document.getElementById('auto-stop-time');
    const reedOnRadio = document.getElementById('reed-switch-on');
    const reedOffRadio = document.getElementById('reed-switch-off');
    
    // Block or unblock Reed Switch toggle in Settings
    if (data.hasOwnProperty('initialized')) {
        if (data.initialized) {
            if (reedOnRadio) reedOnRadio.disabled = true;
            if (reedOffRadio) reedOffRadio.disabled = true;
            
            // Update initialization status
            if (initStatus) {
                initStatus.textContent = 'Initialized';
                initStatus.classList.add('initialized');
                initStatus.classList.remove('not-initialized');
            }
        } else {
            if (reedOnRadio) reedOnRadio.disabled = false;
            if (reedOffRadio) reedOffRadio.disabled = false;
            
            // Update initialization status
            if (initStatus) {
                initStatus.textContent = 'Not initialized';
                initStatus.classList.add('not-initialized');
                initStatus.classList.remove('initialized');
            }
        }
    }
    
    console.log("Received update via WebSocket:", data);
    
    // Update reed switch status display
    if (data.hasOwnProperty('status') && statusIndicator && statusText) {
        statusIndicator.classList.remove('closed');
        statusIndicator.classList.remove('opened');
        statusIndicator.classList.remove('unknown');
        
        console.log(`Current reed switch status: ${data.status}, type: ${typeof data.status}`);
        
        if (data.status === 'closed') {
            statusIndicator.classList.add('closed');
            statusText.textContent = 'Closed (Magnet detected)';
        } else if (data.status === 'opened') {
            statusIndicator.classList.add('opened');
            statusText.textContent = 'Opened';
        } else {
            statusIndicator.classList.add('unknown');
            statusText.textContent = `Unknown (${data.status})`;
        }
        
        // Update last update time
        if (data.hasOwnProperty('timestamp') && lastUpdated) {
            const date = new Date(data.timestamp * 1000);
            lastUpdated.textContent = date.toLocaleTimeString();
        }
    }
    
    // Update auto-stop timer
    if (data.hasOwnProperty('autostop') && autoStopTimer && autoStopTime) {
        if (data.autostop && data.hasOwnProperty('seconds_left')) {
            autoStopTimer.style.display = 'block';
            autoStopTime.textContent = formatTime(data.seconds_left);
            
            // If time is up, update initialization status
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

// Reed Switch state functions
function updateReedSwitchState() {
    fetch('/api/get-reed-switch-status')
        .then(response => response.json())
        .then(data => {
            const reedOnRadio = document.getElementById('reed-switch-on');
            const reedOffRadio = document.getElementById('reed-switch-off');
            const rsTimeoutInput = document.getElementById('rs-timeout-input');
            
            if (!reedOnRadio || !reedOffRadio) {
                console.error('Reed switch radio buttons not found');
                return;
            }
            
            if (data.state === "on") {
                reedOnRadio.checked = true;
                
                // Get timeout value regardless of state
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
            } else {
                reedOffRadio.checked = true;
                
                // Still get the timeout value when reed switch is off
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
            
            // Get reed switch mode
            updateReedSwitchMode();
        })
        .catch(error => console.error('Error fetching reed switch status:', error));
}

// Function to update reed switch mode from server
function updateReedSwitchMode() {
    fetch('/api/get-reed-switch-mode')
        .then(response => response.json())
        .then(data => {
            const mechanicalModeRadio = document.getElementById('reed-switch-mode-mechanical');
            const impulseModeRadio = document.getElementById('reed-switch-mode-impulse');
            
            if (!mechanicalModeRadio || !impulseModeRadio) {
                console.error('Reed switch mode radio buttons not found');
                return;
            }
            
            if (data.impulse === 1) {
                impulseModeRadio.checked = true;
                mechanicalModeRadio.checked = false;
            } else {
                mechanicalModeRadio.checked = true;
                impulseModeRadio.checked = false;
            }
        })
        .catch(error => console.error('Error fetching reed switch mode:', error));
}

function toggleReedSwitchMode() {
    showPreloader();
    const mode = document.querySelector('input[name="reed_switch_mode"]:checked').value;
    const impulse = mode === 'impulse' ? 1 : 0;
    
    fetch('/api/toggle-reed-switch-mode', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({impulse: impulse})
    })
    .then(response => response.json())
    .then(result => {
        hidePreloader();
        if(result.success) {
            showNotification('Reed Switch mode updated successfully!');
        } else {
            showNotification('ERROR: ' + result.error, true);
        }
    })
    .catch(error => {
        hidePreloader();
        showNotification('ERROR: ' + error.message, true);
    });
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
              // Update state after successful toggle
              setTimeout(updateReedSwitchState, 500);
         } else {
              showNotification('ERROR: ' + result.error, true);
         }
    })
    .catch(error => {
         hidePreloader();
         showNotification('ERROR: ' + error.message, true);
    });
}

// Reed Switch initialization functions
function initializeReedSwitch() {
    const initButton = document.getElementById('init-reed-switch-btn');
    const stopButton = document.getElementById('stop-reed-switch-btn');
    const initStatus = document.getElementById('reed-init-status');
    const connectionStatus = document.getElementById('reed-connection-status');
    const autoStopTimer = document.getElementById('auto-stop-timer');
    
    // Hide timer before initialization
    if (autoStopTimer) autoStopTimer.classList.add('hidden');
    
    // Change button text and disable during initialization
    if (initButton) {
        initButton.textContent = 'Initializing...';
        initButton.disabled = true;
    }
    if (stopButton) stopButton.disabled = true;
    
    // Close existing connection if any
    closeReedSwitchWebSocket();
    
    // Show "Connecting..." status
    if (connectionStatus) {
        connectionStatus.textContent = 'Connecting...';
        connectionStatus.classList.remove('connected', 'disconnected');
    }
    
    // Make POST request to server to initialize reed switch
    fetch('/api/initialize-reed-switch', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (initButton) initButton.disabled = false;
        if (stopButton) stopButton.disabled = false;
        
        if (data.success) {
            if (initStatus) {
                initStatus.textContent = 'Initialized';
                initStatus.classList.add('initialized');
                initStatus.classList.remove('not-initialized');
            }
            if (initButton) initButton.textContent = 'Re-initialize Reed Switch';
            
            // Update reed switch status display
            if (data.status) {
                // Add auto-stop information
                const statusData = {
                    status: data.status,
                    timestamp: Math.floor(Date.now() / 1000),
                    initialized: true,
                    autostop: data.autostop || false,
                    seconds_left: data.seconds_left || 0
                };
                
                updateReedSwitchUI(statusData);
            }
            
            // Create new WebSocket connection
            createReedSwitchWebSocket();
            
            showNotification('Reed switch initialized successfully!');
        } else {
            if (initStatus) {
                initStatus.textContent = 'Initialization failed';
                initStatus.classList.add('not-initialized');
                initStatus.classList.remove('initialized');
            }
            if (initButton) initButton.textContent = 'Try Again';
            
            // Update connection status
            if (connectionStatus) {
                connectionStatus.textContent = 'Disconnected';
                connectionStatus.classList.add('disconnected');
                connectionStatus.classList.remove('connected');
            }
            
            // Check if error is related to Reed Switch toggle
            if (data.reed_switch_enabled) {
                // Show special message with instruction
                showNotification('Error: Please set Reed Switch to OFF in Settings tab before initializing!', true);
                
                // Add hint for user so they know what to do
                const switchTabBtn = document.querySelector('.sidebar button[onclick="showTab(\'video-options\')"]');
                if (switchTabBtn) {
                    switchTabBtn.classList.add('highlight');
                    setTimeout(() => {
                        switchTabBtn.classList.remove('highlight');
                        // After highlighting the button, show the Reed Switch tab
                        setTimeout(() => {
                            showSettingsTab('reed-switch-settings-content');
                        }, 500);
                    }, 3000);
                }
            } else {
                showNotification('Failed to initialize reed switch: ' + (data.error || 'Unknown error'), true);
            }
        }
    })
    .catch(error => {
        console.error('Error initializing reed switch:', error);
        if (initButton) {
            initButton.disabled = false;
            initButton.textContent = 'Try Again';
        }
        if (stopButton) stopButton.disabled = false;
        if (initStatus) initStatus.textContent = 'Initialization failed';
        
        // Update connection status
        if (connectionStatus) {
            connectionStatus.textContent = 'Error';
            connectionStatus.classList.add('disconnected');
            connectionStatus.classList.remove('connected');
        }
        
        showNotification('Error initializing reed switch: ' + error.message, true);
    });
}

function stopReedSwitchMonitoring() {
    const initButton = document.getElementById('init-reed-switch-btn');
    const stopButton = document.getElementById('stop-reed-switch-btn');
    const initStatus = document.getElementById('reed-init-status');
    const statusIndicator = document.getElementById('reed-status-indicator');
    const statusText = document.getElementById('reed-status-text');
    const connectionStatus = document.getElementById('reed-connection-status');
    const autoStopTimer = document.getElementById('auto-stop-timer');
    
    // Hide timer
    if (autoStopTimer) autoStopTimer.classList.add('hidden');
    
    // Change button text and disable during stopping
    if (stopButton) {
        stopButton.textContent = 'Stopping...';
        stopButton.disabled = true;
    }
    if (initButton) initButton.disabled = true;
    
    // Close WebSocket connection before sending request
    closeReedSwitchWebSocket();
    
    // Update connection status to Disconnected
    if (connectionStatus) {
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.classList.add('disconnected');
        connectionStatus.classList.remove('connected');
    }
    
    // Make POST request to server to stop reed switch monitoring
    fetch('/api/stop-reed-switch', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (stopButton) stopButton.disabled = false;
        if (initButton) initButton.disabled = false;
        
        if (data.success) {
            if (initStatus) {
                initStatus.textContent = 'Not initialized';
                initStatus.classList.add('not-initialized');
                initStatus.classList.remove('initialized');
            }
            if (initButton) initButton.textContent = 'Initialize Reed Switch';
            if (stopButton) stopButton.textContent = 'Stop Monitoring';
            
            // Update reed switch status display
            if (statusIndicator) statusIndicator.classList.remove('open', 'closed');
            if (statusText) statusText.textContent = 'Unavailable (monitoring stopped)';
            
            showNotification('Reed switch monitoring stopped successfully!');
        } else {
            if (stopButton) stopButton.textContent = 'Stop Monitoring';
            showNotification('Failed to stop reed switch monitoring: ' + (data.error || 'Unknown error'), true);
        }
    })
    .catch(error => {
        console.error('Error stopping reed switch monitoring:', error);
        if (stopButton) {
            stopButton.disabled = false;
            stopButton.textContent = 'Stop Monitoring';
        }
        if (initButton) initButton.disabled = false;
        
        showNotification('Error stopping reed switch monitoring: ' + error.message, true);
    });
}

// Reed Switch WebSocket functions
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

function createReedSwitchWebSocket() {
    // Close previous connection if it exists
    closeReedSwitchWebSocket();
    
    console.log("Creating new WebSocket connection...");
    
    // Create new connection
    reedSwitchSocket = io('/ws', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        forceNew: true
    });
    
    reedSwitchSocket.on('connect', function() {
        console.log("Reed Switch WebSocket connection established");
        const connectionStatus = document.getElementById('reed-connection-status');
        if (connectionStatus) {
            connectionStatus.textContent = 'Connected';
            connectionStatus.classList.add('connected');
            connectionStatus.classList.remove('disconnected');
        }
        
        // Send request for initial state
        reedSwitchSocket.emit('get_status');
        console.log("Sent get_status request");
    });
    
    reedSwitchSocket.on('connection_established', function(data) {
        console.log("Received connection establishment confirmation:", data);
    });
    
    reedSwitchSocket.on('reed_switch_update', function(data) {
        console.log("Received reed_switch_update:", data);
        updateReedSwitchUI(data);
    });
    
    reedSwitchSocket.on('disconnect', function() {
        console.log('Reed Switch WebSocket connection closed');
        const connectionStatus = document.getElementById('reed-connection-status');
        if (connectionStatus) {
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.classList.add('disconnected');
            connectionStatus.classList.remove('connected');
        }
        
        // Try to reconnect after 2 seconds
        reedSwitchReconnectTimer = setTimeout(() => {
            console.log("Attempting to reconnect WebSocket...");
            createReedSwitchWebSocket();
        }, 2000);
    });
    
    reedSwitchSocket.on('connect_error', function(error) {
        console.error(`Reed Switch WebSocket connection error: ${error.message}`);
        const connectionStatus = document.getElementById('reed-connection-status');
        if (connectionStatus) {
            connectionStatus.textContent = 'Error';
            connectionStatus.classList.add('disconnected');
            connectionStatus.classList.remove('connected');
        }
    });
}

function initReedSwitchWebSocket() {
    if (reedSwitchSocket && reedSwitchSocket.connected) {
        return; // Connection is already active
    }
    
    closeReedSwitchWebSocket(); // Close previous connection if it exists
    
    // First check reed switch initialization status
    fetch('/api/reed-switch-status')
        .then(response => response.json())
        .then(data => {
            updateReedSwitchUI(data);
            
            // Connect via WebSocket only if reed switch is initialized
            if (data.initialized) {
                createReedSwitchWebSocket();
            } else {
                // If reed switch is not initialized, set connection status as disconnected
                const connectionStatus = document.getElementById('reed-connection-status');
                if (connectionStatus) {
                    connectionStatus.textContent = 'Disconnected';
                    connectionStatus.classList.add('disconnected');
                    connectionStatus.classList.remove('connected');
                }
            }
        })
        .catch(error => {
            console.error('Error checking reed switch status:', error);
            // On error, also show disconnected status
            const connectionStatus = document.getElementById('reed-connection-status');
            if (connectionStatus) {
                connectionStatus.textContent = 'Error';
                connectionStatus.classList.add('disconnected');
                connectionStatus.classList.remove('connected');
            }
        });
}

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
            console.log("Force sync successful:", data.state);
        } else {
            console.error("Force sync error:", data.error);
        }
    })
    .catch(error => {
        console.error("Error during force sync:", error);
    });
}

function setupReedSwitchPolling() {
    // Create timer for backup polling every 2 seconds
    const pollingInterval = 2000; // 2 seconds
    
    // Function to perform polling
    function pollReedSwitchStatus() {
        // Check if we're currently on Home tab or Reed Switch settings tab
        const homeTab = document.getElementById('home');
        const settingsTab = document.getElementById('video-options');
        const reedSwitchSettingsContent = document.getElementById('reed-switch-settings-content');
        
        if (!homeTab || !settingsTab || !reedSwitchSettingsContent) return;
        
        const homeTabActive = homeTab.classList.contains('active');
        const settingsTabActive = settingsTab.classList.contains('active');
        const reedSwitchSettingsActive = reedSwitchSettingsContent.classList.contains('active');
        
        // Only poll if we're on the home tab or reed switch settings is active
        if (!homeTabActive && !(settingsTabActive && reedSwitchSettingsActive)) {
            return;
        }
        
        // Send request to server
        fetch('/api/reed-switch-status')
            .then(response => response.json())
            .then(data => {
                console.log('Received data via HTTP polling:', data);
                updateReedSwitchUI(data);
                
                // Every fourth poll, do a force sync
                if (Math.random() < 0.25) {
                    forceSyncReedSwitch();
                }
            })
            .catch(error => {
                console.error('Error getting reed switch status via HTTP:', error);
            });
    }
    
    // Start polling with specified interval
    return setInterval(pollReedSwitchStatus, pollingInterval);
}

// Initialization function that runs when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('Reed Switch JS loaded');
    
    // Initialize WebSocket for reed switch after page load
    initReedSwitchWebSocket();
    
    // Start backup polling of reed switch status
    const reedSwitchPollingInterval = setupReedSwitchPolling();
    
    // Add handler to stop polling when page is closed
    window.addEventListener('beforeunload', () => {
        clearInterval(reedSwitchPollingInterval);
    });
    
    // Initialize reed switch state
    updateReedSwitchState();
    
    // Initialize reed switch mode
    updateReedSwitchMode();
    
    // When clicking on settings tab, also update Reed Switch state
    const videoOptionsBtn = document.querySelector('.sidebar button[onclick="showTab(\'video-options\')"]');
    if (videoOptionsBtn) {
        videoOptionsBtn.addEventListener('click', () => {
            updateReedSwitchState();
            updateReedSwitchMode();
        });
    }
    
    // When clicking on Reed Switch settings tab, force sync
    const reedSwitchSettingsBtn = document.querySelector('#reed-switch-tab');
    if (reedSwitchSettingsBtn) {
        reedSwitchSettingsBtn.addEventListener('click', () => {
            forceSyncReedSwitch();
            updateReedSwitchMode();
        });
    }
    
    // Check if reed switch is already initialized
    checkReedSwitchInitialized();
}); 