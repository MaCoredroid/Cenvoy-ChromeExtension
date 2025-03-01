// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "openaiHoverHelper",
    title: "Ask OpenAI about: \"%s\"",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "openaiHoverHelper") {
    chrome.storage.sync.get("openaiApiKey", async (data) => {
      const userApiKey = data.openaiApiKey;
      if (!userApiKey) {
        // No API key: show an error + open options page
        chrome.tabs.sendMessage(tab.id, {
          type: "SHOW_ERROR",
          payload: { text: "No API key. Please set your OpenAI key in Options." }
        });
        chrome.runtime.openOptionsPage();
        return;
      }

      // Immediately show loading indicator
      chrome.tabs.sendMessage(tab.id, { type: "SHOW_LOADING" });

      // Attempt to call OpenAI
      const selectedText = info.selectionText;
      try {
        const responseText = await callOpenAI(selectedText, userApiKey);
        // On success, show the result with the initial user prompt
        chrome.tabs.sendMessage(tab.id, {
          type: "SHOW_RESULT",
          payload: { initialUserPrompt: selectedText, text: responseText }
        });
      } catch (err) {
        chrome.tabs.sendMessage(tab.id, {
          type: "SHOW_ERROR",
          payload: { text: "OpenAI error: " + err.message }
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CONTINUE_CONVERSATION") {
    chrome.storage.sync.get("openaiApiKey", async (data) => {
      const userApiKey = data.openaiApiKey;
      if (!userApiKey) {
        // Send an error back to the *content script*:
        chrome.tabs.sendMessage(sender.tab.id, {
          type: "CONTINUE_RESPONSE",
          payload: { error: "API key not set" }
        });
        return;
      }
      try {
        const responseText = await callOpenAIConversation(
          message.payload.conversationHistory,
          userApiKey
        );
        
        // Send the new message to the content script:
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
    return true; // Keep the event listener alive for async
  }
});

/**
 * Call OpenAI for the initial prompt.
 */
async function callOpenAI(prompt, apiKey) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo", // or "gpt-4" if your key has GPT-4 access
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt }
      ]
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI request failed");
  }
  return data.choices?.[0]?.message?.content || "No response.";
}

/**
 * Call OpenAI for continued conversation using the full conversation history.
 */
async function callOpenAIConversation(conversationHistory, apiKey) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: conversationHistory
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI request failed");
  }
  return data.choices?.[0]?.message?.content || "No response.";
}
