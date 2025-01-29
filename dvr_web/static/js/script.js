function showTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

let camCounter = document.querySelectorAll('#cam-fields .cam-field').length;

function deleteCam(button) {
    const camField = button.closest('.cam-field');
    camField.remove();
    updateCamLabels(); // Обновить нумерацию после удаления
}

function updateCamLabels() {
    const camFields = document.querySelectorAll('#cam-fields .cam-field');
    camFields.forEach((field, index) => {
        field.querySelector('label').textContent = `Cam ${index + 1}:`;
    });
    camCounter = camFields.length; // Обновить счетчик
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
    updateCamLabels(); // Обновить нумерацию
}

function changeStream(select) {
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.src = `https://example.com/${select.value}.mp4`;
}

function changeLog(select) {
    alert(`You a select: ${select.value}`);
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
            alert('Video links saved successfully!');
        } else {
            alert(`Error: ${result.error}`);
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
        url: inputs[0].value,
        port: inputs[1].value,
        login: inputs[2].value,
        password: inputs[3].value,
    };

    const carName = inputs[4].value; // Окремо збираємо car_name

    const data = {
        ftp: ftpConfig, // FTP-налаштування
        car_name: carName, // Окреме поле car_name
    };

    fetch('/save-ftp-config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            alert('FTP configuration and car name saved successfully!');
        } else {
            alert(`Error: ${result.error}`);
        }
    })
    .catch(error => {
        console.error('Error saving FTP configuration:', error);
    });
}

function saveVideoOptions() {
    const rtspTransport = document.getElementById('rtsp-transport').value;
    const videoResolution = document.getElementById('video-resolution').value;
    const [videoResolutionX, videoResolutionY] = videoResolution.split('x');
    const videoTimeInput = document.getElementById('video-time').value;
    const videoFps = document.getElementById('video-fps').value;

    // Перевіряємо, чи введено число (хвилини)
    let videoTime;
    if (!isNaN(videoTimeInput) && videoTimeInput.trim() !== "") {
        // Якщо введено число, конвертуємо у формат HH:MM:SS
        const minutes = parseInt(videoTimeInput);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        videoTime = `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}:00`;
    } else {
        // Якщо введено не число, залишаємо як є (формат HH:MM:SS)
        videoTime = videoTimeInput;
    }

    const videoOptions = {
        rtsp_transport: rtspTransport,
        video_resolution_x: parseInt(videoResolutionX),
        video_resolution_y: parseInt(videoResolutionY),
        time: videoTime,
        fps: parseInt(videoFps)
    };

    const data = {
        video_options: videoOptions
    };

    fetch('/save-video-options', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            alert('Video options saved successfully!');
        } else {
            alert(`Error: ${result.error}`);
        }
    })
    .catch(error => {
        console.error('Error saving video options:', error);
    });
}

function saveVpnConfig() {
    const vpnConfig = document.querySelector('#vpn-config textarea').value;

    fetch('/save-vpn-config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vpn_config: vpnConfig }),
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            alert('VPN config saved successfully!');
        } else {
            alert(`Error: ${result.error}`);
        }
    })
    .catch(error => {
        console.error('Error saving VPN config:', error);
    });
}
