function showTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

let camCounter = 4;

function addCam() {
    camCounter++;
    const camFields = document.getElementById('cam-fields');
    const newCamField = document.createElement('div');
    newCamField.classList.add('cam-field');
    newCamField.innerHTML = `<label>Cam ${camCounter}:</label><input type="text" placeholder="Select RTSP url://">`;
    camFields.appendChild(newCamField);
}

function changeStream(select) {
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.src = `https://example.com/${select.value}.mp4`;
}

function changeLog(select) {
    alert(`You a select: ${select.value}`);
}
