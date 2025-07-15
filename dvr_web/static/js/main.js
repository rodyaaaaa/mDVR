// Main JavaScript file that imports all modules

// Function to show different tabs
function showTab(tabId) {
  if (
    typeof startMonitoring === "function" &&
    typeof stopMonitoring === "function"
  ) {
    if (tabId === "home") {
      startMonitoring();
    } else {
      stopMonitoring();
    }
  }

  // Hide all tabs
  const allTabs = document.querySelectorAll(".tab");
  allTabs.forEach((tab) => {
    tab.classList.remove("active");
  });

  // Show selected tab
  const selectedTab = document.getElementById(tabId);
  if (selectedTab) {
    selectedTab.classList.add("active");
  }

  // Toggle active state for sidebar buttons
  const sidebarButtons = document.querySelectorAll(".sidebar button");
  sidebarButtons.forEach((button) => {
    button.classList.remove("active");
  });

  // Add active class to clicked button
  const activeButton = Array.from(sidebarButtons).find((button) =>
    button.getAttribute("onclick")?.includes(`showTab('${tabId}')`),
  );
  if (activeButton) {
    activeButton.classList.add("active");
  }

  // Handle fixed save button visibility based on which tab is active
  const fixedSaveButton = document.querySelector(".fixed-save-button");
  if (fixedSaveButton) {
    fixedSaveButton.style.display =
      tabId === "video-options" ? "block" : "none";
  }
}

// This is the main entry point for all JavaScript functionality
document.addEventListener("DOMContentLoaded", () => {
  console.log("mDVR Web Interface loaded");

  // Initialize grid layout if we're on the home tab
  if (document.getElementById("dashboard-grid")) {
    console.log("Dashboard grid layout initialized");
  }

  // Check if we should show the fixed save button on initial load
  const videoOptionsTab = document.getElementById("video-options");
  const fixedSaveButton = document.querySelector(".fixed-save-button");

  if (
    fixedSaveButton &&
    videoOptionsTab &&
    videoOptionsTab.classList.contains("active")
  ) {
    fixedSaveButton.style.display = "block";
  }
});
