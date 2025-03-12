// options.js

document.addEventListener("DOMContentLoaded", () => {
  // Load global API key.
  chrome.storage.sync.get("globalApiKey", (data) => {
    document.getElementById("globalApiKey").value = data.globalApiKey || "";
  });

  // Load templates.
  loadTemplates();

  // Setup tabs functionality
  setupTabs();

  // Setup AI Guided Setup functionality
  setupAiGuidedFeature();

  // Setup Model Management functionality
  setupModelManagement();

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

// Setup Model Management functionality
function setupModelManagement() {
  // Default models that should always be available
  const DEFAULT_MODELS = [
    { id: "gpt-4", name: "GPT‑4", isDefault: true },
    { id: "gpt-3.5-turbo", name: "GPT‑3.5 Turbo" }
  ];

  // Load saved models or use defaults
  loadModels();

  // Setup modal functionality
  const modal = document.getElementById("modelModal");
  const manageModelsBtn = document.getElementById("manageModelsBtn");
  const closeModalBtn = document.querySelector(".close-modal");
  const saveModelsBtn = document.getElementById("saveModelsBtn");
  const cancelModelsBtn = document.getElementById("cancelModelsBtn");
  const addModelBtn = document.getElementById("addModelBtn");

  // Open modal
  manageModelsBtn.addEventListener("click", () => {
    populateModelList();
    modal.style.display = "flex";
  });

  // Close modal
  closeModalBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  // Cancel changes
  cancelModelsBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  // Save changes
  saveModelsBtn.addEventListener("click", () => {
    saveModelList();
    modal.style.display = "none";
  });

  // Add new model
  addModelBtn.addEventListener("click", addNewModel);

  // Close modal when clicking outside
  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  // Load models from storage or use defaults
  function loadModels() {
    chrome.storage.sync.get("openaiModels", (data) => {
      let models = data.openaiModels || DEFAULT_MODELS;
      
      // Make sure GPT-4 is always included and marked as default
      if (!models.some(model => model.id === "gpt-4")) {
        models.unshift({ id: "gpt-4", name: "GPT‑4", isDefault: true });
      }
      
      // Update the model dropdown
      updateModelDropdown(models);
    });
  }

  // Update the model dropdown with the current models
  function updateModelDropdown(models) {
    const dropdown = document.getElementById("templateModel");
    const currentValue = dropdown.value;
    
    // Clear existing options
    dropdown.innerHTML = "";
    
    // Add options for each model
    models.forEach(model => {
      const option = document.createElement("option");
      option.value = model.id;
      
      // Fix any model name with regular hyphens
      let displayName = model.name || model.id;
      if (displayName.includes("GPT-")) {
        displayName = displayName.replace("GPT-", "GPT‑");
      }
      
      option.textContent = displayName;
      dropdown.appendChild(option);
    });
    
    // Try to restore the previously selected value
    if (currentValue && dropdown.querySelector(`option[value="${currentValue}"]`)) {
      dropdown.value = currentValue;
    } else {
      // Default to GPT-4 if the previous value is no longer available
      dropdown.value = "gpt-4";
    }
  }

  // Populate the model list in the modal
  function populateModelList() {
    chrome.storage.sync.get("openaiModels", (data) => {
      let models = data.openaiModels || DEFAULT_MODELS;
      
      // Make sure GPT-4 is always included and marked as default
      if (!models.some(model => model.id === "gpt-4")) {
        models.unshift({ id: "gpt-4", name: "GPT‑4", isDefault: true });
      }
      
      const modelList = document.getElementById("modelList");
      modelList.innerHTML = "";
      
      models.forEach(model => {
        const li = document.createElement("li");
        li.setAttribute("data-id", model.id);
        
        const modelInfo = document.createElement("div");
        // Fix any model name with regular hyphens
        let displayName = model.name || model.id;
        if (displayName.includes("GPT-")) {
          displayName = displayName.replace("GPT-", "GPT‑");
        }
        modelInfo.textContent = displayName;
        
        if (model.isDefault) {
          const defaultSpan = document.createElement("span");
          defaultSpan.className = "default-model";
          defaultSpan.textContent = " (Default)";
          modelInfo.appendChild(defaultSpan);
        }
        
        const actions = document.createElement("div");
        actions.className = "model-actions";
        
        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-model";
        removeBtn.textContent = "Remove";
        removeBtn.disabled = model.id === "gpt-4"; // Can't remove GPT-4
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          li.remove();
        });
        
        actions.appendChild(removeBtn);
        li.appendChild(modelInfo);
        li.appendChild(actions);
        modelList.appendChild(li);
      });
      
      // Initialize drag and drop
      initDragAndDrop();
    });
  }

  // Initialize drag and drop functionality
  function initDragAndDrop() {
    const modelList = document.getElementById("modelList");
    const items = modelList.querySelectorAll("li");
    
    items.forEach(item => {
      item.setAttribute("draggable", true);
      
      item.addEventListener("dragstart", () => {
        // Adding delay to make the dragging visual effect work properly
        setTimeout(() => item.classList.add("dragging"), 0);
      });
      
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
      });
    });
    
    modelList.addEventListener("dragover", e => {
      e.preventDefault();
      const afterElement = getDragAfterElement(modelList, e.clientY);
      const draggable = document.querySelector(".dragging");
      
      if (afterElement == null) {
        modelList.appendChild(draggable);
      } else {
        modelList.insertBefore(draggable, afterElement);
      }
    });
    
    function getDragAfterElement(container, y) {
      const draggableElements = [...container.querySelectorAll("li:not(.dragging)")];
      
      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
  }

  // Add a new model to the list
  function addNewModel() {
    const modelIdInput = document.getElementById("newModelId");
    const modelNameInput = document.getElementById("newModelName");
    
    const modelId = modelIdInput.value.trim();
    let modelName = modelNameInput.value.trim() || modelId;
    
    // Fix any model name with regular hyphens
    if (modelName.includes("GPT-")) {
      modelName = modelName.replace("GPT-", "GPT‑");
    }
    
    if (!modelId) {
      alert("Please enter a model ID");
      return;
    }
    
    // Check if model already exists
    const existingModel = document.querySelector(`#modelList li[data-id="${modelId}"]`);
    if (existingModel) {
      alert("This model already exists in the list");
      return;
    }
    
    const modelList = document.getElementById("modelList");
    const li = document.createElement("li");
    li.setAttribute("data-id", modelId);
    li.setAttribute("draggable", true);
    
    const modelInfo = document.createElement("div");
    modelInfo.textContent = modelName;
    
    const actions = document.createElement("div");
    actions.className = "model-actions";
    
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-model";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      li.remove();
    });
    
    actions.appendChild(removeBtn);
    li.appendChild(modelInfo);
    li.appendChild(actions);
    modelList.appendChild(li);
    
    // Add drag and drop event listeners
    li.addEventListener("dragstart", () => {
      setTimeout(() => li.classList.add("dragging"), 0);
    });
    
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
    });
    
    // Clear inputs
    modelIdInput.value = "";
    modelNameInput.value = "";
  }

  // Save the current model list to storage
  function saveModelList() {
    const modelItems = document.querySelectorAll("#modelList li");
    const models = [];
    
    modelItems.forEach(item => {
      const id = item.getAttribute("data-id");
      const name = item.querySelector("div").textContent.replace(" (Default)", "");
      const isDefault = id === "gpt-4";
      
      models.push({ id, name, isDefault });
    });
    
    chrome.storage.sync.set({ openaiModels: models }, () => {
      // Update the dropdown with the new models
      updateModelDropdown(models);
    });
  }
}

