/**
 * Main Entry Point
 * Interactive Galaxy Between Hands
 */

import { App } from './app';
import './styles/main.css';

// Get or create container
const container = document.getElementById('app');

if (!container) {
  throw new Error('Container element #app not found');
}

// Create and start application
const app = new App(container, {
  debug: false, // Set to true for debug panel
  particleCount: 20000,
});

// Start the application
app.start().catch((error) => {
  console.error('Failed to start application:', error);
});

// Enable keyboard shortcuts
document.addEventListener('keydown', (event) => {
  switch (event.key.toLowerCase()) {
    case 'd':
      // Toggle debug panel
      app.toggleDebug();
      break;
    case 'b':
      // Trigger Big Bang explosion (for testing)
      app.triggerExplosion();
      break;
    case 'escape':
      // Clean up on Escape
      app.dispose();
      break;
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  app.dispose();
});

// Export for debugging in console
(window as unknown as { app: App }).app = app;
