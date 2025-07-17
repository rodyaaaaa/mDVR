// Reed Switch functionality

let reedSwitchSocket = null;
let reedSwitchReconnectTimer = null;
let reedSwitchCountdownInterval = null;

// Reed Switch UI update function
function updateReedSwitchUI(data) {
  const statusIndicator = document.getElementById("reed-status-indicator");
  const statusText = document.getElementById("reed-status-text");
  const lastUpdated = document.getElementById("reed-last-updated");
  const initStatus = document.getElementById("reed-init-status");
  const autoStopTimer = document.getElementById("auto-stop-timer");
  const autoStopTime = document.getElementById("auto-stop-time");
  const reedOnRadio = document.getElementById("reed-switch-on");
  const reedOffRadio = document.getElementById("reed-switch-off");
  const stopButton = document.getElementById("stop-reed-switch-btn");

  statusIndicator.classList.remove("closed");
  statusIndicator.classList.remove("opened");
  statusIndicator.classList.remove("unknown");

  if (data.initialized) {
    reedOnRadio.disabled = true;
    reedOffRadio.disabled = true;

    initStatus.textContent = "Initialized";
    initStatus.classList.add("initialized");
    initStatus.classList.remove("not-initialized");

    if (data.status === "closed") {
      statusIndicator.classList.add("closed");
      statusText.textContent = "Closed (Magnet detected)";
    } else if (data.status === "opened") {
      statusIndicator.classList.add("opened");
      statusText.textContent = "Opened";
    } else {
      statusIndicator.classList.add("unknown");
      statusText.textContent = `Unknown (${data.status})`;
    }

    const date = new Date(data.timestamp * 1000);
    lastUpdated.textContent = date.toLocaleTimeString();

    if (data.autostop) {
      autoStopTimer.style.display = "block";
      autoStopTime.textContent = formatTime(data.seconds_left);

      if (data.seconds_left <= 0 && initStatus) {
        initStatus.textContent = "Not initialized";
        initStatus.classList.add("not-initialized");
        initStatus.classList.remove("initialized");
      }
    } else {
      autoStopTimer.style.display = "none";
    }
  } else {
    reedOnRadio.disabled = false;
    reedOffRadio.disabled = false;

    initStatus.textContent = "Not initialized";
    initStatus.classList.add("not-initialized");
    initStatus.classList.remove("initialized");

    statusIndicator.classList.add("unknown");
    statusText.textContent = `Unknown (Not initialized)`;
    stopButton.textContent = "Stop Monitoring";

    const date = new Date(data.timestamp * 1000);
    lastUpdated.textContent = date.toLocaleTimeString();
    autoStopTimer.style.display = "none";
  }
}

