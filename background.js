// background.js

// Function to (re)create all context menus.
function createContextMenus() {
  // Remove all existing context menus.
  chrome.contextMenus.removeAll(() => {
    // Create a default menu item.
    chrome.contextMenus.create({
      id: "defaultPrompt",
      title: "Ask OpenAI: \"%s\"",
      contexts: ["selection"]
    });
    // Load user-defined prompt templates.
    chrome.storage.sync.get("promptTemplates", (data) => {
      const templates = data.promptTemplates || [];
      templates.forEach((tpl) => {
        chrome.contextMenus.create({
          id: "template_" + tpl.id,
          title: tpl.title + ": \"%s\"",
          contexts: ["selection"]
        });
      });
    });
  });
}

// Create context menus on installation.
chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
});

// Update context menus when storage changes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.promptTemplates || changes.globalApiKey)) {
    createContextMenus();
  }
});

// Listen for messages from the options page to update context menus and for continued conversation.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPDATE_CONTEXT_MENUS") {
    createContextMenus();
  } else if (message.type === "CONTINUE_CONVERSATION") {
    // Expecting conversationHistory to be an object: { messages, apiKey, model }
    const conversation = message.payload.conversationHistory;
    chrome.storage.sync.get("globalApiKey", async (data) => {
      const globalApiKey = data.globalApiKey;
      // Use the API key and model stored with the conversation, or fallback if missing.
      const usedApiKey = conversation.apiKey || globalApiKey;
      const usedModel = conversation.model || "gpt-3.5-turbo";
      if (!usedApiKey) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: "CONTINUE_RESPONSE",
          payload: { error: "API key not set" }
        });
        return;
      }
      try {
        const responseText = await callOpenAIUnified(conversation.messages, usedApiKey, usedModel);
        chrome.tabs.sendMessage(sender.tab.id, {
          type: "CONTINUE_RESPONSE",
          payload: { responseText }
        });
      } catch (err) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: "CONTINUE_RESPONSE",
          payload: { error: err.message }
        });
      }
    });
    return true; // Keep the messaging channel open.
  }
});

// Handle context menu clicks.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const selectedText = info.selectionText;
  if (info.menuItemId.startsWith("template_")) {
    // Handle user-defined template.
    const templateId = info.menuItemId.replace("template_", "");
    chrome.storage.sync.get(["promptTemplates", "globalApiKey"], (data) => {
      const templates = data.promptTemplates || [];
      const template = templates.find(t => t.id === templateId);
      if (!template) {
        chrome.tabs.sendMessage(tab.id, {
          type: "SHOW_ERROR",
          payload: { text: "Template not found." }
        });
        return;
      }
      // Replace placeholder {selection} with the selected text.
      const systemPrompt = template.content.replace(/\{selection\}/g, selectedText);
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: selectedText }
      ];
      // Use the template-specific API key if set, otherwise fall back to the global API key.
      const apiKey = template.apiKey ? template.apiKey : data.globalApiKey;
      if (!apiKey) {
        chrome.tabs.sendMessage(tab.id, {
          type: "SHOW_ERROR",
          payload: { text: "No API key provided. Please set it in Options." }
        });
        chrome.runtime.openOptionsPage();
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "SHOW_LOADING" });
      callOpenAIUnified(messages, apiKey, template.model)
        .then((responseText) => {
          // Send back meta data (apiKey and model) so subsequent conversation uses these.
          chrome.tabs.sendMessage(tab.id, {
            type: "SHOW_RESULT",
            payload: {
              initialUserPrompt: selectedText,
              text: responseText,
              apiKey: apiKey,
              model: template.model
            }
          });
        })
        .catch((err) => {
          chrome.tabs.sendMessage(tab.id, {
            type: "SHOW_ERROR",
            payload: { text: "OpenAI error: " + err.message }
          });
        });
    });
  } else if (info.menuItemId === "defaultPrompt") {
    // Default prompt behavior.
    chrome.storage.sync.get("globalApiKey", (data) => {
      const apiKey = data.globalApiKey;
      if (!apiKey) {
        chrome.tabs.sendMessage(tab.id, {
          type: "SHOW_ERROR",
          payload: { text: "No API key provided. Please set it in Options." }
        });
        chrome.runtime.openOptionsPage();
        return;
      }
      const defaultPrompt = "You are a helpful assistant, help user understand the following content from web page";
      const messages = [
        { role: "system", content: defaultPrompt },
        { role: "user", content: selectedText }
      ];
      chrome.tabs.sendMessage(tab.id, { type: "SHOW_LOADING" });
      callOpenAIUnified(messages, apiKey)
        .then((responseText) => {
          // Include meta data so continued conversation uses global settings.
          chrome.tabs.sendMessage(tab.id, {
            type: "SHOW_RESULT",
            payload: {
              initialUserPrompt: selectedText,
              text: responseText,
              apiKey: apiKey,
              model: "gpt-3.5-turbo"
            }
          });
        })
        .catch((err) => {
          chrome.tabs.sendMessage(tab.id, {
            type: "SHOW_ERROR",
            payload: { text: "OpenAI error: " + err.message }
          });
        });
    });
  }
});

/**
 * Unified function to call the OpenAI chat completions endpoint.
 *
 * @param {Array} messages - Array of message objects (each with role and content).
 * @param {string} apiKey - The API key to use for this request.
 * @param {string} [model="gpt-3.5-turbo"] - The OpenAI model to use.
 * @returns {Promise<string>} - The response content from OpenAI.
 */
async function callOpenAIUnified(messages, apiKey, model = "gpt-3.5-turbo") {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI request failed");
  }
  return data.choices?.[0]?.message?.content || "No response.";
}
