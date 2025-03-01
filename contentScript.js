// contentScript.js

// Enable line breaks in Marked globally.
marked.setOptions({
  breaks: true,
});

let timeoutTimer = null;
let conversationHistory = []; // Holds the full conversation context

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case "SHOW_LOADING":
      showHoverLoading();
      break;
    case "SHOW_RESULT":
      // On initial result, initialize conversation history.
      // Store the initial user prompt for context but skip rendering it.
      if (conversationHistory.length === 0) {
        conversationHistory = [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: message.payload.initialUserPrompt },
          { role: "assistant", content: message.payload.text }
        ];
      }
      showConversation();
      break;
    case "SHOW_ERROR":
      showHoverError(message.payload.text);
      break;
    case "CONTINUE_RESPONSE":
      clearTimeoutIfNeeded();
      if (message.payload.error) {
        showHoverError(message.payload.error);
      } else {
        conversationHistory.push({ role: "assistant", content: message.payload.responseText });
        showConversation();
      }
      break;
  }
});

/**
 * Display a "Loading…" indicator in the content area (with a 30s timeout).
 */
function showHoverLoading() {
  removeHoverContainer();
  const container = createHoverContainer();
  const content = getHoverContentContainer(container);
  content.innerHTML = `<em>Loading…</em>`;
  timeoutTimer = setTimeout(() => {
    showHoverError("Request timed out (30s).");
  }, 30000);
}

/**
 * Render the conversation as chat bubbles with a chat-style UI.
 * The very first user message (the selected text) is skipped.
 */
function showConversation() {
  clearTimeoutIfNeeded();
  const container = getOrCreateHoverContainer();
  const content = getHoverContentContainer(container);
  content.innerHTML = ""; // Clear previous conversation content

  // Create a container for the conversation bubbles.
  const convContainer = document.createElement("div");
  convContainer.id = "conversationContainer";
  convContainer.style.marginBottom = "16px";

  let skippedInitialUser = false;
  conversationHistory.forEach((msg) => {
    // Skip the very first user message (the selected text).
    if (msg.role === "user" && !skippedInitialUser) {
      skippedInitialUser = true;
      return;
    }
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.marginBottom = "8px";

    const bubble = document.createElement("div");
    bubble.style.padding = "8px 12px";
    bubble.style.borderRadius = "16px";
    bubble.style.maxWidth = "80%";
    bubble.style.wordWrap = "break-word";
    
    // Render message using Marked.
    const rendered = marked.parse(msg.content, { breaks: true });
    
    if (msg.role === "assistant") {
      row.style.justifyContent = "flex-start";
      bubble.style.backgroundColor = "#004080"; // Assistant bubble: dark blue
      bubble.style.color = "#fff";
    } else if (msg.role === "user") {
      row.style.justifyContent = "flex-end";
      bubble.style.backgroundColor = "#003366"; // User bubble: a different dark blue
      bubble.style.color = "#fff";
    }
    bubble.innerHTML = rendered;
    row.appendChild(bubble);
    convContainer.appendChild(row);
  });

  content.appendChild(convContainer);

  // Create the chat input area as a flex container.
  const chatContainer = document.createElement("div");
  chatContainer.id = "chatContainer";
  Object.assign(chatContainer.style, {
    display: "flex",
    gap: "8px",
    alignItems: "flex-start"
  });

  // Create a multi-line textarea.
  const textArea = document.createElement("textarea");
  textArea.id = "chatInput";
  textArea.placeholder = "Type your message here";
  Object.assign(textArea.style, {
    flex: "1",
    fontSize: "16px",
    padding: "6px",
    minHeight: "40px",
    maxHeight: "120px",
    resize: "vertical",
    borderRadius: "4px",
    border: "1px solid #ccc"
  });

  // Create a "Send" button.
  const sendButton = document.createElement("button");
  sendButton.id = "sendButton";
  sendButton.textContent = "Send";
  Object.assign(sendButton.style, {
    fontSize: "16px",
    padding: "6px 12px",
    backgroundColor: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer"
  });

  chatContainer.appendChild(textArea);
  chatContainer.appendChild(sendButton);
  content.appendChild(chatContainer);

  // Attach event listener to the send button.
  sendButton.addEventListener("click", sendChatMessage);
}

/**
 * Display an error message in the content area.
 */
function showHoverError(errorMessage) {
  clearTimeoutIfNeeded();
  const container = getOrCreateHoverContainer();
  const content = getHoverContentContainer(container);
  content.innerHTML = `<strong>Error:</strong> ${errorMessage}`;
}

/**
 * Remove the hover container entirely.
 */
function removeHoverContainer() {
  const existing = document.getElementById("openai-hover-container");
  if (existing) existing.remove();
}

/**
 * Retrieve or create the hover container.
 * The container includes a header (with a close button) and a content area.
 */
