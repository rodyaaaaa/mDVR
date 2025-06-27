// Camera management functionality

let cameraPorts = {};
let camCounter = document.querySelectorAll('#cam-fields .cam-field').length;

// Camera port and view functions
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

// Camera management functions
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
        <button class="edit-cam" onclick="enableEdit(this)">Edit</button>
        <button class="view-cam" onclick="viewCamera(this)">View</button>
        <button class="delete-cam" onclick="deleteCam(this)">×</button>
    `;
    camFields.appendChild(newCamField);
    updateCamLabels();
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

// Stream change function
function changeStream(select) {
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.src = `https://example.com/${select.value}.mp4`;
}

// Initialize camera functionality
document.addEventListener('DOMContentLoaded', () => {
    // Setup Add Camera button
    const addCamBtn = document.querySelector('.cam-config-header button');
    if (addCamBtn) {
        addCamBtn.addEventListener('click', openModal);
    }
    
    // Update camera ports on page load
    updateCameraPorts();
}); 