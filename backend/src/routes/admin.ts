import { Router, Request, Response } from "express";
import { logger } from "../services/logger";
import { enrichmentTracker } from "../services/enrichmentTracker";
import path from "path";
import fs from "fs";

const router = Router();

/**
 * Admin Dashboard Routes
 *
 * Provides monitoring and debugging interface for the enrichment system
 */

// Dashboard HTML page
router.get("/", (req: Request, res: Response) => {
  const htmlPath = path.join(__dirname, "../views/admin.html");

  // Check if file exists
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    // Fallback: Send inline HTML if file doesn't exist yet
    res.send(getInlineAdminHTML());
  }
});

// Get recent logs
router.get("/logs", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const level = req.query.level as any;
  const source = req.query.source as any;

  const logs =
    level || source
      ? logger.getFilteredLogs({ level, source, limit })
      : logger.getRecentLogs(limit);

  res.json({ logs });
});

// SSE endpoint for real-time log streaming
router.get("/logs/stream", (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  logger.info("admin", "Client connected to log stream");

  // Send initial logs
  const recentLogs = logger.getRecentLogs(20);
  recentLogs.forEach((log) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  });

  // Listen for new logs
  const logHandler = (log: any) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  };

  logger.on("log", logHandler);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30000);

  // Cleanup on disconnect
  req.on("close", () => {
    logger.info("admin", "Client disconnected from log stream");
    logger.off("log", logHandler);
    clearInterval(heartbeat);
  });
});

// Get enrichment history
router.get("/enrichments", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const history = enrichmentTracker.getHistory(limit);
  const active = enrichmentTracker.getActiveEnrichments();

  res.json({
    active,
    history,
  });
});

// Get specific enrichment
router.get("/enrichments/:id", (req: Request, res: Response) => {
  const enrichment = enrichmentTracker.getEnrichment(req.params.id);

  if (!enrichment) {
    return res.status(404).json({ error: "Enrichment not found" });
  }

  res.json({ enrichment });
});

