import * as vscode from 'vscode';
import { ChatAgent, ChatMessage } from './chatAgent';
import { ContextManager, ContextItem } from './contextManager';

/**
 * Provider for the chat webview
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'arena.chatView';
    
    private _view?: vscode.WebviewView;
    private chatAgent: ChatAgent;
    private contextManager: ContextManager;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this.contextManager = new ContextManager();
        this.chatAgent = new ChatAgent(this.contextManager);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'),
                vscode.Uri.joinPath(this._extensionUri, 'dist')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleSendMessage(data.message);
                    break;
                case 'clearChat':
                    this.handleClearChat();
                    break;
                case 'addCurrentFile':
                    await this.handleAddCurrentFile();
                    break;
                case 'addSelection':
                    await this.handleAddSelection();
                    break;
                case 'removeContext':
                    this.handleRemoveContext(data.key);
                    break;
                case 'clearContext':
                    this.handleClearContext();
                    break;
                case 'exportChat':
                    this.handleExportChat();
                    break;
                case 'changeModel':
                    this.handleChangeModel(data.model);
                    break;
                case 'regenerate':
                    await this.handleRegenerate();
                    break;
                case 'insertCode':
                    this.handleInsertCode(data.code);
                    break;
            }
        });

        // Send initial state
        this.updateWebview();
    }

    /**
     * Handle sending a message
     */
    private async handleSendMessage(message: string) {
        if (!this._view) {
            return;
        }

        try {
            // Show loading state
            this._view.webview.postMessage({
                type: 'loading',
                loading: true
            });

            // Send message and get response
            const response = await this.chatAgent.sendMessage(message);

            // Update webview with new messages
            this.updateWebview();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this._view.webview.postMessage({
                type: 'error',
                error: errorMessage
            });
        } finally {
            this._view.webview.postMessage({
                type: 'loading',
                loading: false
            });
        }
    }

    /**
     * Handle clearing chat
     */
    private handleClearChat() {
        this.chatAgent.clearHistory();
        this.updateWebview();
        vscode.window.showInformationMessage('Chat cleared');
    }

    /**
     * Handle adding current file to context
     */
    private async handleAddCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        await this.contextManager.addFile(editor.document.uri);
        this.updateWebview();
        vscode.window.showInformationMessage('Added current file to context');
    }

    /**
     * Handle adding selection to context
     */
    private async handleAddSelection() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        if (editor.selection.isEmpty) {
            vscode.window.showWarningMessage('No text selected');
            return;
        }

        await this.contextManager.addSelection(editor);
        this.updateWebview();
        vscode.window.showInformationMessage('Added selection to context');
    }

    /**
     * Handle removing a context item
     */
    private handleRemoveContext(key: string) {
        this.contextManager.removeContextItem(key);
        this.updateWebview();
    }

    /**
     * Handle clearing all context
     */
    private handleClearContext() {
        this.contextManager.clearContext();
        this.updateWebview();
        vscode.window.showInformationMessage('Context cleared');
    }

    /**
     * Handle exporting chat
     */
    private handleExportChat() {
        const markdown = this.chatAgent.exportConversation();
        
        // Create new untitled document with markdown
        vscode.workspace.openTextDocument({
            content: markdown,
            language: 'markdown'
        }).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    }

    /**
     * Handle changing model
     */
    private handleChangeModel(model: string) {
        this.chatAgent.setModel(model);
        this.updateWebview();
        vscode.window.showInformationMessage(`Switched to ${model}`);
    }

    /**
     * Handle regenerating last response
     */
    private async handleRegenerate() {
        if (!this._view) {
            return;
        }

        try {
            this._view.webview.postMessage({
                type: 'loading',
                loading: true
            });

            await this.chatAgent.regenerateLastResponse();
            this.updateWebview();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(errorMessage);
        } finally {
            this._view.webview.postMessage({
                type: 'loading',
                loading: false
            });
        }
    }

    /**
     * Handle inserting code into editor
     */
    private handleInsertCode(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, code);
        });
    }

    /**
     * Update webview with current state
     */
    private updateWebview() {
        if (!this._view) {
            return;
        }

        const messages = this.chatAgent.getHistory();
        const contextItems = this.contextManager.getContextSummary();
        const currentModel = this.chatAgent.getModel();
        const availableModels = this.chatAgent.getAvailableModels();

        this._view.webview.postMessage({
            type: 'update',
            messages: messages,
            contextItems: contextItems,
            currentModel: currentModel,
            availableModels: availableModels
        });
    }

    /**
     * Get HTML for webview
     */
    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css')
        );

        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>Copilot Arena Chat</title>
</head>
<body>
    <div class="chat-container">
        <!-- Header -->
        <div class="chat-header">
            <div class="header-title">
                <span class="title-icon">💬</span>
                <span class="title-text">Arena Chat Agent</span>
            </div>
            <div class="header-actions">
                <select id="modelSelect" class="model-select" title="Select Model">
                    <option value="gpt-4">GPT-4</option>
                </select>
                <button id="exportBtn" class="icon-button" title="Export Chat">
                    <span class="codicon codicon-export"></span>
                </button>
                <button id="clearBtn" class="icon-button" title="Clear Chat">
                    <span class="codicon codicon-clear-all"></span>
                </button>
            </div>
        </div>

        <!-- Context Panel -->
        <div class="context-panel" id="contextPanel">
            <div class="context-header">
                <span class="context-title">📎 Context</span>
                <div class="context-actions">
                    <button id="addFileBtn" class="context-btn" title="Add Current File">
                        <span class="codicon codicon-file-add"></span>
                    </button>
                    <button id="addSelectionBtn" class="context-btn" title="Add Selection">
                        <span class="codicon codicon-selection"></span>
                    </button>
                    <button id="clearContextBtn" class="context-btn" title="Clear Context">
                        <span class="codicon codicon-close"></span>
                    </button>
                </div>
            </div>
            <div class="context-items" id="contextItems">
                <div class="context-empty">No context items</div>
            </div>
        </div>

        <!-- Messages -->
        <div class="messages" id="messages">
            <div class="welcome-message">
                <h3>👋 Welcome to Arena Chat Agent!</h3>
                <p>I'm your AI coding assistant. Ask me anything about your code!</p>
                <div class="welcome-tips">
                    <p><strong>Tips:</strong></p>
                    <ul>
                        <li>Add files or selections to give me context</li>
                        <li>Ask me to explain, refactor, or debug code</li>
                        <li>Request code examples and best practices</li>
                    </ul>
                </div>
            </div>
        </div>

        <!-- Input Area -->
        <div class="input-container">
            <div class="input-wrapper">
                <textarea 
                    id="messageInput" 
                    class="message-input" 
                    placeholder="Ask a question or describe what you need..."
                    rows="1"
                ></textarea>
                <button id="sendBtn" class="send-button" title="Send Message">
                    <span class="codicon codicon-send"></span>
                </button>
            </div>
        </div>

        <!-- Loading Indicator -->
        <div class="loading-indicator" id="loadingIndicator" style="display: none;">
            <div class="loading-spinner"></div>
            <span>Thinking...</span>
        </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Public method to send a message from outside
     */
    public async sendMessage(message: string) {
        await this.handleSendMessage(message);
    }

    /**
     * Public method to add current file to context
     */
    public async addCurrentFileToContext() {
        await this.handleAddCurrentFile();
    }

    /**
     * Public method to add selection to context
     */
    public async addSelectionToContext() {
        await this.handleAddSelection();
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
