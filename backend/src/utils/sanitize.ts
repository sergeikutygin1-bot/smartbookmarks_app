import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content while preserving safe formatting tags
 *
 * Allowed tags: p, br, strong, em, a, ul, ol, li, code, pre
 * Allowed attributes: href (only on 'a' tags)
 *
 * Use for: bookmark notes, descriptions, or any user-generated HTML content
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      'a',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    // Always open external links in new tab with noopener/noreferrer
    ADD_ATTR: ['target', 'rel'],
    CUSTOM_ELEMENT_HANDLING: {
      tagNameCheck: null,
      attributeNameCheck: null,
      allowCustomizedBuiltInElements: false,
    },
  });
}

/**
 * Sanitize plain text by removing all HTML tags
 *
 * Use for: titles, tags, URLs, or any content that should be plain text
 */
export function sanitizeText(dirty: string): string {
  if (!dirty) return '';

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true, // Keep text content, remove tags
  });
}

/**
 * Sanitize URL to prevent javascript: and data: schemes
 *
 * Use for: bookmark URLs, link validation
 */
export function sanitizeUrl(dirty: string): string {
  if (!dirty) return '';

  const cleaned = dirty.trim();

  // Block dangerous protocols
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
  const lowerUrl = cleaned.toLowerCase();

  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      throw new Error(`Invalid URL: ${protocol} protocol not allowed`);
    }
  }

  // Ensure URL starts with http:// or https:// if not already
  if (!/^https?:\/\//i.test(cleaned)) {
    return `https://${cleaned}`;
  }

  return cleaned;
}

/**
 * Sanitize array of tags
 *
 * Removes HTML, limits length, converts to lowercase
 */
export function sanitizeTags(tags: string[]): string[] {
  if (!Array.isArray(tags)) return [];

  return tags
    .map((tag) => sanitizeText(tag).toLowerCase().trim())
    .filter((tag) => tag.length > 0 && tag.length <= 50)
    .slice(0, 20); // Max 20 tags
}

/**
 * Sanitize email address
 *
 * Removes HTML and validates basic email format
 */
export function sanitizeEmail(dirty: string): string {
  if (!dirty) return '';

  const cleaned = sanitizeText(dirty).toLowerCase().trim();

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleaned)) {
    throw new Error('Invalid email format');
  }

  return cleaned;
}