// Setup tabs functionality
function setupTabs() {
  const aiGuidedTab = document.getElementById("aiGuidedTab");
  const manualTab = document.getElementById("manualTab");
  const aiGuidedContent = document.getElementById("aiGuidedContent");
  const manualContent = document.getElementById("manualContent");
  
  aiGuidedTab.addEventListener("click", () => {
    aiGuidedTab.classList.add("active");
    manualTab.classList.remove("active");
    aiGuidedContent.classList.add("active");
    manualContent.classList.remove("active");
  });
  
  manualTab.addEventListener("click", () => {
    manualTab.classList.add("active");
    aiGuidedTab.classList.remove("active");
    manualContent.classList.add("active");
    aiGuidedContent.classList.remove("active");
    
    // If we have generated content, synchronize it to the manual fields
    const generatedTitle = document.getElementById("aiGeneratedTitle").textContent;
    const generatedContent = document.getElementById("aiGeneratedContent").textContent;
    
    if (generatedTitle && document.getElementById("templateTitle").value === "") {
      document.getElementById("templateTitle").value = generatedTitle;
    }
    
    if (generatedContent && document.getElementById("templateContent").value === "") {
      document.getElementById("templateContent").value = generatedContent;
    }
  });
}

// Setup AI Guided Setup feature
function setupAiGuidedFeature() {
  const generatePromptBtn = document.getElementById("generatePromptBtn");
  const regenerateBtn = document.getElementById("regenerateBtn");
  const useGeneratedPromptBtn = document.getElementById("useGeneratedPromptBtn");
  const backToStep1 = document.getElementById("backToStep1");
  
  // Generate prompt when button is clicked
  generatePromptBtn.addEventListener("click", async () => {
    const description = document.getElementById("aiDescription").value.trim();
    
    if (!description) {
      alert("Please enter a description of what you want the prompt to do.");
      return;
    }
    
    // Show loading indicator
    generatePromptBtn.style.display = "none";
    document.getElementById("generatingIndicator").style.display = "inline-block";
    
    try {
      await generatePromptTemplate(description);
      // Show step 2 and hide step 1
      document.getElementById("step1").style.display = "none";
      document.getElementById("step2").style.display = "block";
    } catch (error) {
      alert("Error generating prompt template: " + error.message);
    } finally {
      // Hide loading indicator
      generatePromptBtn.style.display = "inline-block";
      document.getElementById("generatingIndicator").style.display = "none";
    }
  });
  
  // Back button returns to step 1
  backToStep1.addEventListener("click", () => {
    document.getElementById("step1").style.display = "block";
    document.getElementById("step2").style.display = "none";
  });
  
  // Use the generated prompt
  useGeneratedPromptBtn.addEventListener("click", () => {
    const title = document.getElementById("aiGeneratedTitle").textContent;
    const content = document.getElementById("aiGeneratedContent").textContent;
    
    // Populate the fields in the manual tab as well
    document.getElementById("templateTitle").value = title;
    document.getElementById("templateContent").value = content;
    
    // Switch to manual tab to let the user add any final touches
    document.getElementById("manualTab").click();
  });
  
  // Regenerate prompt
  regenerateBtn.addEventListener("click", async () => {
    const description = document.getElementById("aiDescription").value.trim();
    
    regenerateBtn.textContent = "Regenerating...";
    regenerateBtn.disabled = true;
    
    try {
      await generatePromptTemplate(description);
    } catch (error) {
      alert("Error regenerating prompt template: " + error.message);
    } finally {
      regenerateBtn.textContent = "Regenerate";
      regenerateBtn.disabled = false;
    }
  });
}

