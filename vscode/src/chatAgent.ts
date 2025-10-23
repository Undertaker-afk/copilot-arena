import * as vscode from 'vscode';
import { ContextManager } from './contextManager';
import axios from 'axios';

/**
 * Represents a chat message
 */
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    model?: string;
}

/**
 * Chat agent for communicating with LLMs
 */
export class ChatAgent {
    private contextManager: ContextManager;
    private conversationHistory: ChatMessage[] = [];
    private serverUrl: string;
    private currentModel: string = 'gpt-4';

    constructor(contextManager: ContextManager) {
        this.contextManager = contextManager;
        const config = vscode.workspace.getConfiguration('arena');
        this.serverUrl = config.get<string>('serverUrl') || 'https://code-arena.fly.dev';
    }

    /**
     * Send a message to the chat agent
     */
    async sendMessage(
        userMessage: string,
        onProgress?: (chunk: string) => void
    ): Promise<string> {
        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage,
            timestamp: new Date()
        });

        // Build the context
        const contextString = this.contextManager.getContextString();
        const workspaceInfo = await this.contextManager.getWorkspaceInfo();

        // Build system message
        const systemMessage = `You are an expert AI coding assistant integrated into VS Code.
You have access to the following workspace information:
${workspaceInfo}

${contextString ? `Additional context:\n${contextString}` : ''}

Provide clear, concise, and accurate responses. When providing code, use proper markdown formatting with language specifiers.`;

        // Prepare messages for API
        const messages = [
            { role: 'system', content: systemMessage },
            ...this.conversationHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            }))
        ];

        try {
            // Call the Arena API
            const response = await this.callArenaAPI(messages, onProgress);
            
            // Add assistant response to history
            this.conversationHistory.push({
                role: 'assistant',
                content: response,
                timestamp: new Date(),
                model: this.currentModel
            });

            return response;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Chat error: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Call the Arena API for chat completion
     */
    private async callArenaAPI(
        messages: Array<{role: string, content: string}>,
        onProgress?: (chunk: string) => void
    ): Promise<string> {
        try {
            // For now, use a simple chat endpoint
            // You may need to adjust this based on your actual API structure
            const response = await axios.post(
                `${this.serverUrl}/v1/chat/completions`,
                {
                    model: this.currentModel,
                    messages: messages,
                    stream: !!onProgress,
                    max_tokens: 2000,
                    temperature: 0.7
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                }
            );

            if (response.data && response.data.choices && response.data.choices[0]) {
                return response.data.choices[0].message.content;
            }

            throw new Error('Invalid response from API');
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`API Error: ${error.response?.data?.error || error.message}`);
            }
            throw error;
        }
    }

    /**
     * Get conversation history
     */
    getHistory(): ChatMessage[] {
        return [...this.conversationHistory];
    }

    /**
     * Clear conversation history
     */
    clearHistory(): void {
        this.conversationHistory = [];
    }

    /**
     * Set the current model
     */
    setModel(model: string): void {
        this.currentModel = model;
    }

    /**
     * Get the current model
     */
    getModel(): string {
        return this.currentModel;
    }

    /**
     * Get available models
     */
    getAvailableModels(): string[] {
        return [
            'gpt-4',
            'gpt-3.5-turbo',
            'claude-3-opus',
            'claude-3-sonnet',
            'deepseek-coder',
            'codestral'
        ];
    }

    /**
     * Export conversation
     */
    exportConversation(): string {
        let markdown = '# Chat Conversation\n\n';
        markdown += `Date: ${new Date().toLocaleString()}\n\n`;

        for (const message of this.conversationHistory) {
            const timestamp = message.timestamp.toLocaleTimeString();
            const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
            const model = message.model ? ` (${message.model})` : '';
            
            markdown += `## ${role}${model} - ${timestamp}\n\n`;
            markdown += `${message.content}\n\n`;
            markdown += '---\n\n';
        }

        return markdown;
    }

    /**
     * Regenerate last response
     */
    async regenerateLastResponse(onProgress?: (chunk: string) => void): Promise<string> {
        if (this.conversationHistory.length < 2) {
            throw new Error('No previous response to regenerate');
        }

        // Remove last assistant message
        this.conversationHistory.pop();

        // Get the last user message
        const lastUserMessage = this.conversationHistory[this.conversationHistory.length - 1];
        if (lastUserMessage.role !== 'user') {
            throw new Error('Last message is not a user message');
        }

        // Remove it from history temporarily
        this.conversationHistory.pop();

        // Resend with the same message
        return await this.sendMessage(lastUserMessage.content, onProgress);
    }
}
