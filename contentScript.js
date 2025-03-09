// Enable line breaks in Marked globally.
marked.setOptions({
  breaks: true,
});

// After marked.setOptions, inject loading animation CSS
if (!document.getElementById("loading-style")) {
  const style = document.createElement("style");
  style.id = "loading-style";
  style.textContent = `
    @keyframes loadingDots {
      0% { opacity: 0; }
      33% { opacity: 0.5; }
      66% { opacity: 1; }
      100% { opacity: 0; }
    }
    .loading-animation {
      display: inline-block;
    }
    .loading-animation span {
      animation: loadingDots 1.5s infinite;
      display: inline-block;
    }
    .loading-animation span:nth-child(2) {
      animation-delay: 0.3s;
    }
    .loading-animation span:nth-child(3) {
      animation-delay: 0.6s;
    }
  `;
  document.head.appendChild(style);
}

// Conversation history is now an object containing messages and metadata.
let conversationHistory = null; // { messages: [...], apiKey: string, model: string }
let timeoutTimer = null;

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case "SHOW_LOADING":
      conversationHistory = null; // reset conversation when loading new result
      showHoverLoading();
      break;
    case "SHOW_RESULT":
      // On initial result, initialize conversation history from payload if available.
      if (message.payload.conversationHistory) {
        conversationHistory = message.payload.conversationHistory;
      } else {
        conversationHistory = {
          messages: [
            { role: "user", content: message.payload.initialUserPrompt },
            { role: "assistant", content: message.payload.text }
          ],
          apiKey: message.payload.apiKey || null,
          model: message.payload.model || null
        };
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
        if (conversationHistory && conversationHistory.messages) {
          const lastMsg = conversationHistory.messages[conversationHistory.messages.length - 1];
          if (lastMsg && lastMsg.role === "assistant" && lastMsg.content === "__LOADING__") {
            lastMsg.content = message.payload.responseText;
          } else {
            conversationHistory.messages.push({ role: "assistant", content: message.payload.responseText });
          }
        }
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
 *
 * Each bubble has a "Copy" button at the end (bottom) of the bubble.
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

  conversationHistory.messages.forEach((msg) => {
    // Create a row (one chat bubble).
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.marginBottom = "8px";

    const bubble = document.createElement("div");
    bubble.style.position = "relative";
    bubble.style.padding = "8px 12px";
    bubble.style.borderRadius = "16px";
    bubble.style.maxWidth = "80%";
    bubble.style.wordWrap = "break-word";

    // Render message: if loading, show animated dots
    let renderedContent;
    if (msg.content === "__LOADING__") {
      renderedContent = '<span class="loading-animation"><span>.</span><span>.</span><span>.</span></span>';
    } else {
      renderedContent = marked.parse(msg.content, { breaks: true });
    }
    
    if (msg.role === "assistant") {
      row.style.justifyContent = "flex-start";
      bubble.style.backgroundColor = "#004080"; // Assistant bubble: dark blue
      bubble.style.color = "#fff";
    } else if (msg.role === "user") {
      row.style.justifyContent = "flex-end";
      bubble.style.backgroundColor = "green"; // Updated user bubble: green background
      bubble.style.color = "#fff";
    }
    
    // Insert the rendered HTML into the bubble.
    bubble.innerHTML = renderedContent;

    // Begin changes: Only add copy button if message is from assistant
    if (msg.role === "assistant") {
      // --- Add "Copy" button at the end (bottom) of the bubble ---
      const copyContainer = document.createElement("div");
      Object.assign(copyContainer.style, {
        display: "flex",
        justifyContent: "flex-end",
        marginTop: "8px"
      });

      const copyButton = document.createElement("button");
      copyButton.textContent = "Copy";
      Object.assign(copyButton.style, {
        backgroundColor: "transparent",
        border: "1px solid #fff",
        color: "#fff",
        borderRadius: "4px",
        padding: "4px 8px",
        cursor: "pointer",
        fontSize: "14px",
        opacity: "0.9"
      });
      copyButton.title = "Copy to clipboard";
      copyButton.addEventListener("click", () => {
        // Copy the bubble's *visible text* to clipboard.
        const textToCopy = bubble.innerText;
        navigator.clipboard.writeText(textToCopy).then(() => {
          copyButton.textContent = "Copied!";
          setTimeout(() => {
            copyButton.textContent = "Copy";
          }, 1500);
        });
      });
      copyContainer.appendChild(copyButton);
      bubble.appendChild(copyContainer);
    }
    // End changes

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
 * The container includes a header (always visible for dragging and closing) and a scrollable content area.
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
    Object.assign(content.style, {
      overflowY: "auto",
      overflowX: "hidden",
      height: "calc(100% - 48px)"  // Adjust height relative to header (40px height + 8px marginBottom)
    });
    container.appendChild(content);
  }
  return content;
}

/**
 * Create a dark, semi-transparent "glassy" container near the selected text.
 * The container is 600px wide and 400px tall, with a header (fixed at the top) and a scrollable content area.
 * The header contains the close button and serves as the drag handle.
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
    height: "400px",           // Fixed height
    backgroundColor: "rgba(255, 254, 254, 0.1)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "8px",
    padding: "12px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
    fontFamily: "sans-serif",
    fontSize: "14px",
    overflow: "auto",
    zIndex: 999999,
    resize: "both",          // Allow both horizontal and vertical resizing.
    minWidth: "300px",
    minHeight: "200px",
    boxSizing: "border-box"
  });

  // Create header (for dragging and close button).
  const header = document.createElement("div");
  header.id = "hoverHeader";
  Object.assign(header.style, {
    height: "40px", // Fixed header height
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: "transparent",
    position: "relative",
    marginBottom: "8px",
    cursor: "move"
  });

  // Create the close button inside the header.
  const closeButton = document.createElement("button");
  closeButton.textContent = "X";
  Object.assign(closeButton.style, {
    background: "transparent",
    border: "none",
    fontSize: "16px",
    cursor: "pointer",
    color: "white",
    mixBlendMode: "difference", // White becomes black on white backgrounds.
    zIndex: "11"
  });
  closeButton.addEventListener("click", () => {
    container.remove();
  });
  header.appendChild(closeButton);
  container.appendChild(header);

  // Create the scrollable content area.
  const content = document.createElement("div");
  content.id = "hoverContent";
  Object.assign(content.style, {
    overflowY: "auto",
    overflowX: "hidden",
    height: "calc(100% - 48px)"  // Adjust height relative to header (40px height + 8px marginBottom)
  });
  container.appendChild(content);

  document.body.appendChild(container);

  // Make the header draggable.
  makeDraggable(header, container);

  return container;
}

/**
 * Make an element draggable using a specified handle.
 * The header is used as the drag handle for the container.
 * The drag calculations add the window's scroll offsets to position the container accurately.
 */
function makeDraggable(handle, container) {
  let offsetX, offsetY;
  handle.addEventListener("mousedown", function(e) {
    const rect = container.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);
    e.preventDefault();
  });

  function mouseMoveHandler(e) {
    container.style.left = (e.clientX - offsetX + window.scrollX) + "px";
    container.style.top = (e.clientY - offsetY + window.scrollY) + "px";
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

  // Append the user's message to the conversation history.
  conversationHistory.messages.push({ role: "user", content: newMessage });
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
    Object.assign(loadingIndicator.style, {
      mixBlendMode: "difference",
      color: "white",
      textShadow: "0 0 2px rgba(0,0,0,0.8)"
    });
    loadingIndicator.innerHTML = `<em>Loading…</em>`;
    content.appendChild(loadingIndicator);
  }
  timeoutTimer = setTimeout(() => {
    showHoverError("Request timed out (30s).");
  }, 30000);
}
