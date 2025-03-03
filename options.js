// options.js

document.addEventListener("DOMContentLoaded", () => {
  // Load global API key.
  chrome.storage.sync.get("globalApiKey", (data) => {
    document.getElementById("globalApiKey").value = data.globalApiKey || "";
  });

  // Load templates.
  loadTemplates();
});

document.getElementById("saveGlobalKeyBtn").addEventListener("click", () => {
  const globalKey = document.getElementById("globalApiKey").value.trim();
  chrome.storage.sync.set({ globalApiKey: globalKey }, () => {
    document.getElementById("globalKeyStatus").innerText = "Global API key saved!";
    setTimeout(() => {
      document.getElementById("globalKeyStatus").innerText = "";
    }, 2000);
  });
});

document.getElementById("templateForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("templateId").value;
  const title = document.getElementById("templateTitle").value.trim();
  const content = document.getElementById("templateContent").value.trim();
  const model = document.getElementById("templateModel").value;
  const apiKey = document.getElementById("templateApiKey").value.trim();

  if (!title || !content) {
    alert("Template title and content are required.");
    return;
  }

  chrome.storage.sync.get("promptTemplates", (data) => {
    let templates = data.promptTemplates || [];
    if (id) {
      // Edit existing
      templates = templates.map((tpl) => tpl.id === id ? { id, title, content, model, apiKey } : tpl);
    } else {
      // Add new
      templates.push({ id: Date.now().toString(), title, content, model, apiKey });
    }
    chrome.storage.sync.set({ promptTemplates: templates }, () => {
      resetForm();
      loadTemplates();
      // Notify background to update context menus.
      chrome.runtime.sendMessage({ type: "UPDATE_CONTEXT_MENUS" });
    });
  });
});

function loadTemplates() {
  chrome.storage.sync.get("promptTemplates", (data) => {
    const templates = data.promptTemplates || [];
    const tbody = document.querySelector("#templatesTable tbody");
    tbody.innerHTML = "";
    templates.forEach((tpl) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${tpl.title}</td>
        <td>${tpl.model}</td>
        <td>${tpl.apiKey ? "Set" : "Default"}</td>
        <td class="actions">
          <button onclick="editTemplate('${tpl.id}')">Edit</button>
          <button onclick="deleteTemplate('${tpl.id}')">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  });
}

function resetForm() {
  document.getElementById("templateId").value = "";
  document.getElementById("templateTitle").value = "";
  document.getElementById("templateContent").value = "";
  document.getElementById("templateModel").value = "gpt-3.5-turbo";
  document.getElementById("templateApiKey").value = "";
}

window.editTemplate = function(id) {
  chrome.storage.sync.get("promptTemplates", (data) => {
    const templates = data.promptTemplates || [];
    const tpl = templates.find(t => t.id === id);
    if (tpl) {
      document.getElementById("templateId").value = tpl.id;
      document.getElementById("templateTitle").value = tpl.title;
      document.getElementById("templateContent").value = tpl.content;
      document.getElementById("templateModel").value = tpl.model;
      document.getElementById("templateApiKey").value = tpl.apiKey || "";
    }
  });
}

window.deleteTemplate = function(id) {
  if (confirm("Are you sure you want to delete this template?")) {
    chrome.storage.sync.get("promptTemplates", (data) => {
      let templates = data.promptTemplates || [];
      templates = templates.filter(t => t.id !== id);
      chrome.storage.sync.set({ promptTemplates: templates }, () => {
        loadTemplates();
        // Notify background to update context menus.
        chrome.runtime.sendMessage({ type: "UPDATE_CONTEXT_MENUS" });
      });
    });
  }
}