function getOrCreateHoverContainer() {
  let container = document.getElementById("openai-hover-container");
  if (!container) {
    container = createHoverContainer();
  }
  return container;
}

/**
 * Retrieve the content area ("hoverContent") from the container.
 * If it doesn't exist, create it.
 */
function getHoverContentContainer(container) {
  let content = container.querySelector("#hoverContent");
  if (!content) {
    content = document.createElement("div");
    content.id = "hoverContent";
    container.appendChild(content);
  }
  return content;
}

/**
 * Create a dark, semi-transparent "glassy" container near the selected text.
 * The container is 600px wide, resizable (both width and height), with a default height of 400px,
 * and a 50px left offset. It consists of a header (with a sticky, draggable, transparent close button)
 * and a content area.
 */
function createHoverContainer() {
  const selection = window.getSelection();
  let topPos = 100, leftPos = 100;
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    topPos = rect.bottom + window.scrollY + 5;
    leftPos = rect.left + window.scrollX + 50;
  }
  const container = document.createElement("div");
  container.id = "openai-hover-container";
  Object.assign(container.style, {
    position: "absolute",
    top: `${topPos}px`,
    left: `${leftPos}px`,
    width: "600px",
    height: "400px",           // Set default height to allow vertical resizing.
    overflow: "auto",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "8px",
    padding: "12px",
    color: "#fff",
    boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
    fontFamily: "sans-serif",
    fontSize: "14px",
    zIndex: 999999,
    resize: "both",          // Allow both horizontal and vertical resizing.
    minWidth: "300px",
    minHeight: "200px"
  });

  // Create a header for the close button.
  const header = document.createElement("div");
  header.id = "hoverHeader";
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: "8px",
    position: "sticky",
    top: "0",
    backgroundColor: "transparent",  // Transparent background.
    zIndex: "10",
    cursor: "move"
  });

  const closeButton = document.createElement("button");
  closeButton.textContent = "X";
  Object.assign(closeButton.style, {
    background: "transparent",
    border: "none",
    color: "#fff",
    fontSize: "16px",
    cursor: "pointer"
  });
  closeButton.addEventListener("click", () => {
    container.remove();
  });
  header.appendChild(closeButton);
  container.appendChild(header);

  // Create an empty content area.
  const content = document.createElement("div");
  content.id = "hoverContent";
  container.appendChild(content);

  document.body.appendChild(container);

  // Make the header draggable.
  makeDraggable(header, container);

  return container;
}

/**
 * Make an element draggable using a specified handle.
 * Here, the header is used as the drag handle for the container.
 */
function makeDraggable(handle, container) {
  let offsetX, offsetY;
  handle.addEventListener("mousedown", function(e) {
    offsetX = e.clientX - container.getBoundingClientRect().left;
    offsetY = e.clientY - container.getBoundingClientRect().top;
    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);
    e.preventDefault();
  });

  function mouseMoveHandler(e) {
    container.style.left = (e.clientX - offsetX) + "px";
    container.style.top = (e.clientY - offsetY) + "px";
  }

  function mouseUpHandler(e) {
    document.removeEventListener("mousemove", mouseMoveHandler);
    document.removeEventListener("mouseup", mouseUpHandler);
  }
}

/**
 * Clear the 30-second timeout if a response arrives.
 */
function clearTimeoutIfNeeded() {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
}

/**
 * Event handler for the send button.
 * 1) Appends the user's new message to the conversation.
 * 2) Rerenders the conversation.
 * 3) Shows a small loading indicator.
 * 4) Sends the updated conversation history to the background.
 */
function sendChatMessage() {
  const container = getOrCreateHoverContainer();
  const chatInput = container.querySelector("#chatInput");
  if (!chatInput) return;
  const newMessage = chatInput.value.trim();
  if (!newMessage) return;

  conversationHistory.push({ role: "user", content: newMessage });
  showConversation();
  chatInput.value = "";
  showLoadingIndicator();

  chrome.runtime.sendMessage(
    {
      type: "CONTINUE_CONVERSATION",
      payload: { conversationHistory }
    },
    (response) => {
      if (chrome.runtime.lastError) {
        showHoverError(chrome.runtime.lastError.message);
      }
      // Background replies via a "CONTINUE_RESPONSE" message.
    }
  );
}

/**
 * Append a small "Loading…" indicator at the bottom of the content area.
 */
function showLoadingIndicator() {
  const container = getOrCreateHoverContainer();
  const content = getHoverContentContainer(container);
  let loadingIndicator = content.querySelector("#loadingIndicator");
  if (!loadingIndicator) {
    loadingIndicator = document.createElement("div");
    loadingIndicator.id = "loadingIndicator";
    loadingIndicator.style.marginTop = "10px";
    loadingIndicator.innerHTML = `<em>Loading…</em>`;
    content.appendChild(loadingIndicator);
  }
  timeoutTimer = setTimeout(() => {
    showHoverError("Request timed out (30s).");
  }, 30000);
}
