import { NextRequest } from 'next/server';

/**
 * Helper to extract Authorization header from request and create headers for backend
 */
export function getAuthHeaders(request: NextRequest, additionalHeaders: HeadersInit = {}): HeadersInit {
  const authHeader = request.headers.get('authorization');
  const headers: HeadersInit = { ...additionalHeaders };

  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  return headers;
}
