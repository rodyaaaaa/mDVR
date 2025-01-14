document.getElementById('saveConfig').addEventListener('click', async () => {
    try {
        // Збираємо дані з форми
        const configData = {
            camera_list: [
                document.getElementById('camera1_url')?.value,
                document.getElementById('camera2_url')?.value,
                document.getElementById('camera3_url')?.value,
                document.getElementById('camera4_url')?.value,
            ].filter(url => url), // Видаляємо порожні URL
            video_options: {
                rtsp_transport: document.getElementById('video_protocol')?.value || 'tcp',
                video_resolution_x: parseInt(document.getElementById('video_resolution_x')?.value) || 720,
                video_resolution_y: parseInt(document.getElementById('video_resolution_y')?.value) || 480,
                time: document.getElementById('video_duration')?.value || '00:00:30',
                fps: parseInt(document.getElementById('video_fps')?.value) || 20,
            },
            ftp: {
                server: document.getElementById('ftp_address')?.value || '',
                user: document.getElementById('ftp_login')?.value || '',
                password: document.getElementById('ftp_password')?.value || '',
                port: parseInt(document.getElementById('ftp_port')?.value) || 21,
            },
            car_name: document.getElementById('car_name')?.value || '',
        };

        // Відправляємо запит на сервер
        const response = await fetch('/save-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(configData),
        });
        console.log(response)
        const messageDiv = document.getElementById('message');

        // Обробка відповіді
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
            messageDiv.textContent = 'Введенна конфігурація успішно збережена!';
            messageDiv.style.color = 'green';
        } else {
            throw new Error(result.error || 'Невідома помилка серверу');
        }
    } catch (error) {
        // Обробка помилок
        const messageDiv = document.getElementById('message');
        messageDiv.textContent = `Помилка збереження: ${error.message}`;
        messageDiv.style.color = 'red';
        console.error('Помилка:', error);
    }
});
