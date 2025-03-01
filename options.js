// options.js

// On page load, fetch and display the existing key (if any)
document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.sync.get("openaiApiKey", (data) => {
      const savedKey = data.openaiApiKey || "";
      document.getElementById("apiKeyInput").value = savedKey;
    });
  });
  
  // When user clicks "Save", store the key
  document.getElementById("saveBtn").addEventListener("click", () => {
    const key = document.getElementById("apiKeyInput").value.trim();
    // Save to chrome.storage
    chrome.storage.sync.set({ openaiApiKey: key }, () => {
      document.getElementById("status").innerText = "API key saved!";
      setTimeout(() => {
        document.getElementById("status").innerText = "";
      }, 2000);
    });
  });
  