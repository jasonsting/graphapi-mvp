const axios = require('axios');
const { ConfidentialClientApplication } = require('@azure/msal-node');

class GraphClient {
    constructor() {
        this.tenantId = process.env.AZURE_TENANT_ID;
        this.clientId = process.env.AZURE_CLIENT_ID;
        this.clientSecret = process.env.AZURE_CLIENT_SECRET;
        
        if (!this.tenantId || !this.clientId || !this.clientSecret) {
            console.warn('Microsoft Graph credentials not configured. Graph API will not work.');
            this.isConfigured = false;
            return;
        }

        this.msalConfig = {
            auth: {
                clientId: this.clientId,
                clientSecret: this.clientSecret,
                authority: `https://login.microsoftonline.com/${this.tenantId}`
            }
        };

        this.cca = new ConfidentialClientApplication(this.msalConfig);
        this.isConfigured = true;
        this.accessToken = null;
    }

    async getAccessToken() {
        if (!this.isConfigured) {
            throw new Error('Microsoft Graph client not configured. Please check your environment variables.');
        }

        try {
            const clientCredentialRequest = {
                scopes: ['https://graph.microsoft.com/.default'],
            };

            const response = await this.cca.acquireTokenByClientCredential(clientCredentialRequest);
            this.accessToken = response.accessToken;
            return this.accessToken;
        } catch (error) {
            console.error('Error getting access token:', error);
            throw error;
        }
    }

    async makeGraphRequest(endpoint) {
        if (!this.isConfigured) {
            return { error: 'Microsoft Graph not configured' };
        }

        try {
            if (!this.accessToken) {
                await this.getAccessToken();
            }

            const response = await axios.get(`https://graph.microsoft.com/v1.0${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error) {
            if (error.response?.status === 401) {
                await this.getAccessToken();
                return this.makeGraphRequest(endpoint);
            }
            
            console.error('Graph API Error:', error.response?.data || error.message);
            return { error: error.response?.data?.error?.message || error.message };
        }
    }

    async getUsers(limit = 10) {
        const response = await this.makeGraphRequest(`/users?$top=${limit}&$select=displayName,mail,userPrincipalName,accountEnabled`);
        return response;
    }

    async getGroups(limit = 10) {
        const response = await this.makeGraphRequest(`/groups?$top=${limit}&$select=displayName,description,mail`);
        return response;
    }

    async getUser(userIdOrPrincipalName) {
        const response = await this.makeGraphRequest(`/users/${userIdOrPrincipalName}?$select=displayName,mail,userPrincipalName,accountEnabled`);
        return response;
    }

    async getGroupMembers(groupId) {
        const response = await this.makeGraphRequest(`/groups/${groupId}/members?$select=displayName,mail,userPrincipalName`);
        return response;
    }

    async searchUsers(searchTerm) {
        const response = await this.makeGraphRequest(`/users?$filter=startswith(displayName,'${searchTerm}') or startswith(mail,'${searchTerm}')&$select=displayName,mail,userPrincipalName,accountEnabled`);
        return response;
    }

    async searchGroups(searchTerm) {
        const response = await this.makeGraphRequest(`/groups?$filter=startswith(displayName,'${searchTerm}')&$select=displayName,description,mail`);
        return response;
    }

    async getUserMemberships(userId) {
        const response = await this.makeGraphRequest(`/users/${userId}/memberOf?$select=displayName,description`);
        return response;
    }

    async getUsersWithGroups(limit = 10) {
        const users = await this.getUsers(limit);
        if (users.value) {
            for (let user of users.value) {
                try {
                    const memberships = await this.getUserMemberships(user.id);
                    user.groups = memberships.value || [];
                } catch (error) {
                    console.error(`Error getting groups for user ${user.id}:`, error);
                    user.groups = [];
                }
            }
        }
        return users;
    }

    async analyzeQuery(query) {
        const queryLower = query.toLowerCase();
        
        if (queryLower.includes('all users') || queryLower.includes('list users')) {
            if (queryLower.includes('group') || queryLower.includes('member')) {
                return await this.getUsersWithGroups(20);
            }
            return await this.getUsers(50);
        }
        
        if (queryLower.includes('all groups') || queryLower.includes('list groups')) {
            return await this.getGroups(50);
        }
        
        if (queryLower.includes('members of') || queryLower.includes('group members')) {
            const groupMatch = query.match(/(?:members of|group)\s+['"]?([^'"]+)['"]?/i);
            if (groupMatch) {
                const groupName = groupMatch[1];
                const groups = await this.searchGroups(groupName);
                if (groups.value && groups.value.length > 0) {
                    return await this.getGroupMembers(groups.value[0].id);
                }
            }
        }
        
        if (queryLower.includes('user') && (queryLower.includes('exist') || queryLower.includes('@'))) {
            const emailMatch = query.match(/[\w.-]+@[\w.-]+\.\w+/);
            if (emailMatch) {
                const user = await this.getUser(emailMatch[0]);
                if (user.id) {
                    const memberships = await this.getUserMemberships(user.id);
                    user.groups = memberships.value || [];
                }
                return user;
            }
        }
        
        if (queryLower.includes('environment') || queryLower.includes('contain')) {
            const searchMatch = query.match(/(?:contain|with)\s+['"]?([^'"]+)['"]?/i);
            if (searchMatch) {
                return await this.searchGroups(searchMatch[1]);
            }
        }
        
        // For queries asking about group memberships
        if (queryLower.includes('belongs to') || queryLower.includes('member of') || queryLower.includes('in group')) {
            return await this.getUsersWithGroups(20);
        }
        
        return { message: 'Query not recognized, fetching general tenant info', users: await this.getUsers(5), groups: await this.getGroups(5) };
    }
}

module.exports = GraphClient;