/**
 * Batchit API Client - Proxies domain checks through hosted API
 * Zero setup for users - no Namecheap credentials needed
 */

export class BatchitClient {
  constructor(config) {
    this.apiUrl = config.apiUrl || process.env.BATCHIT_API_URL;

    if (!this.apiUrl) {
      throw new Error('Batchit API URL not configured');
    }
  }

  /**
   * Check domain availability via Batchit API
   * @param {string[]} domains - Array of domain names to check
   * @returns {Object} - Domain availability results
   */
  async checkDomains(domains) {
    try {
      const response = await fetch(`${this.apiUrl}/api/namecheap/check-domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ domains })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Batchit API request failed');
      }

      const data = await response.json();
      return data.results;

    } catch (error) {
      throw new Error(`Batchit API Error: ${error.message}`);
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      return await response.json();
    } catch (error) {
      throw new Error(`Batchit health check failed: ${error.message}`);
    }
  }
}
