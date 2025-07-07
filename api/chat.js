const Anthropic = require('@anthropic-ai/sdk');
const GraphClient = require('../graph-client');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const graphClient = new GraphClient();

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
        contextMessage = `Graph API is configured but experiencing connectivity issues. In production, this would show real tenant data like users, groups, and memberships.`;
      }
    } else {
      contextMessage = 'Microsoft Graph API is not configured. Please add your Azure credentials to environment variables.';
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
}