// background.js

let isContextMenuUpdating = false;

// Function to (re)create all context menus.
function createContextMenus() {
  if (isContextMenuUpdating) return;
  isContextMenuUpdating = true;
  chrome.contextMenus.removeAll(() => {
    // Inserted context menu item for options page
    chrome.contextMenus.create({
      id: "open_options",
      title: "Options...",
      contexts: ["all"]
    }, function() {
      if (chrome.runtime.lastError) console.warn("Error creating options menu:", chrome.runtime.lastError.message);
    });
    chrome.contextMenus.create({
      id: "defaultPrompt",
      title: "Ask OpenAI: \"%s\"",
      contexts: ["selection"]
    }, function() {
      if (chrome.runtime.lastError) console.warn("Error creating defaultPrompt:", chrome.runtime.lastError.message);
    });
    chrome.contextMenus.create({
      id: "summarizePage",
      title: "Summarize This Page",
      contexts: ["all"]
    }, function() {
      if (chrome.runtime.lastError) console.warn("Error creating summarizePage:", chrome.runtime.lastError.message);
    });
    chrome.storage.sync.get("promptTemplates", (data) => {
      const templates = data.promptTemplates || [];
      templates.forEach((tpl) => {
        chrome.contextMenus.create({
          id: "template_" + tpl.id,
          title: tpl.title + ": \"%s\"",
          contexts: ["selection"]
        }, function() {
          if (chrome.runtime.lastError) console.warn("Error creating template menu:", chrome.runtime.lastError.message);
        });
      });
      isContextMenuUpdating = false;
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
  if (info.menuItemId === "open_options") {
    chrome.runtime.openOptionsPage();
    return;
  }
  const selectedText = info.selectionText;
  
  if (info.menuItemId === "summarizePage") {
    // Get page content and process it similar to defaultPrompt
    chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTENT" }, function(response) {
      if (chrome.runtime.lastError) {
        console.error("Error getting page content:", chrome.runtime.lastError);
        return;
      }
      
      chrome.storage.sync.get("globalApiKey", (data) => {
        const apiKey = data.globalApiKey;
        if (!apiKey) {
          chrome.tabs.sendMessage(tab.id, { type: "SHOW_ERROR", payload: { text: "No API key provided. Please set it in Options." } });
          chrome.runtime.openOptionsPage();
          return;
        }
        
        const pageContent = response.content;
        const pageTitle = response.title;
        const userPrompt = `Summarize the following webpage titled "${pageTitle}":\n\n${pageContent} and answer all questions baesd on that`;
        
        const conversationHistory = { 
          messages: [], 
          apiKey: apiKey, 
          model: "gpt-4",
          isPageSummary: true
        };
        conversationHistory.messages.push({ role: "user", content: userPrompt });
        conversationHistory.messages.push({ role: "assistant", content: "__LOADING__" });
        
        chrome.tabs.sendMessage(tab.id, {
          type: "SHOW_RESULT",
          payload: {
            initialUserPrompt: userPrompt,
            text: "__LOADING__",
            conversationHistory: conversationHistory
          }
        });
        
        // Call LLM using only the user message
        callOpenAIUnified(conversationHistory.messages.slice(0, 1), apiKey, "gpt-3.5-turbo")
          .then((responseText) => {
            conversationHistory.messages[1].content = responseText;
            chrome.tabs.sendMessage(tab.id, {
              type: "CONTINUE_RESPONSE",
              payload: { responseText }
            });
          })
          .catch((err) => {
            chrome.tabs.sendMessage(tab.id, {
              type: "SHOW_ERROR",
              payload: { text: "OpenAI error: " + err.message }
            });
          });
      });
    });
    return;
  }
  
  if (info.menuItemId.startsWith("template_")) {
    // Handle user-defined template.
    const templateId = info.menuItemId.replace("template_", "");
    chrome.storage.sync.get(["promptTemplates", "globalApiKey"], (data) => {
      const templates = data.promptTemplates || [];
      const template = templates.find(t => t.id === templateId);
      if (!template) {
        chrome.tabs.sendMessage(tab.id, { type: "SHOW_ERROR", payload: { text: "Template not found." } });
        return;
      }
      const apiKey = template.apiKey ? template.apiKey : data.globalApiKey;
      if (!apiKey) {
        chrome.tabs.sendMessage(tab.id, { type: "SHOW_ERROR", payload: { text: "No API key provided. Please set it in Options." } });
        chrome.runtime.openOptionsPage();
        return;
      }
      (async () => {
        try {
          let output = "";
          let conversationHistory;
          if (template.workflow && Array.isArray(template.workflow) && template.workflow.length > 0) {
            conversationHistory = { messages: [], apiKey: apiKey, model: template.model };
            let initialPrompt;
            if (template.content.includes("{selection}")) {
              initialPrompt = template.content.replace(/\{selection\}/g, selectedText);
            } else {
              initialPrompt = template.content + " " + selectedText;
            }
            conversationHistory.messages.push({ role: "user", content: initialPrompt });
            conversationHistory.messages.push({ role: "assistant", content: "__LOADING__" });
            chrome.tabs.sendMessage(tab.id, {
              type: "SHOW_RESULT",
              payload: { initialUserPrompt: initialPrompt, text: "__LOADING__", conversationHistory: conversationHistory }
            });
            output = await callOpenAIUnified(conversationHistory.messages.slice(0, 1), apiKey, template.model);
            conversationHistory.messages[1].content = output;
            chrome.tabs.sendMessage(tab.id, { type: "CONTINUE_RESPONSE", payload: { responseText: output } });
            // Process each workflow step sequentially
            for (const step of template.workflow) {
              const stepPrompt = step.content.replace(/\{previousOutput\}/g, output).replace(/\{selection\}/g, selectedText);
              conversationHistory.messages.push({ role: "user", content: stepPrompt });
              conversationHistory.messages.push({ role: "assistant", content: "__LOADING__" });
              chrome.tabs.sendMessage(tab.id, {
                type: "SHOW_RESULT",
                payload: { initialUserPrompt: stepPrompt, text: "__LOADING__", conversationHistory: conversationHistory }
              });
              output = await callOpenAIUnified(conversationHistory.messages.slice(0, conversationHistory.messages.length - 1), apiKey, template.model);
              conversationHistory.messages[conversationHistory.messages.length - 1].content = output;
              chrome.tabs.sendMessage(tab.id, { type: "CONTINUE_RESPONSE", payload: { responseText: output } });
            }
          } else {
            conversationHistory = { messages: [], apiKey: apiKey, model: template.model };
            let promptText;
            if (template.content.includes("{selection}")) {
              promptText = template.content.replace(/\{selection\}/g, selectedText);
            } else {
              promptText = template.content + " " + selectedText;
            }
            conversationHistory.messages.push({ role: "user", content: promptText });
            conversationHistory.messages.push({ role: "assistant", content: "__LOADING__" });
            chrome.tabs.sendMessage(tab.id, {
              type: "SHOW_RESULT",
              payload: { initialUserPrompt: promptText, text: "__LOADING__", conversationHistory: conversationHistory }
            });
            output = await callOpenAIUnified(conversationHistory.messages.slice(0, 1), apiKey, template.model);
            conversationHistory.messages[1].content = output;
            chrome.tabs.sendMessage(tab.id, { type: "CONTINUE_RESPONSE", payload: { responseText: output } });
          }
        } catch (err) {
          chrome.tabs.sendMessage(tab.id, {
            type: "SHOW_ERROR",
            payload: { text: "OpenAI error: " + err.message }
          });
        }
      })();
    });
  } else if (info.menuItemId === "defaultPrompt") {
    // Default prompt behavior.
    chrome.storage.sync.get("globalApiKey", (data) => {
      const apiKey = data.globalApiKey;
      if (!apiKey) {
        chrome.tabs.sendMessage(tab.id, { type: "SHOW_ERROR", payload: { text: "No API key provided. Please set it in Options." } });
        chrome.runtime.openOptionsPage();
        return;
      }
      const defaultPrompt = "You are a helpful assistant, help user understand the following content from web page";
      const userPrompt = defaultPrompt + " " + selectedText;
      const conversationHistory = { messages: [], apiKey: apiKey, model: "gpt-3.5-turbo" };
      conversationHistory.messages.push({ role: "user", content: userPrompt });
      conversationHistory.messages.push({ role: "assistant", content: "__LOADING__" });
      chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_RESULT",
        payload: {
          initialUserPrompt: userPrompt,
          text: "__LOADING__",
          conversationHistory: conversationHistory
        }
      });
      // Call LLM using only the user message
      callOpenAIUnified(conversationHistory.messages.slice(0, 1), apiKey, "gpt-3.5-turbo")
        .then((responseText) => {
          conversationHistory.messages[1].content = responseText;
          chrome.tabs.sendMessage(tab.id, {
            type: "CONTINUE_RESPONSE",
            payload: { responseText }
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