// Function to generate prompt template using OpenAI API
async function generatePromptTemplate(description) {
  // Get API key
  const apiKey = await new Promise(resolve => {
    chrome.storage.sync.get("globalApiKey", (data) => {
      resolve(data.globalApiKey || "");
    });
  });
  
  if (!apiKey) {
    throw new Error("Please set your OpenAI API key in the Global API Key section first.");
  }
  
  const systemPrompt = `You are an expert at creating effective prompt templates for AI models. 
  Your task is to create a detailed prompt template based on the following user request:
  
  "${description}"
  
  The prompt should include a clear title and a detailed prompt content.
  Include the placeholder {selection} where the user's selected text should be inserted.
  Return your response in this exact JSON format:
  {
    "title": "Concise, descriptive title for the prompt",
    "content": "Detailed prompt content with {selection} placeholder"
  }`;
  
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4", // Always use GPT-4 for generating templates
        messages: [
          { role: "system", content: systemPrompt }
        ]
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || "Unknown API error");
    }
    
    const aiResponse = data.choices[0].message.content;
    
    try {
      // Parse the response to get JSON
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : aiResponse;
      const result = JSON.parse(jsonStr);
      
      // Safely set the text content
      const titleElement = document.getElementById("aiGeneratedTitle");
      const contentElement = document.getElementById("aiGeneratedContent");
      
      titleElement.textContent = result.title;
      contentElement.textContent = result.content;
      
      // Scroll to the top of the content area if needed
      if (contentElement.scrollTop) {
        contentElement.scrollTop = 0;
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      // If parsing fails, just display the raw response
      document.getElementById("aiGeneratedTitle").textContent = "Generated Title (please edit)";
      document.getElementById("aiGeneratedContent").textContent = aiResponse;
    }
    
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    throw error;
  }
}

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
  
  // Get title and content from appropriate source based on active tab
  let title, content;
  
  if (document.getElementById("aiGuidedContent").classList.contains("active")) {
    // If AI Guided tab is active, get values from generated content
    title = document.getElementById("aiGeneratedTitle").textContent;
    content = document.getElementById("aiGeneratedContent").textContent;
    
    // If we don't have generated content yet, alert the user
    if (!title || !content) {
      alert("Please generate a prompt template first or switch to Manual Setup.");
      return;
    }
  } else {
    // If Manual tab is active, get values from manual inputs
    title = document.getElementById("templateTitle").value.trim();
    content = document.getElementById("templateContent").value.trim();
  }
  
  // Get model and ensure it defaults to GPT-4 if empty
  let model = document.getElementById("templateModel").value.trim();
  if (!model) {
    model = "gpt-4";
  }
  
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

