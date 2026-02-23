import axios from 'axios';

/**
 * Fetches company logo URL from a domain name.
 * Strategy (in order):
 * 1) Clearbit Logo API          https://logo.clearbit.com/{domain}
 * 2) DuckDuckGo favicon API     https://icons.duckduckgo.com/ip3/{domain}.ico
 * 3) Site favicon               https://{domain}/favicon.ico
 */
export async function fetchCompanyLogo(domain: string): Promise<string | null> {
  if (!domain) return null;
  
  try {
    // Clean domain - remove protocol and www
    let cleanDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .toLowerCase();

    const candidates = [
      // Clearbit (usually a nice, high-res logo)
      `https://logo.clearbit.com/${cleanDomain}`,
      // DuckDuckGo favicon proxy (falls back to site favicon)
      `https://icons.duckduckgo.com/ip3/${cleanDomain}.ico`,
      // Direct site favicon
      `https://${cleanDomain}/favicon.ico`
    ];

    for (const url of candidates) {
      try {
        const response = await axios.head(url, { timeout: 3000 });
        if (response.status === 200) {
          return url;
        }
      } catch {
        // Try next candidate
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching company logo:', error);
    return null;
  }
}

/**
 * Fetches basic company information
 * This is a placeholder - you can integrate with APIs like Clearbit, Hunter.io, etc.
 * For now, returns null values that can be filled manually
 */
export async function fetchCompanyInfo(domain: string, companyName: string): Promise<{
  employee_count: number | null;
  company_size: string | null;
  industry: string | null;
}> {
  // Placeholder - in production, you could integrate with:
  // - Clearbit Enrichment API (requires API key)
  // - Hunter.io Company Enrichment API (requires API key)
  // - LinkedIn API (requires OAuth)
  
  // For now, return nulls - users can fill this manually
  // You can add API integration here if you get API keys
  return {
    employee_count: null,
    company_size: null,
    industry: null
  };
}
