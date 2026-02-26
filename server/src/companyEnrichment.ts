import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

/**
 * Fetches company logo URL from a domain name, and optionally saves it locally.
 * Strategy (in order):
 * 1) Clearbit Logo API          https://logo.clearbit.com/{domain}
 * 2) DuckDuckGo favicon API     https://icons.duckduckgo.com/ip3/{domain}.ico
 * 3) Google S2 Favicon API      https://www.google.com/s2/favicons?domain={domain}&sz=128
 * 4) Site favicon               https://{domain}/favicon.ico
 */
export async function fetchCompanyLogo(domain: string, uploadsPath?: string): Promise<string | null> {
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
      // Google S2 Favicon Proxy (very reliable fallback)
      `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=128`,
      // Direct site favicon
      `https://${cleanDomain}/favicon.ico`
    ];

    for (const url of candidates) {
      try {
        const response = await axios.head(url, { timeout: 3000 });
        if (response.status === 200) {
          // If a local uploads path is configured, download the image
          if (uploadsPath) {
            const logosDir = path.join(uploadsPath, 'logos');
            await fs.ensureDir(logosDir);

            const imageRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
            // Let's just use .png as a generic fallback since browsers sniff images well, 
            // or check content type if available
            let ext = '.png';
            const contentType = imageRes.headers['content-type']?.toLowerCase() || '';
            if (contentType.includes('image/x-icon') || contentType.includes('image/vnd.microsoft.icon') || url.endsWith('.ico')) ext = '.ico';
            else if (contentType.includes('image/jpeg')) ext = '.jpg';
            else if (contentType.includes('image/svg+xml')) ext = '.svg';
            else if (contentType.includes('image/webp')) ext = '.webp';

            const filename = `${cleanDomain}${ext}`;
            const targetPath = path.join(logosDir, filename);
            await fs.writeFile(targetPath, imageRes.data);

            return `/uploads/logos/${filename}`;
          }

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
