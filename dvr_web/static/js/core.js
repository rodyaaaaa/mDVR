// Core utility functions

// Preloader functions
function showPreloader() {
  document.getElementById("preloader").classList.add("active");
}

function hidePreloader() {
  document.getElementById("preloader").classList.remove("active");
}

// Modal functions
function openModal() {
  document.getElementById("addCamModal").style.display = "block";
}

function closeModal() {
  document.getElementById("addCamModal").style.display = "none";
}

// Notification function
function showNotification(message, isError = false) {
  const notification = document.createElement("div");
  notification.className = `notification ${isError ? "error" : "success"}`;
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

// Settings subtab switching function
function showSettingsTab(contentId) {
  // Get the currently active settings tab
  const currentContent = document.querySelector(".settings-content.active");
  const newContent = document.getElementById(contentId);

  if (currentContent && currentContent !== newContent) {
    // Apply exit animation to current content
    currentContent.style.animation = "fadeOutDown 0.2s ease-out forwards";

    // Wait for exit animation to finish before showing new content
    setTimeout(() => {
      // Hide all settings content
      document.querySelectorAll(".settings-content").forEach((content) => {
        content.classList.remove("active");
        content.style.animation = "";
      });

      // Show new content with entry animation
      newContent.classList.add("active");

      // Update tab button states
      document.querySelectorAll(".settings-tab").forEach((tab) => {
        tab.classList.remove("active");
      });

      // Find and activate the correct tab button based on content ID
      const tabButtonMap = {
        "general-settings-content": "general-settings-tab",
        "reed-switch-settings-content": "reed-switch-tab",
        "ftp-settings-content": "ftp-settings-tab",
        "vpn-settings-content": "vpn-settings-tab",
      };

      const tabId = tabButtonMap[contentId];
      if (tabId) {
        document.getElementById(tabId).classList.add("active");
      }
    }, 180);
  } else {
    // No current active content or same content clicked
    // Hide all settings content
    document.querySelectorAll(".settings-content").forEach((content) => {
      content.classList.remove("active");
    });

    // Show selected content
    newContent.classList.add("active");

    // Update tab button states
    document.querySelectorAll(".settings-tab").forEach((tab) => {
      tab.classList.remove("active");
    });

    // Find and activate the correct tab button based on content ID
    const tabButtonMap = {
      "general-settings-content": "general-settings-tab",
      "reed-switch-settings-content": "reed-switch-tab",
      "ftp-settings-content": "ftp-settings-tab",
      "vpn-settings-content": "vpn-settings-tab",
    };

    const tabId = tabButtonMap[contentId];
    if (tabId) {
      document.getElementById(tabId).classList.add("active");
    }
  }
}

// Format helpers
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatGB(bytes) {
  return (bytes / 1024 ** 3).toFixed(2) + " GB";
}

// Input validation
function validateCarname(input) {
  input.value = input.value.replace(/[^a-zA-Z0-9]/g, "");
}

// Function to optimize dashboard grid layout
function optimizeDashboardLayout() {
  const gridContainer = document.getElementById("dashboard-grid");
  if (!gridContainer) return;

  // Force refresh grid layout to ensure proper positioning
  gridContainer.classList.add("refresh-grid");
  setTimeout(() => {
    gridContainer.classList.remove("refresh-grid");
  }, 100);

  // Ensure temperature card has proper height
  const temperatureCard = document.getElementById("temperature-card");
  if (temperatureCard) {
    const tempContent = temperatureCard.querySelector(".card-content");
    if (tempContent) {
      // Reset explicit height if it's taking too much space
      if (
        tempContent.offsetHeight > 200 &&
        !temperatureCard.classList.contains("custom-height")
      ) {
        tempContent.style.height = "auto";
      }
    }
  }

  // Ensure EXT5V_V card has proper height
  const ext5vCard = document.getElementById("system-info-card");
  if (ext5vCard) {
    const ext5vContent = ext5vCard.querySelector(".card-content");
    if (ext5vContent) {
      // Keep height minimal for this card
      if (!ext5vCard.classList.contains("custom-height")) {
        ext5vContent.style.height = "auto";
      }
    }
  }

  // Ensure all cards have appropriate positioning in the grid
  const cards = Array.from(gridContainer.querySelectorAll(".grid-item"));
  cards.forEach((card) => {
    // Make sure the cards have the correct size classes applied
    if (
      !card.classList.contains("size-1x1") &&
      !card.classList.contains("size-1x2") &&
      !card.classList.contains("size-2x1") &&
      !card.classList.contains("size-2x2")
    ) {
      // Default to small size if no size class is present
      card.classList.add("size-1x1");
    }
  });
}

// Initialize event listeners
document.addEventListener("DOMContentLoaded", () => {
  // Setup modal close button
  const closeBtn = document.querySelector(".close");
  closeBtn.addEventListener("click", closeModal);

  // Setup modal background click to close
  window.addEventListener("click", (event) => {
    if (event.target === document.getElementById("addCamModal")) {
      closeModal();
    }
  });

  // Set active tab on load
  let activeTab = document.querySelector(".tab.active");
  if (!activeTab) {
    activeTab = document.getElementById("home");
    if (activeTab) activeTab.classList.add("active");
  }
  if (activeTab) {
    const tabId = activeTab.id;
    const activeButton = document.querySelector(
      `.sidebar button[onclick="showTab('${tabId}')"]`,
    );
    if (activeButton) activeButton.classList.add("active");
  }

  // Call when page loads
  setTimeout(optimizeDashboardLayout, 500);

  // Call when switching to home tab
  const homeButton = document.querySelector(
    ".sidebar button[onclick=\"showTab('home')\"]",
  );
  if (homeButton) {
    const originalClick = homeButton.onclick;
    homeButton.onclick = function () {
      if (originalClick) originalClick.call(this);
      setTimeout(optimizeDashboardLayout, 300);
    };
  }
});

// Clean up before page unload
window.addEventListener("beforeunload", () => {
  stopExt5vVUpdates();
  closeReedSwitchWebSocket();
});
