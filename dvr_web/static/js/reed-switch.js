// Reed Switch functionality

let reedSwitchSocket = null;
let reedSwitchReconnectTimer = null;
let reedSwitchCountdownInterval = null;

// Reed Switch UI update function
function updateReedSwitchUI(data) {
  const statusIndicator = document.getElementById("reed-status-indicator");
  const statusText = document.getElementById("reed-status-text");
  const lastUpdated = document.getElementById("reed-last-updated");

  console.log(data);

  if ("status" in data) {
    statusIndicator.classList.remove("closed");
    statusIndicator.classList.remove("opened");
    statusIndicator.classList.remove("unknown");

    statusIndicator.classList.add(data.status);
    statusText.textContent = data.status;

    lastUpdated.textContent = getLocalFormattedDateTime();
  }
}

// Reed Switch state functions
function updateReedSwitchTimeout() {
  const rsTimeoutInput = document.getElementById("rs-timeout-input");

  fetch("/reed-switch/get-rs-timeout")
    .then((response) => response.json())
    .then((timeoutData) => {
        rsTimeoutInput.value = timeoutData.timeout;
    }).catch((error) => {
        console.error("Error fetching RS timeout:", error);
    });
}

// Function to update reed switch mode from server
function updateReedSwitchMode() {
  fetch("/reed-switch/get-reed-switch-mode")
    .then((response) => response.json())
    .then((data) => {
      const mechanicalModeRadio = document.getElementById(
        "reed-switch-mode-mechanical",
      );
      const impulseModeRadio = document.getElementById(
        "reed-switch-mode-impulse",
      );

      if (data.impulse === 1) {
        impulseModeRadio.checked = true;
        mechanicalModeRadio.checked = false;
      } else {
        mechanicalModeRadio.checked = true;
        impulseModeRadio.checked = false;
      }
    })
    .catch((error) => console.error("Error fetching reed switch mode:", error));
}

function toggleReedSwitchMode() {
  showPreloader();
  const mode = document.querySelector(
    'input[name="reed_switch_mode"]:checked',
  ).value;
  const impulse = mode === "impulse" ? 1 : 0;

  fetch("/reed-switch/toggle-reed-switch-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ impulse: impulse }),
  })
    .then((response) => response.json())
    .then((result) => {
      hidePreloader();
      if (result.success) {
        showNotification("Reed Switch mode updated successfully!");
      } else {
        showNotification("ERROR: " + result.error, true);
      }
    })
    .catch((error) => {
      hidePreloader();
      showNotification("ERROR: " + error.message, true);
    });
}

function toggleReedSwitch() {
  const initStatus = document.getElementById("reed-init-status");

  showPreloader();

  if (initStatus.textContent === "Initialized") {
    showNotification("First disable sensors checker!", true);
    document.getElementById('reed-switch-off').checked = true;
    hidePreloader();
    return;
  };

  const state = document.querySelector(
    'input[name="reed_switch"]:checked',
  ).value;
  fetch("/reed-switch/toggle-reed-switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reed_switch: state }),
  })
    .then((response) => response.json())
    .then((result) => {
      hidePreloader();
      if (result.success) {
        showNotification("Reed Switch updated successfully!");
        setTimeout(updateReedSwitchTimeout, 500);
      } else {
        showNotification("ERROR: " + result.error, true);
      }
    })
    .catch((error) => {
      hidePreloader();
      showNotification("ERROR: " + error.message, true);
    });
}

function initializeReedSwitch() {
  const initButton = document.getElementById("init-reed-switch-btn");
  const stopButton = document.getElementById("stop-reed-switch-btn");
  const initStatus = document.getElementById("reed-init-status");
  const connectionStatus = document.getElementById("reed-connection-status");
  const autoStopTimer = document.getElementById("auto-stop-timer");

  autoStopTimer.classList.add("hidden");
  initButton.textContent = "Initializing...";
  initButton.disabled = true;
  stopButton.disabled = true;

  connectionStatus.textContent = "Connecting...";
  connectionStatus.classList.remove("connected", "disconnected");

  fetch("/reed-switch/initialize-reed-switch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      initButton.disabled = false;
      stopButton.disabled = false;

      if (data.success) {
        initStatus.textContent = "Initialized";
        initStatus.classList.add("initialized");
        initStatus.classList.remove("not-initialized");
        initButton.textContent = "Re-initialize Reed Switch";

        createReedSwitchWebSocket();

        showNotification("Reed switch initialized successfully!");
      } else {
        initStatus.textContent = "Initialization failed";
        initStatus.classList.add("not-initialized");
        initStatus.classList.remove("initialized");
        initButton.textContent = "Try Again";

        connectionStatus.textContent = "Disconnected";
        connectionStatus.classList.add("disconnected");
        connectionStatus.classList.remove("connected");

        if (data.reed_switch_enabled) {
          showNotification(
            "Error: Please set Reed Switch to OFF in Settings tab before initializing!",
            true,
          );

          const switchTabBtn = document.querySelector(
            ".sidebar button[onclick=\"showTab('video-options')\"]",
          );
          switchTabBtn.classList.add("highlight");
          setTimeout(() => {
            switchTabBtn.classList.remove("highlight");
            setTimeout(() => {
              showSettingsTab("reed-switch-settings-content");
            }, 500);
          }, 3000);
        } else {
          showNotification(
            "Failed to initialize reed switch: " +
              (data.error || "Unknown error"),
            true,
          );
        }
      }
    })
    .catch((error) => {
      console.error("Error initializing reed switch:", error);
      initButton.disabled = false;
      initButton.textContent = "Try Again";
      stopButton.disabled = false;
      initStatus.textContent = "Initialization failed";

      connectionStatus.textContent = "Error";
      connectionStatus.classList.add("disconnected");
      connectionStatus.classList.remove("connected");

      showNotification(
        "Error initializing reed switch: " + error.message,
        true,
      );
    });
}

