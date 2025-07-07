class ChatInterface {
    constructor() {
        this.messagesContainer = document.getElementById('messages');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        
        this.init();
    }

    init() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        this.addWelcomeMessage();
    }

    addWelcomeMessage() {
        const welcomeMessage = "Welcome to the Microsoft Tenant Query Agent! Ask me questions about your Microsoft tenant, such as:\n\n• \"Show me all users in my tenant\"\n• \"List all groups\"\n• \"Does user john@company.com exist?\"\n• \"Show me members of the Marketing group\"";
        this.addMessage(welcomeMessage, 'assistant');
    }

    sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;

        this.addMessage(message, 'user');
        this.messageInput.value = '';
        this.showTypingIndicator();

        setTimeout(() => {
            this.hideTypingIndicator();
            this.handleResponse(message);
        }, 1000);
    }

    async handleResponse(userMessage) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: userMessage })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.addMessage(data.response, 'assistant');
        } catch (error) {
            console.error('Error calling API:', error);
            this.addMessage('Sorry, I encountered an error processing your request. Please check the console for details.', 'assistant');
        }
    }

    addMessage(content, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.innerHTML = content.replace(/\n/g, '<br>');
        
        messageDiv.appendChild(messageContent);
        this.messagesContainer.appendChild(messageDiv);
        
        this.scrollToBottom();
    }

    showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant typing-indicator';
        typingDiv.id = 'typing-indicator';
        
        const typingContent = document.createElement('div');
        typingContent.className = 'message-content';
        typingContent.innerHTML = `
            <span>Thinking</span>
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        typingDiv.appendChild(typingContent);
        this.messagesContainer.appendChild(typingDiv);
        
        this.scrollToBottom();
        this.sendButton.disabled = true;
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
        this.sendButton.disabled = false;
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChatInterface();
});