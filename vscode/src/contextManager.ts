import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Represents a context item that can be attached to chat messages
 */
export interface ContextItem {
    type: 'file' | 'symbol' | 'selection' | 'terminal';
    label: string;
    description?: string;
    uri?: vscode.Uri;
    range?: vscode.Range;
    content?: string;
    language?: string;
}

/**
 * Manages context for the chat agent
 */
export class ContextManager {
    private contextItems: Map<string, ContextItem> = new Map();
    private maxContextSize: number = 10000; // Max characters

    constructor() {}

    /**
     * Add a file to the context
     */
    async addFile(uri: vscode.Uri): Promise<void> {
        const document = await vscode.workspace.openTextDocument(uri);
        const content = document.getText();
        const relativePath = vscode.workspace.asRelativePath(uri);
        
        const contextItem: ContextItem = {
            type: 'file',
            label: path.basename(uri.fsPath),
            description: relativePath,
            uri: uri,
            content: content,
            language: document.languageId
        };

        this.contextItems.set(uri.toString(), contextItem);
    }

    /**
     * Add current selection to context
     */
    async addSelection(editor: vscode.TextEditor): Promise<void> {
        const selection = editor.selection;
        if (selection.isEmpty) {
            return;
        }

        const selectedText = editor.document.getText(selection);
        const uri = editor.document.uri;
        const relativePath = vscode.workspace.asRelativePath(uri);

        const contextItem: ContextItem = {
            type: 'selection',
            label: `Selection from ${path.basename(uri.fsPath)}`,
            description: `${relativePath} (Lines ${selection.start.line + 1}-${selection.end.line + 1})`,
            uri: uri,
            range: selection,
            content: selectedText,
            language: editor.document.languageId
        };

        const key = `selection-${uri.toString()}-${selection.start.line}-${selection.end.line}`;
        this.contextItems.set(key, contextItem);
    }

    /**
     * Add a symbol (function, class, etc.) to context
     */
    async addSymbol(symbol: vscode.DocumentSymbol, uri: vscode.Uri): Promise<void> {
        const document = await vscode.workspace.openTextDocument(uri);
        const content = document.getText(symbol.range);
        const relativePath = vscode.workspace.asRelativePath(uri);

        const contextItem: ContextItem = {
            type: 'symbol',
            label: symbol.name,
            description: `${vscode.SymbolKind[symbol.kind]} in ${relativePath}`,
            uri: uri,
            range: symbol.range,
            content: content,
            language: document.languageId
        };

        const key = `symbol-${uri.toString()}-${symbol.name}`;
        this.contextItems.set(key, contextItem);
    }

    /**
     * Add terminal output to context
     */
    addTerminalOutput(output: string): void {
        const contextItem: ContextItem = {
            type: 'terminal',
            label: 'Terminal Output',
            content: output.substring(0, 1000) // Limit terminal output
        };

        this.contextItems.set('terminal-latest', contextItem);
    }

    /**
     * Get all context items
     */
    getContextItems(): ContextItem[] {
        return Array.from(this.contextItems.values());
    }

    /**
     * Remove a context item by key
     */
    removeContextItem(key: string): void {
        this.contextItems.delete(key);
    }

    /**
     * Clear all context
     */
    clearContext(): void {
        this.contextItems.clear();
    }

    /**
     * Get context as formatted string for LLM
     */
    getContextString(): string {
        let contextString = '';
        let currentSize = 0;

        for (const item of this.contextItems.values()) {
            let itemString = '';

            switch (item.type) {
                case 'file':
                    itemString = `\n## File: ${item.description}\n\`\`\`${item.language}\n${item.content}\n\`\`\`\n`;
                    break;
                case 'selection':
                    itemString = `\n## ${item.label}\n${item.description}\n\`\`\`${item.language}\n${item.content}\n\`\`\`\n`;
                    break;
                case 'symbol':
                    itemString = `\n## ${item.description}\n\`\`\`${item.language}\n${item.content}\n\`\`\`\n`;
                    break;
                case 'terminal':
                    itemString = `\n## Terminal Output\n\`\`\`\n${item.content}\n\`\`\`\n`;
                    break;
            }

            if (currentSize + itemString.length > this.maxContextSize) {
                break; // Stop if context size limit exceeded
            }

            contextString += itemString;
            currentSize += itemString.length;
        }

        return contextString;
    }

    /**
     * Get workspace information
     */
    async getWorkspaceInfo(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return 'No workspace folder open.';
        }

        let info = `Workspace: ${workspaceFolders[0].name}\n`;
        info += `Path: ${workspaceFolders[0].uri.fsPath}\n`;

        // Try to detect project type
        const packageJsonUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'package.json');
        const requirementsUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'requirements.txt');
        const cargoUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'Cargo.toml');

        try {
            await vscode.workspace.fs.stat(packageJsonUri);
            info += 'Project Type: Node.js/JavaScript\n';
        } catch {
            // File doesn't exist
        }

        try {
            await vscode.workspace.fs.stat(requirementsUri);
            info += 'Project Type: Python\n';
        } catch {
            // File doesn't exist
        }

        try {
            await vscode.workspace.fs.stat(cargoUri);
            info += 'Project Type: Rust\n';
        } catch {
            // File doesn't exist
        }

        return info;
    }

    /**
     * Get summary of context items for display
     */
    getContextSummary(): Array<{key: string, item: ContextItem}> {
        return Array.from(this.contextItems.entries()).map(([key, item]) => ({
            key,
            item
        }));
    }
}
