import { redirect } from 'next/navigation';

/**
 * Catch-all route that redirects any non-root path to the home page
 * This ensures the app only runs as a single-page application at /
 */
export default function CatchAllPage() {
  // Redirect to home page
  redirect('/');
}
