// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "openaiHoverHelper",
    title: "Ask OpenAI about: \"%s\"",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Store the selected text upfront.
  const selectedText = info.selectionText;
  chrome.storage.sync.get("openaiApiKey", async (data) => {
    const userApiKey = data.openaiApiKey;
    if (!userApiKey) {
      // No API key: notify the user and open the Options page.
      chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_ERROR",
        payload: { text: "No API key. Please set your OpenAI key in Options." }
      });
      chrome.runtime.openOptionsPage();
      
      // Set up a one-time listener for when the API key is updated.
      chrome.storage.onChanged.addListener(function listener(changes, area) {
        if (
          area === "sync" &&
          changes.openaiApiKey &&
          changes.openaiApiKey.newValue
        ) {
          chrome.storage.onChanged.removeListener(listener);
          // Now that a key is set, retrieve it and re-run the query.
          chrome.storage.sync.get("openaiApiKey", async (newData) => {
            const newApiKey = newData.openaiApiKey;
            try {
              const responseText = await callOpenAI(selectedText, newApiKey);
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
      return;
    }

    // If API key exists, continue as normal.
    chrome.tabs.sendMessage(tab.id, { type: "SHOW_LOADING" });

    try {
      const responseText = await callOpenAI(selectedText, userApiKey);
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
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CONTINUE_CONVERSATION") {
    chrome.storage.sync.get("openaiApiKey", async (data) => {
      const userApiKey = data.openaiApiKey;
      if (!userApiKey) {
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

/**
 * Call OpenAI for the initial prompt.
 */
async function callOpenAI(prompt, apiKey) {
  const interviewPrompt = `You are an experienced software engineer candidate in a technical interview. You have been given the following coding problem:

[Insert your LeetCode problem statement here]

In your single response, please do **all** of the following **in this order**:

1. **Ask Clarifying Questions**: List any clarifying questions you would typically ask the interviewer.
2. **Provide Hypothetical Answers**: Immediately provide realistic, most-likely answers from the interviewer’s perspective to those clarifying questions. (You are effectively playing both roles to simulate a complete interview in one shot.)
3. **Restate Assumptions**: If there are additional assumptions you need to make (based on the hypothetical Q&A), state them here.
4. **Solution Outline**:
    - Present a clear, step-by-step plan to solve the problem.
    - Discuss time complexity (Big-O analysis).
    - Discuss space complexity.
5. **Java Implementation**:
    - Provide a clean, well-commented Java solution.
6. **Optimization Discussion**:
    - Discuss any potential optimizations (e.g., memory usage, handling large inputs, distributed systems considerations if applicable).
7. **Summary**: Summarize your solution briefly.

Remember: Everything should be contained in this single response—do not wait for further input. You will simulate both the candidate (who asks questions) and the interviewer (who provides likely clarifications) before proceeding to the solution.`;






  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo", // or "gpt-4" if available
      messages: [
        { role: "system", content: interviewPrompt },
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
