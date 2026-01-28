/**
 * Popup entry point
 * Renders the React popup UI
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import Popup from './popup';

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
