// options.js

document.addEventListener("DOMContentLoaded", () => {
  // Load global API key.
  chrome.storage.sync.get("globalApiKey", (data) => {
    document.getElementById("globalApiKey").value = data.globalApiKey || "";
  });

  // Load templates.
  loadTemplates();

  // Setup Workflow Steps UI
  const addWorkflowBtn = document.getElementById("addWorkflowStep");
  if (addWorkflowBtn) {
    addWorkflowBtn.addEventListener("click", function() {
      const workflowContainer = document.getElementById("workflowSteps");
      const stepDiv = document.createElement("div");
      stepDiv.className = "workflow-step";
      stepDiv.innerHTML = '<textarea placeholder="Enter workflow step prompt" class="workflow-step-input"></textarea>' +
                           '<button type="button" class="removeWorkflowStep">Remove</button>';
      workflowContainer.appendChild(stepDiv);
    });
  }

  // Delegate event for removing a workflow step
  const workflowContainer = document.getElementById("workflowSteps");
  if (workflowContainer) {
    workflowContainer.addEventListener("click", function(e) {
      if (e.target && e.target.classList.contains("removeWorkflowStep")) {
        e.target.parentElement.remove();
      }
    });
  }

  // Helper function to collect workflow steps from the UI
  function getWorkflowSteps() {
    const steps = [];
    const stepInputs = document.querySelectorAll(".workflow-step-input");
    stepInputs.forEach(input => {
      const value = input.value.trim();
      if (value !== "") {
        steps.push({ content: value });
      }
    });
    return steps;
  }

  // Augment the template saving mechanism to include workflow steps
  const saveTemplateButton = document.getElementById("saveTemplateButton");
  if (saveTemplateButton) {
    saveTemplateButton.addEventListener("click", function() {
      // Assume getTemplateFromForm collects the base template data
      const template = getTemplateFromForm();
      // Collect workflow steps
      template.workflow = getWorkflowSteps();
      // Save the template using existing save function
      saveTemplate(template);
    });
  }

  // Helper function to populate workflow steps in the UI when editing a template
  function populateWorkflowSteps(workflow) {
    const workflowContainer = document.getElementById("workflowSteps");
    if (!workflowContainer) return;
    // Clear any existing steps
    workflowContainer.innerHTML = "";
    if (Array.isArray(workflow)) {
      workflow.forEach(step => {
        const stepDiv = document.createElement("div");
        stepDiv.className = "workflow-step";
        stepDiv.innerHTML = '<textarea placeholder="Enter workflow step prompt" class="workflow-step-input"></textarea>' +
                            '<button type="button" class="removeWorkflowStep">Remove</button>';
        stepDiv.querySelector(".workflow-step-input").value = step.content || "";
        workflowContainer.appendChild(stepDiv);
      });
    }
  }

  // Example usage: when editing an existing template, call populateWorkflowSteps(template.workflow)
  // populateWorkflowSteps(existingTemplate.workflow);

  const enableWorkflowCheckbox = document.getElementById("enableWorkflow");
  if (enableWorkflowCheckbox) {
    enableWorkflowCheckbox.addEventListener("change", function() {
      const workflowContainer = document.getElementById("workflowContainer");
      workflowContainer.style.display = enableWorkflowCheckbox.checked ? "block" : "none";
    });
  }

  window.getWorkflowSteps = getWorkflowSteps;
  window.populateWorkflowSteps = populateWorkflowSteps;
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

  let workflow = undefined;
  if(document.getElementById("enableWorkflow").checked) {
    workflow = window.getWorkflowSteps();
  }

  if (!title || !content) {
    alert("Template title and content are required.");
    return;
  }

  chrome.storage.sync.get("promptTemplates", (data) => {
    let templates = data.promptTemplates || [];
    if (id) {
      // Edit existing
      templates = templates.map((tpl) =>
        tpl.id === id
          ? { id, title, content, model, apiKey, workflow }
          : tpl
      );
    } else {
      // Add new
      templates.push({
        id: Date.now().toString(),
        title,
        content,
        model,
        apiKey,
        workflow,
      });
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

      const titleTd = document.createElement("td");
      titleTd.textContent = tpl.title;

      const modelTd = document.createElement("td");
      modelTd.textContent = tpl.model;

      const apiKeyTd = document.createElement("td");
      apiKeyTd.textContent = tpl.apiKey ? "Set" : "Default";

      const actionsTd = document.createElement("td");
      actionsTd.classList.add("actions");

      // "Edit" button
      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        editTemplate(tpl.id);
      });

      // "Delete" button
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        deleteTemplate(tpl.id);
      });

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(deleteBtn);

      tr.appendChild(titleTd);
      tr.appendChild(modelTd);
      tr.appendChild(apiKeyTd);
      tr.appendChild(actionsTd);

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
  
  // Reset workflow fields
  document.getElementById("enableWorkflow").checked = false;
  document.getElementById("workflowContainer").style.display = "none";
  document.getElementById("workflowSteps").innerHTML = "";
}

window.editTemplate = function(id) {
  chrome.storage.sync.get("promptTemplates", (data) => {
    const templates = data.promptTemplates || [];
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      document.getElementById("templateId").value = tpl.id;
      document.getElementById("templateTitle").value = tpl.title;
      document.getElementById("templateContent").value = tpl.content;
      document.getElementById("templateModel").value = tpl.model;
      document.getElementById("templateApiKey").value = tpl.apiKey || "";
      
      const enableWorkflowElem = document.getElementById("enableWorkflow");
      if(tpl.workflow && tpl.workflow.length > 0) {
        enableWorkflowElem.checked = true;
        document.getElementById("workflowContainer").style.display = "block";
        window.populateWorkflowSteps(tpl.workflow);
      } else {
        enableWorkflowElem.checked = false;
        document.getElementById("workflowContainer").style.display = "none";
        document.getElementById("workflowSteps").innerHTML = "";
      }
    }
  });
};

window.deleteTemplate = function(id) {
  if (confirm("Are you sure you want to delete this template?")) {
    chrome.storage.sync.get("promptTemplates", (data) => {
      let templates = data.promptTemplates || [];
      templates = templates.filter((t) => t.id !== id);
      chrome.storage.sync.set({ promptTemplates: templates }, () => {
        loadTemplates();
        // Notify background to update context menus.
        chrome.runtime.sendMessage({ type: "UPDATE_CONTEXT_MENUS" });
      });
    });
  }
};
