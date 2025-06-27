// Core utility functions

// Preloader functions
function showPreloader() {
    document.getElementById('preloader').classList.add('active');
}

function hidePreloader() {
    document.getElementById('preloader').classList.remove('active');
}

// Modal functions
function openModal() {
    document.getElementById('addCamModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('addCamModal').style.display = 'none';
}

// Notification function
function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Log selection function
function changeLog(select) {
    showNotification(`You a select: ${select.value}`);
}

// Tab switching function
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
    
    // Initialize WebSocket connection when switching to Reed Switch tab
    if (tabId === 'reed-switch') {
        initReedSwitchWebSocket();
        // Force sync when switching to the tab
        forceSyncReedSwitch();
    } else if (tabId === 'home') {
        // Reed switch indicator is also on the home page
        initReedSwitchWebSocket();
        // Force sync when switching to the tab
        forceSyncReedSwitch();
    } else {
        // Close WebSocket connection when switching to another tab
        closeReedSwitchWebSocket();
        
        // Restore Reed Switch radio buttons state when switching to settings tab
        if (tabId === 'video-options') {
            updateReedSwitchState();
        }
    }

    // EXT5V_V live logic: stop updates only if not on home page
    if (tabId !== 'home') {
        stopExt5vVUpdates();
    }
}

// Format helpers
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatGB(bytes) {
    return (bytes / (1024 ** 3)).toFixed(2) + ' GB';
}

// Input validation
function validateCarname(input) {
    input.value = input.value.replace(/[^a-zA-Z0-9]/g, '');
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Setup modal close button
    const closeBtn = document.querySelector('.close');
    closeBtn.addEventListener('click', closeModal);
    
    // Setup modal background click to close
    window.addEventListener('click', (event) => {
        if (event.target === document.getElementById('addCamModal')) {
            closeModal();
        }
    });
    
    // Set active tab on load
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

// Clean up before page unload
window.addEventListener('beforeunload', () => {
    stopExt5vVUpdates();
    closeReedSwitchWebSocket();
}); 