function stopReedSwitchMonitoring() {
  showPreloader();
  const initButton = document.getElementById("init-reed-switch-btn");
  const stopButton = document.getElementById("stop-reed-switch-btn");
  const initStatus = document.getElementById("reed-init-status");
  const statusIndicator = document.getElementById("reed-status-indicator");
  const statusText = document.getElementById("reed-status-text");
  const connectionStatus = document.getElementById("reed-connection-status");
  const autoStopTimer = document.getElementById("auto-stop-timer");

  autoStopTimer.classList.add("hidden");

  stopButton.textContent = "Stopping...";
  stopButton.disabled = true;
  initButton.disabled = true;

  closeReedSwitchWebSocket();

  connectionStatus.textContent = "Disconnected";
  connectionStatus.classList.add("disconnected");
  connectionStatus.classList.remove("connected");

  fetch("/reed-switch/stop-reed-switch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      hidePreloader();
      stopButton.disabled = false;
      initButton.disabled = false;

      if (data.success) {
        initStatus.textContent = "Not initialized";
        initStatus.classList.add("not-initialized");
        initStatus.classList.remove("initialized");
        initButton.textContent = "Initialize Reed Switch";
        stopButton.textContent = "Stop Monitoring";

        statusIndicator.classList.remove("open", "closed");
        statusText.textContent = "Unavailable (monitoring stopped)";

        showNotification("Reed switch monitoring stopped successfully!");
      } else {
        stopButton.textContent = "Stop Monitoring";
        showNotification(
          "Failed to stop reed switch monitoring: " +
            (data.error || "Unknown error"),
          true,
        );
      }
    })
    .catch((error) => {
      hidePreloader();
      console.error("Error stopping reed switch monitoring:", error);
      stopButton.disabled = false;
      stopButton.textContent = "Stop Monitoring";
      initButton.disabled = false;

      showNotification(
        "Error stopping reed switch monitoring: " + error.message,
        true,
      );
    });
}

function createReedSwitchWebSocket() {
  console.log("Creating new WebSocket connection...");

  reedSwitchSocket = io("/ws", {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    forceNew: true,
  });

  reedSwitchSocket.on("connect", function () {
    console.log("Reed Switch WebSocket connection established");
    const connectionStatus = document.getElementById("reed-connection-status");
    connectionStatus.textContent = "Connected";
    connectionStatus.classList.add("connected");
    connectionStatus.classList.remove("disconnected");
  });

  reedSwitchSocket.on("reed_switch_update", function (data) {
    updateReedSwitchUI(data);
  });

  reedSwitchSocket.on("disconnect", function () {
    console.log("Reed Switch WebSocket connection closed");
    const connectionStatus = document.getElementById("reed-connection-status");
    connectionStatus.textContent = "Disconnected";
    connectionStatus.classList.add("disconnected");
    connectionStatus.classList.remove("connected");
  });

  reedSwitchSocket.on("connect_error", function (error) {
    console.error(`Reed Switch WebSocket connection error: ${error.message}`);
    const connectionStatus = document.getElementById("reed-connection-status");
    connectionStatus.textContent = "Error";
    connectionStatus.classList.add("disconnected");
    connectionStatus.classList.remove("connected");
  });
}

function closeReedSwitchWebSocket() {
  clearTimeout(reedSwitchReconnectTimer);
  reedSwitchReconnectTimer = null;

  reedSwitchSocket.disconnect();
  reedSwitchSocket = null;
}