// Get statistics
router.get("/stats", (req: Request, res: Response) => {
  const logStats = logger.getStats();
  const enrichmentStats = enrichmentTracker.getStats();

  res.json({
    logs: logStats,
    enrichments: enrichmentStats,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Clear logs (admin action)
router.post("/logs/clear", (req: Request, res: Response) => {
  logger.clearLogs();
  res.json({ message: "Logs cleared" });
});

// Clear enrichment history (admin action)
router.post("/enrichments/clear", (req: Request, res: Response) => {
  enrichmentTracker.clearHistory();
  res.json({ message: "Enrichment history cleared" });
});

/**
 * Inline admin HTML (fallback if file doesn't exist)
 */
function getInlineAdminHTML(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard - Smart Bookmarks</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
      background: #1a1a1a;
      color: #e0e0e0;
      padding: 20px;
    }
    h1 { color: #fff; margin-bottom: 10px; }
    h2 { color: #4CAF50; margin-top: 30px; margin-bottom: 10px; font-size: 18px; }
    .container { max-width: 1400px; margin: 0 auto; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    .stat-card {
      background: #2a2a2a;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #333;
    }
    .stat-card h3 { color: #4CAF50; font-size: 14px; margin-bottom: 10px; }
    .stat-card .value { font-size: 32px; font-weight: bold; color: #fff; }
    .stat-card .label { font-size: 12px; color: #888; margin-top: 5px; }
    .log-container {
      background: #000;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 15px;
      height: 400px;
      overflow-y: auto;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 12px;
    }
    .log-entry {
      padding: 5px 0;
      border-bottom: 1px solid #222;
    }
    .log-entry:last-child { border-bottom: none; }
    .log-time { color: #666; }
    .log-level { font-weight: bold; padding: 2px 6px; border-radius: 3px; margin: 0 5px; }
    .log-level.info { color: #00BCD4; }
    .log-level.warn { color: #FFC107; }
    .log-level.error { color: #F44336; }
    .log-level.debug { color: #9E9E9E; }
    .log-source { color: #888; }
    .log-message { color: #fff; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #2a2a2a; padding: 10px; text-align: left; color: #4CAF50; font-size: 12px; }
    td { padding: 10px; border-bottom: 1px solid #333; font-size: 12px; }
    .status { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .status.completed { background: #4CAF50; color: #000; }
    .status.failed { background: #F44336; color: #fff; }
    .status.processing { background: #FFC107; color: #000; }
    button {
      background: #4CAF50;
      color: #000;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      margin-right: 10px;
    }
    button:hover { background: #45a049; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Smart Bookmarks - Agent Dashboard</h1>
    <p style="color: #888; margin-bottom: 20px;">Real-time monitoring and debugging interface</p>

    <div class="stats" id="stats"></div>

    <h2>📊 Live Logs</h2>
    <button onclick="clearLogs()">Clear Logs</button>
    <div class="log-container" id="logs"></div>

    <h2>📝 Recent Enrichments</h2>
    <button onclick="clearEnrichments()">Clear History</button>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>URL</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Steps</th>
        </tr>
      </thead>
      <tbody id="enrichments"></tbody>
    </table>
  </div>

  <script>
    // SSE connection for live logs
    const eventSource = new EventSource('/admin/logs/stream');
    const logsContainer = document.getElementById('logs');
    let logCount = 0;
    const maxLogs = 200;

    eventSource.onmessage = (event) => {
      const log = JSON.parse(event.data);
      addLog(log);
    };

    function addLog(log) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';

      const time = new Date(log.timestamp).toLocaleTimeString();
      entry.innerHTML = \`
        <span class="log-time">\${time}</span>
        <span class="log-level \${log.level}">\${log.level.toUpperCase()}</span>
        <span class="log-source">[\${log.source}]</span>
        <span class="log-message">\${log.message}</span>
      \`;

      logsContainer.appendChild(entry);
      logCount++;

      if (logCount > maxLogs) {
        logsContainer.removeChild(logsContainer.firstChild);
        logCount--;
      }

      logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    // Fetch stats and enrichments
    async function fetchData() {
      try {
        const [statsRes, enrichRes] = await Promise.all([
          fetch('/admin/stats'),
          fetch('/admin/enrichments')
        ]);

        const stats = await statsRes.json();
        const enrichments = await enrichRes.json();

        updateStats(stats);
        updateEnrichments(enrichments);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    }

    function updateStats(data) {
      const statsDiv = document.getElementById('stats');
      statsDiv.innerHTML = \`
        <div class="stat-card">
          <h3>Total Enrichments</h3>
          <div class="value">\${data.enrichments.total}</div>
          <div class="label">All time</div>
        </div>
        <div class="stat-card">
          <h3>Success Rate</h3>
          <div class="value">\${data.enrichments.successRate}%</div>
          <div class="label">\${data.enrichments.completed} / \${data.enrichments.total}</div>
        </div>
        <div class="stat-card">
          <h3>Avg Duration</h3>
          <div class="value">\${(data.enrichments.avgDuration / 1000).toFixed(1)}s</div>
          <div class="label">Processing time</div>
        </div>
        <div class="stat-card">
          <h3>Active Now</h3>
          <div class="value">\${data.enrichments.active}</div>
          <div class="label">In progress</div>
        </div>
        <div class="stat-card">
          <h3>Last Hour</h3>
          <div class="value">\${data.enrichments.lastHour.total}</div>
          <div class="label">\${data.enrichments.lastHour.completed} completed</div>
        </div>
        <div class="stat-card">
          <h3>Total Logs</h3>
          <div class="value">\${data.logs.totalLogs}</div>
          <div class="label">\${data.logs.last5Minutes} in last 5min</div>
        </div>
      \`;
    }

    function updateEnrichments(data) {
      const tbody = document.getElementById('enrichments');
      tbody.innerHTML = data.history.map(e => {
        const time = new Date(e.startedAt).toLocaleTimeString();
        const url = e.url.length > 50 ? e.url.substring(0, 50) + '...' : e.url;
        const duration = e.duration ? \`\${(e.duration / 1000).toFixed(2)}s\` : '-';
        const steps = Object.keys(e.steps).map(s =>
          e.steps[s].success ? \`✓ \${s}\` : \`✗ \${s}\`
        ).join(', ');

        return \`
          <tr>
            <td>\${time}</td>
            <td style="font-family: monospace; font-size: 11px;">\${url}</td>
            <td><span class="status \${e.status}">\${e.status}</span></td>
            <td>\${duration}</td>
            <td style="font-size: 11px;">\${steps}</td>
          </tr>
        \`;
      }).join('');
    }

    async function clearLogs() {
      if (!confirm('Clear all logs?')) return;
      await fetch('/admin/logs/clear', { method: 'POST' });
      logsContainer.innerHTML = '';
      logCount = 0;
    }

    async function clearEnrichments() {
      if (!confirm('Clear enrichment history?')) return;
      await fetch('/admin/enrichments/clear', { method: 'POST' });
      fetchData();
    }

    // Initial load
    fetchData();
    // Refresh every 5 seconds
    setInterval(fetchData, 5000);
  </script>
</body>
</html>
  `.trim();
}

export default router;
