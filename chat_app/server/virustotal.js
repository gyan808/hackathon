// server/virustotal.js
const axios = require('axios');
const FormData = require('form-data');

class VirusTotalService {
  constructor() {
    this.apiKey = process.env.VIRUSTOTAL_API_KEY;
    this.baseURL = 'https://www.virustotal.com/api/v3';
    
    if (this.apiKey) {
      console.log('🛡️ VirusTotal API key loaded successfully');
    } else {
      console.warn('⚠️ VirusTotal API key not found. Using pattern detection only.');
    }
  }

  // Scan a file
  async scanFile(fileBuffer, filename) {
    if (!this.apiKey) {
      console.log('🛡️ VirusTotal scanning skipped (no API key)');
      return null;
    }

    try {
      console.log(`🔍 Scanning file: ${filename}`);
      
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename });

      const response = await axios.post(`${this.baseURL}/files`, formData, {
        headers: {
          'x-apikey': this.apiKey,
          ...formData.getHeaders()
        },
        timeout: 30000
      });

      const analysisId = response.data.data.id;
      console.log(`📊 File submitted for analysis: ${analysisId}`);
      
      await this.sleep(15000);
      return await this.getAnalysisResults(analysisId);

    } catch (error) {
      console.error('❌ VirusTotal file scan error:', error.response?.data || error.message);
      return null;
    }
  }

  // Quick URL reputation check
  async quickURLCheck(url) {
    if (!this.apiKey) {
      console.log('🛡️ VirusTotal URL check skipped (no API key)');
      return null;
    }

    try {
      console.log(`🔍 Quick check for URL: ${url}`);
      
      let domain;
      try {
        domain = new URL(url).hostname;
      } catch {
        domain = url;
      }

      const response = await axios.get(`${this.baseURL}/domains/${domain}`, {
        headers: {
          'x-apikey': this.apiKey
        },
        timeout: 10000
      });

      const reputation = response.data.data.attributes.last_analysis_stats;
      console.log(`📊 URL reputation:`, reputation);
      
      return {
        malicious: reputation.malicious,
        suspicious: reputation.suspicious,
        harmless: reputation.harmless,
        undetected: reputation.undetected,
        type: 'reputation_check'
      };

    } catch (error) {
      console.error('❌ VirusTotal quick check error:', error.message);
      return null;
    }
  }

  // Get analysis results
  async getAnalysisResults(analysisId) {
    try {
      const response = await axios.get(`${this.baseURL}/analyses/${analysisId}`, {
        headers: {
          'x-apikey': this.apiKey
        }
      });

      const results = response.data.data.attributes;
      const stats = results.stats;
      
      return {
        malicious: stats.malicious,
        suspicious: stats.suspicious,
        undetected: stats.undetected,
        harmless: stats.harmless,
        timeout: stats.timeout,
        totalEngines: Object.keys(results.results || {}).length,
        status: results.status
      };

    } catch (error) {
      console.error('❌ VirusTotal analysis error:', error.message);
      return null;
    }
  }

  // Pattern detection for suspicious content
  patternScan(content, type) {
    const suspiciousPatterns = [
      'virus', 'malware', 'trojan', 'ransomware', 'keylogger',
      '.exe', '.msi', '.bat', '.cmd', '.scr', '.dll',
      'crack', 'keygen', 'serial', 'patch', 'pirate',
      'hack', 'exploit', 'bypass', 'cheat', 'trainer',
      'free.download', 'installer', 'nulled', 'warez'
    ];

    let detectedPatterns = [];
    
    for (let pattern of suspiciousPatterns) {
      if (content.toLowerCase().includes(pattern)) {
        detectedPatterns.push(pattern);
      }
    }

    if (detectedPatterns.length > 0) {
      console.log(`🚫 Pattern detection found: ${detectedPatterns.join(', ')}`);
      return {
        malicious: detectedPatterns.length,
        suspicious: 0,
        harmless: 0,
        undetected: 0,
        detectedPatterns: detectedPatterns,
        simulated: true
      };
    }

    return {
      malicious: 0,
      suspicious: 0,
      harmless: 1,
      undetected: 0,
      simulated: true
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Check if content is safe
  isSafe(scanResult, threshold = 1) {
    if (!scanResult) return true; // If scan fails, assume safe to not break chat
    return scanResult.malicious < threshold && scanResult.suspicious === 0;
  }
}

module.exports = new VirusTotalService();