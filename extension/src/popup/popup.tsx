/**
 * Main popup component
 * Displays authentication and bookmark saving UI
 */

import React, { useState, useEffect } from 'react';

const Popup: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Check authentication state
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: '20px' }}>
        <h2>Smart Bookmarks</h2>
        <p>Please log in to save bookmarks</p>
        {/* TODO: Add login form */}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>Save Bookmark</h2>
      {/* TODO: Add bookmark form */}
      <p>Authenticated! Ready to save bookmarks.</p>
    </div>
  );
};

export default Popup;
