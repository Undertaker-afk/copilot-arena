// Chat UI Script
(function() {
    const vscode = acquireVsCodeApi();
    
    let currentState = {
        messages: [],
        contextItems: [],
        currentModel: 'gpt-4',
        availableModels: [],
        isLoading: false
    };

    // DOM Elements
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const messagesContainer = document.getElementById('messages');
    const contextItemsContainer = document.getElementById('contextItems');
    const modelSelect = document.getElementById('modelSelect');
    const clearBtn = document.getElementById('clearBtn');
    const exportBtn = document.getElementById('exportBtn');
    const addFileBtn = document.getElementById('addFileBtn');
    const addSelectionBtn = document.getElementById('addSelectionBtn');
    const clearContextBtn = document.getElementById('clearContextBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');

    // Event Listeners
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    });

    clearBtn.addEventListener('click', () => {
        if (confirm('Clear all messages?')) {
            vscode.postMessage({ type: 'clearChat' });
        }
    });

    exportBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'exportChat' });
    });

    modelSelect.addEventListener('change', (e) => {
        vscode.postMessage({ 
            type: 'changeModel', 
            model: e.target.value 
        });
    });

    addFileBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'addCurrentFile' });
    });

    addSelectionBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'addSelection' });
    });

    clearContextBtn.addEventListener('click', () => {
        if (confirm('Clear all context?')) {
            vscode.postMessage({ type: 'clearContext' });
        }
    });

    // Send Message
    function sendMessage() {
        const message = messageInput.value.trim();
        if (!message || currentState.isLoading) {
            return;
        }

        vscode.postMessage({
            type: 'sendMessage',
            message: message
        });

        messageInput.value = '';
        messageInput.style.height = 'auto';
    }

    // Render Messages
    function renderMessages(messages) {
        // Remove welcome message if there are messages
        if (messages.length > 0) {
            const welcomeMsg = messagesContainer.querySelector('.welcome-message');
            if (welcomeMsg) {
                welcomeMsg.remove();
            }
        }

        // Clear and render all messages
        messagesContainer.innerHTML = '';
        
        messages.forEach((msg, index) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message message-${msg.role}`;
            
            const icon = msg.role === 'user' ? '👤' : '🤖';
            const timestamp = new Date(msg.timestamp).toLocaleTimeString();
            
            messageDiv.innerHTML = `
                <div class="message-icon">${icon}</div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-role">${msg.role}</span>
                        <div class="message-meta">
                            ${msg.model ? `<span>${msg.model}</span>` : ''}
                            <span>${timestamp}</span>
                        </div>
                    </div>
                    <div class="message-text">${formatMessageContent(msg.content)}</div>
                    ${msg.role === 'assistant' ? `
                        <div class="message-actions">
                            <button class="message-action-btn copy-btn" data-index="${index}">
                                <span class="codicon codicon-copy"></span> Copy
                            </button>
                            ${index === messages.length - 1 ? `
                                <button class="message-action-btn regenerate-btn">
                                    <span class="codicon codicon-refresh"></span> Regenerate
                                </button>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
            
            messagesContainer.appendChild(messageDiv);
        });

        // Add event listeners to action buttons
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                copyToClipboard(messages[index].content);
            });
        });

        document.querySelectorAll('.regenerate-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                vscode.postMessage({ type: 'regenerate' });
            });
        });

        // Add event listeners to code copy buttons
        document.querySelectorAll('.copy-code-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const code = e.currentTarget.dataset.code;
                copyToClipboard(code);
                e.currentTarget.textContent = 'Copied!';
                setTimeout(() => {
                    e.currentTarget.textContent = 'Copy';
                }, 2000);
            });
        });

        document.querySelectorAll('.insert-code-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const code = e.currentTarget.dataset.code;
                vscode.postMessage({ 
                    type: 'insertCode',
                    code: code
                });
            });
        });

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Format message content (basic markdown)
    function formatMessageContent(content) {
        // Escape HTML
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Code blocks with language
        formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'plaintext';
            return `
                <div class="code-block-wrapper">
                    <div class="code-block-header">
                        <span>${language}</span>
                        <div>
                            <button class="copy-code-btn" data-code="${escapeHtml(code)}">Copy</button>
                            <button class="insert-code-btn message-action-btn" data-code="${escapeHtml(code)}">
                                <span class="codicon codicon-insert"></span> Insert
                            </button>
                        </div>
                    </div>
                    <pre><code>${escapeHtml(code)}</code></pre>
                </div>
            `;
        });

        // Inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold
        formatted = formatted.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        formatted = formatted.replace(/\*([^\*]+)\*/g, '<em>$1</em>');

        // Line breaks
        formatted = formatted.replace(/\n/g, '<br>');

        return formatted;
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Render Context Items
    function renderContextItems(items) {
        if (items.length === 0) {
            contextItemsContainer.innerHTML = '<div class="context-empty">No context items</div>';
            return;
        }

        contextItemsContainer.innerHTML = '';
        items.forEach(({ key, item }) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'context-item';
            
            const icon = getContextIcon(item.type);
            
            itemDiv.innerHTML = `
                <div class="context-item-info">
                    <div class="context-item-label">${icon} ${item.label}</div>
                    ${item.description ? `<div class="context-item-description">${item.description}</div>` : ''}
                </div>
                <button class="context-item-remove" data-key="${key}" title="Remove">
                    <span class="codicon codicon-close"></span>
                </button>
            `;
            
            contextItemsContainer.appendChild(itemDiv);
        });

        // Add remove listeners
        document.querySelectorAll('.context-item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.currentTarget.dataset.key;
                vscode.postMessage({ 
                    type: 'removeContext',
                    key: key
                });
            });
        });
    }

    function getContextIcon(type) {
        switch (type) {
            case 'file': return '📄';
            case 'selection': return '📝';
            case 'symbol': return '🔧';
            case 'terminal': return '💻';
            default: return '📎';
        }
    }

    // Update Model Select
    function updateModelSelect(models, currentModel) {
        modelSelect.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            if (model === currentModel) {
                option.selected = true;
            }
            modelSelect.appendChild(option);
        });
    }

    // Copy to Clipboard
    function copyToClipboard(text) {
        // Use VS Code API to copy
        vscode.postMessage({
            type: 'copy',
            text: text
        });
        
        // Fallback for display purposes
        navigator.clipboard.writeText(text).catch(err => {
            console.error('Failed to copy:', err);
        });
    }

    // Set Loading State
    function setLoading(loading) {
        currentState.isLoading = loading;
        sendBtn.disabled = loading;
        messageInput.disabled = loading;
        loadingIndicator.style.display = loading ? 'flex' : 'none';
    }

    // Handle Messages from Extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'update':
                currentState.messages = message.messages || [];
                currentState.contextItems = message.contextItems || [];
                currentState.currentModel = message.currentModel || 'gpt-4';
                currentState.availableModels = message.availableModels || [];
                
                renderMessages(currentState.messages);
                renderContextItems(currentState.contextItems);
                updateModelSelect(currentState.availableModels, currentState.currentModel);
                break;
                
            case 'loading':
                setLoading(message.loading);
                break;
                
            case 'error':
                alert('Error: ' + message.error);
                setLoading(false);
                break;
        }
    });

    // Initial focus
    messageInput.focus();
})();
