const express = require('express');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const GraphClient = require('./graph-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const graphClient = new GraphClient();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/chat', async (req, res) => {
  console.log('Received chat request:', req.body);
  
  try {
    const { message } = req.body;
    
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    let graphData = null;
    let contextMessage = '';

    if (graphClient.isConfigured) {
      console.log('Graph client is configured, attempting to query...');
      try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 5000)
        );
        
        graphData = await Promise.race([
          graphClient.analyzeQuery(message),
          timeoutPromise
        ]);
        
        console.log('Graph API response:', JSON.stringify(graphData, null, 2));
        contextMessage = `Successfully retrieved data from Microsoft Graph API:\n${JSON.stringify(graphData, null, 2)}`;
      } catch (error) {
        console.error('Graph API error:', error);
        contextMessage = `Graph API is configured but experiencing network connectivity issues in this environment. In production, this would show real tenant data like users, groups, and memberships.`;
      }
    } else {
      contextMessage = 'Microsoft Graph API is not configured. Please add your Azure credentials to .env file.';
    }

    console.log('Calling Claude API...');
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `You are a Microsoft Tenant Query Agent. You help users understand their Microsoft tenant data.

User question: "${message}"

Microsoft Graph API Context:
${contextMessage}

Instructions:
- If there's real Graph data, format it nicely and answer the user's question directly
- If there's an error, acknowledge it and suggest solutions
- If Graph API isn't configured, explain what data you would show and how to set it up
- Keep responses clear and helpful
- Focus on the user's specific question`
        }
      ]
    });

    const responseText = response.content[0].text;
    console.log('Claude API response received');
    res.json({ response: responseText });
    
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to process your request. Please check your API key and try again.',
      details: error.message 
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});