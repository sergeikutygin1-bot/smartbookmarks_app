/**
 * Main popup component
 * Displays authentication and bookmark saving UI
 */

import React, { useState, useEffect } from 'react';
import { getAuthState, login, createBookmark } from '../utils/api';
import type { AuthState } from '../types';
import './popup.css';

type Status = 'idle' | 'saving' | 'success' | 'error';

const Popup: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [currentTab, setCurrentTab] = useState<{ url: string; title: string } | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      try {
        // Check authentication state
        const auth = await getAuthState();
        setAuthState(auth);

        // Get current tab info
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.url && tabs[0]?.title) {
            setCurrentTab({
              url: tabs[0].url,
              title: tabs[0].title,
            });
          } else {
            setErrorMessage('Could not get current page information');
          }
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to initialize');
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  const handleSave = async () => {
    if (!currentTab) return;

    setStatus('saving');
    setErrorMessage('');

    try {
      await createBookmark(currentTab.url, currentTab.title);
      setStatus('success');

      // Auto-close popup after 2 seconds
      setTimeout(() => {
        window.close();
      }, 2000);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save bookmark');
    }
  };

  const handleLogin = async () => {
    try {
      await login();
      // Login opens a new tab, no need to update state here
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to open login page');
    }
  };

  const handleRetry = () => {
    setStatus('idle');
    setErrorMessage('');
    handleSave();
  };

  // Loading state
  if (loading) {
    return (
      <div className="popup-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated state
  if (!authState?.isAuthenticated) {
    return (
      <div className="popup-container">
        <div className="not-authenticated">
          <h2>Smart Bookmarks</h2>
          <p>Login to Smart Bookmarks to save and organize your bookmarks with AI-powered insights.</p>
          <button className="btn-primary" onClick={handleLogin}>
            Login
          </button>
          {errorMessage && <div className="error-message">{errorMessage}</div>}
        </div>
      </div>
    );
  }

  // Error getting tab info
  if (!currentTab) {
    return (
      <div className="popup-container">
        <div className="error-state">
          <h2>Error</h2>
          <div className="error-message">Could not get current page information</div>
        </div>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="popup-container">
        <div className="success-state">
          <div className="success-icon">✓</div>
          <h2>Saved!</h2>
          <p>Your bookmark has been saved successfully.</p>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="popup-container">
        <div className="error-state">
          <h2>Error</h2>
          <div className="error-message">{errorMessage}</div>
          <button className="btn-secondary" onClick={handleRetry}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Authenticated + Idle/Saving state
  return (
    <div className="popup-container">
      <div className="authenticated-state">
        <h2>Save Bookmark</h2>
        <div className="page-info">
          <div className="page-title">{currentTab.title}</div>
          <div className="page-url">{currentTab.url}</div>
        </div>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={status === 'saving'}
        >
          {status === 'saving' ? 'Saving...' : 'Save Bookmark'}
        </button>
      </div>
    </div>
  );
};

export default Popup;