// Reed Switch state functions
function updateReedSwitchState() {
  fetch("/reed-switch/get-reed-switch-status")
    .then((response) => response.json())
    .then((data) => {
      const reedOnRadio = document.getElementById("reed-switch-on");
      const reedOffRadio = document.getElementById("reed-switch-off");
      const rsTimeoutInput = document.getElementById("rs-timeout-input");

      if (!reedOnRadio || !reedOffRadio) {
        console.error("Reed switch radio buttons not found");
        return;
      }

      if (data.state === "on") {
        reedOnRadio.checked = true;
      } else {
        reedOnRadio.checked = false;
      }

      if (rsTimeoutInput) {
        fetch("/reed-switch/get-rs-timeout")
          .then((response) => response.json())
          .then((timeoutData) => {
            if (timeoutData && typeof timeoutData.timeout !== "undefined") {
              rsTimeoutInput.value = timeoutData.timeout;
            } else {
              rsTimeoutInput.value = "0";
            }
          })
          .catch((error) => {
            console.error("Error fetching RS timeout:", error);
            rsTimeoutInput.value = "0";
          });
      }

      updateReedSwitchMode();
    })
    .catch((error) =>
      console.error("Error fetching reed switch status:", error),
    );
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

      if (!mechanicalModeRadio || !impulseModeRadio) {
        console.error("Reed switch mode radio buttons not found");
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
  showPreloader();
  const state = document.querySelector(
    'input[name="reed_switch"]:checked',
  ).value;
  fetch("/api/toggle-reed-switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reed_switch: state }),
  })
    .then((response) => response.json())
    .then((result) => {
      hidePreloader();
      if (result.success) {
        showNotification("Reed Switch updated successfully!");
        setTimeout(updateReedSwitchState, 500);
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

  if (autoStopTimer) autoStopTimer.classList.add("hidden");

  if (initButton) {
    initButton.textContent = "Initializing...";
    initButton.disabled = true;
  }
  if (stopButton) stopButton.disabled = true;

  closeReedSwitchWebSocket();

  if (connectionStatus) {
    connectionStatus.textContent = "Connecting...";
    connectionStatus.classList.remove("connected", "disconnected");
  }

  fetch("/reed-switch/initialize-reed-switch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (initButton) initButton.disabled = false;
      if (stopButton) stopButton.disabled = false;

      if (data.success) {
        if (initStatus) {
          initStatus.textContent = "Initialized";
          initStatus.classList.add("initialized");
          initStatus.classList.remove("not-initialized");
        }
        if (initButton) initButton.textContent = "Re-initialize Reed Switch";

        if (data.status) {
          const statusData = {
            status: data.status,
            timestamp: Math.floor(Date.now() / 1000),
            initialized: true,
            autostop: data.autostop || false,
            seconds_left: data.seconds_left || 0,
          };

          updateReedSwitchUI(statusData);
        }

        createReedSwitchWebSocket();

        showNotification("Reed switch initialized successfully!");
      } else {
        if (initStatus) {
          initStatus.textContent = "Initialization failed";
          initStatus.classList.add("not-initialized");
          initStatus.classList.remove("initialized");
        }
        if (initButton) initButton.textContent = "Try Again";

        if (connectionStatus) {
          connectionStatus.textContent = "Disconnected";
          connectionStatus.classList.add("disconnected");
          connectionStatus.classList.remove("connected");
        }

        if (data.reed_switch_enabled) {
          showNotification(
            "Error: Please set Reed Switch to OFF in Settings tab before initializing!",
            true,
          );

          const switchTabBtn = document.querySelector(
            ".sidebar button[onclick=\"showTab('video-options')\"]",
          );
          if (switchTabBtn) {
            switchTabBtn.classList.add("highlight");
            setTimeout(() => {
              switchTabBtn.classList.remove("highlight");
              setTimeout(() => {
                showSettingsTab("reed-switch-settings-content");
              }, 500);
            }, 3000);
          }
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
      if (initButton) {
        initButton.disabled = false;
        initButton.textContent = "Try Again";
      }
      if (stopButton) stopButton.disabled = false;
      if (initStatus) initStatus.textContent = "Initialization failed";

      if (connectionStatus) {
        connectionStatus.textContent = "Error";
        connectionStatus.classList.add("disconnected");
        connectionStatus.classList.remove("connected");
      }

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

  if (autoStopTimer) autoStopTimer.classList.add("hidden");

  if (stopButton) {
    stopButton.textContent = "Stopping...";
    stopButton.disabled = true;
  }
  if (initButton) initButton.disabled = true;

  closeReedSwitchWebSocket();

  if (connectionStatus) {
    connectionStatus.textContent = "Disconnected";
    connectionStatus.classList.add("disconnected");
    connectionStatus.classList.remove("connected");
  }

  fetch("/reed-switch/stop-reed-switch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      hidePreloader();
      const statusData = {
        status: data.success,
        timestamp: Math.floor(Date.now() / 1000),
        initialized: false,
      };

      updateReedSwitchUI(statusData);
      // if (stopButton) stopButton.disabled = false;
      // if (initButton) initButton.disabled = false;

      // if (data.success) {
      //   if (initStatus) {
      //     initStatus.textContent = "Not initialized";
      //     initStatus.classList.add("not-initialized");
      //     initStatus.classList.remove("initialized");
      //   }
      //   if (initButton) initButton.textContent = "Initialize Reed Switch";
      //   if (stopButton) stopButton.textContent = "Stop Monitoring";

      //   if (statusIndicator) statusIndicator.classList.remove("open", "closed");
      //   if (statusText)
      //     statusText.textContent = "Unavailable (monitoring stopped)";

      //   showNotification("Reed switch monitoring stopped successfully!");
      // } else {
      //   if (stopButton) stopButton.textContent = "Stop Monitoring";
      //   showNotification(
      //     "Failed to stop reed switch monitoring: " +
      //       (data.error || "Unknown error"),
      //     true,
      //   );
      // }
    })
    .catch((error) => {
      hidePreloader();
      console.error("Error stopping reed switch monitoring:", error);
      if (stopButton) {
        stopButton.disabled = false;
        stopButton.textContent = "Stop Monitoring";
      }
      if (initButton) initButton.disabled = false;

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
    if (connectionStatus) {
      connectionStatus.textContent = "Connected";
      connectionStatus.classList.add("connected");
      connectionStatus.classList.remove("disconnected");
    }

    reedSwitchSocket.emit("get_status");
  });

  reedSwitchSocket.on("reed_switch_update", function (data) {
    updateReedSwitchUI(data);
  });

  reedSwitchSocket.on("disconnect", function () {
    console.log("Reed Switch WebSocket connection closed");
    const connectionStatus = document.getElementById("reed-connection-status");
    if (connectionStatus) {
      connectionStatus.textContent = "Disconnected";
      connectionStatus.classList.add("disconnected");
      connectionStatus.classList.remove("connected");
    }

    reedSwitchReconnectTimer = setTimeout(() => {
      console.log("Attempting to reconnect WebSocket...");
      createReedSwitchWebSocket();
    }, 2000);
  });

  reedSwitchSocket.on("connect_error", function (error) {
    console.error(`Reed Switch WebSocket connection error: ${error.message}`);
    const connectionStatus = document.getElementById("reed-connection-status");
    if (connectionStatus) {
      connectionStatus.textContent = "Error";
      connectionStatus.classList.add("disconnected");
      connectionStatus.classList.remove("connected");
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
