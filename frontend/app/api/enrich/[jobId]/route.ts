import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';

/**
 * GET /api/enrich/:jobId
 * Check the status of an enrichment job
 *
 * Proxies to backend enrichment service
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Proxy request to backend enrichment service
    const statusResponse = await fetch(`${BACKEND_URL}/enrich/${jobId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!statusResponse.ok) {
      const errorData = await statusResponse.json().catch(() => ({}));
      const errorMessage = errorData.error || 'Failed to get job status';
      return NextResponse.json(
        { error: errorMessage },
        { status: statusResponse.status }
      );
    }

    const statusData = await statusResponse.json();
    return NextResponse.json(statusData);
  } catch (error) {
    console.error('GET /api/enrich/:jobId error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get job status';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
