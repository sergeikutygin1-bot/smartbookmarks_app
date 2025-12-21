import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';

/**
 * GET /api/enrich/:jobId/stream
 * Server-Sent Events proxy to backend enrichment service
 *
 * This route proxies SSE events from the backend to the client browser.
 * The backend sends updates when the enrichment job completes/fails.
 *
 * Why we need this proxy:
 * - Frontend calls /api/enrich/:jobId/stream
 * - This route forwards to backend http://localhost:3002/enrich/:jobId/stream
 * - Backend streams events which we forward to the browser
 *
 * Benefits of SSE over polling:
 * - 98% fewer requests (60 polls → 1 connection per enrichment)
 * - Instant updates (no 2-second delay)
 * - Lower backend load (no repeated database queries)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    // Connect to backend SSE endpoint
    const backendUrl = `${BACKEND_URL}/enrich/${jobId}/stream`;
    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    // If backend returns error (404, 500, etc), forward it
    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({
        error: `Backend returned ${backendResponse.status}`,
      }));

      return new Response(
        JSON.stringify(errorData),
        {
          status: backendResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the ReadableStream from the backend response
    const stream = backendResponse.body;

    if (!stream) {
      return new Response(
        JSON.stringify({ error: 'No stream available from backend' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Return streaming response with SSE headers
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
      },
    });
  } catch (error) {
    console.error('SSE proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to establish SSE connection';

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