// Helper function to get template data from the form
function getTemplateFromForm() {
  // Get title and content from appropriate source based on active tab
  let title, content;
  
  if (document.getElementById("aiGuidedContent").classList.contains("active")) {
    // If AI Guided tab is active, get values from generated content
    title = document.getElementById("aiGeneratedTitle").textContent;
    content = document.getElementById("aiGeneratedContent").textContent;
  } else {
    // If Manual tab is active, get values from manual inputs
    title = document.getElementById("templateTitle").value.trim();
    content = document.getElementById("templateContent").value.trim();
  }
  
  // Get model and ensure it defaults to GPT-4 if empty
  let model = document.getElementById("templateModel").value.trim();
  if (!model) {
    model = "gpt-4";
  }
  
  const apiKey = document.getElementById("templateApiKey").value.trim();
  const id = document.getElementById("templateId").value;
  
  return {
    id,
    title,
    content,
    model,
    apiKey
  };
}

function resetForm() {
  document.getElementById("templateId").value = "";
  document.getElementById("templateTitle").value = "";
  document.getElementById("templateContent").value = "";
  document.getElementById("templateModel").value = "gpt-4";
  document.getElementById("templateApiKey").value = "";
  
  // Reset AI guided fields
  document.getElementById("aiDescription").value = "";
  document.getElementById("aiGeneratedTitle").textContent = "";
  document.getElementById("aiGeneratedContent").textContent = "";
  document.getElementById("step1").style.display = "block";
  document.getElementById("step2").style.display = "none";
  
  // Reset to AI guided tab as default
  document.getElementById("aiGuidedTab").click();
  
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
      
      // Set model in the select dropdown - if model doesn't exist in options, add it
      const modelSelect = document.getElementById("templateModel");
      const modelExists = Array.from(modelSelect.options).some(option => option.value === tpl.model);
      
      if (!modelExists && tpl.model) {
        // Add the model as an option if it doesn't exist in the dropdown
        const newOption = document.createElement("option");
        newOption.value = tpl.model;
        newOption.text = tpl.model; // Display name same as value
        modelSelect.add(newOption);
        
        // Also add it to the stored models list if it's not there
        chrome.storage.sync.get("openaiModels", (data) => {
          let models = data.openaiModels || [];
          if (!models.some(model => model.id === tpl.model)) {
            models.push({ id: tpl.model, name: tpl.model });
            chrome.storage.sync.set({ openaiModels: models });
          }
        });
      }
      
      modelSelect.value = tpl.model || "gpt-4"; // Default to gpt-4 if no model specified
      document.getElementById("templateApiKey").value = tpl.apiKey || "";
      
      // Switch to manual tab when editing existing template
      document.getElementById("manualTab").click();
      
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
