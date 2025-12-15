import { Router, Request, Response } from "express";
import { logger } from "../services/logger";
import { enrichmentTracker } from "../services/enrichmentTracker";
import { getEmbedderAgent } from "../agents/embedderAgent";
import { getJobStorage } from "../services/jobStorage";
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

// Get enrichment history (now using jobStorage)
router.get("/enrichments", async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const jobStorage = getJobStorage();

  // Get all jobs for history
  const allJobs = await jobStorage.listJobs({ limit });

  // Get active jobs (processing status)
  const activeJobs = await jobStorage.listJobs({ status: 'processing', limit: 10 });

  // Convert to enrichmentTracker format for backward compatibility
  const history = allJobs.map(job => ({
    id: job.jobId,
    url: job.url,
    status: job.status,
    startedAt: job.startedAt || job.queuedAt,
    duration: job.totalDuration,
    error: job.error?.message,
    steps: {
      extraction: { success: job.status !== 'failed' || !job.error?.message.includes('extract') },
      analysis: { success: job.status === 'completed' },
      tagging: { success: job.status === 'completed' },
      embedding: { success: job.status === 'completed' },
    }
  }));

  const active = activeJobs.map(job => ({
    id: job.jobId,
    url: job.url,
    startedAt: job.startedAt || job.queuedAt,
  }));

  res.json({
    active,
    history,
  });
});

// Get specific enrichment (now using jobStorage)
router.get("/enrichments/:id", async (req: Request, res: Response) => {
  const jobStorage = getJobStorage();
  const job = await jobStorage.getJob(req.params.id);

  if (!job) {
    return res.status(404).json({ error: "Enrichment not found" });
  }

  // Convert to enrichmentTracker format for backward compatibility
  const enrichment = {
    id: job.jobId,
    url: job.url,
    status: job.status,
    startedAt: job.startedAt || job.queuedAt,
    completedAt: job.completedAt,
    duration: job.totalDuration,
    error: job.error?.message,
    result: job.result,
    agentTraces: job.agentTraces,
  };

  res.json({ enrichment });
});

// Get statistics
router.get("/stats", async (req: Request, res: Response) => {
  const logStats = logger.getStats();
  const jobStorage = getJobStorage();
  const jobStats = await jobStorage.getStats();

  // Get cache statistics from embedder agent
  const embedderAgent = getEmbedderAgent();
  const cacheStats = await embedderAgent.getCacheStats();

  // Convert job stats to enrichment stats format for backward compatibility
  const enrichmentStats = {
    total: jobStats.total,
    completed: jobStats.byStatus.completed || 0,
    failed: jobStats.byStatus.failed || 0,
    active: jobStats.byStatus.processing || 0,
    successRate: jobStats.total > 0
      ? Math.round(((jobStats.byStatus.completed || 0) / jobStats.total) * 100)
      : 0,
    avgDuration: jobStats.avgDuration,
    lastHour: {
      total: jobStats.last24Hours,
      completed: jobStats.byStatus.completed || 0,
    },
  };

  res.json({
    logs: logStats,
    enrichments: enrichmentStats,
    jobs: jobStats,
    cache: cacheStats,
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

// Get cache statistics
router.get("/cache/stats", async (req: Request, res: Response) => {
  const embedderAgent = getEmbedderAgent();
  const cacheStats = await embedderAgent.getCacheStats();

  res.json({
    cache: cacheStats,
  });
});

// Clear cache (admin action)
router.post("/cache/clear", async (req: Request, res: Response) => {
  const embedderAgent = getEmbedderAgent();
  await embedderAgent.clearCache();
  res.json({ message: "Cache cleared successfully" });
});

// Get all jobs with filters
router.get("/jobs", async (req: Request, res: Response) => {
  const jobStorage = getJobStorage();
  const status = req.query.status as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

  const jobs = await jobStorage.listJobs({ status, limit, offset });

  res.json({
    jobs,
    total: jobs.length,
  });
});

// Get job statistics (MUST be before /:jobId route)
router.get("/jobs/stats", async (req: Request, res: Response) => {
  const jobStorage = getJobStorage();
  const stats = await jobStorage.getStats();

  res.json({ stats });
});

// Get specific job execution trace
router.get("/jobs/:jobId", async (req: Request, res: Response) => {
  const jobStorage = getJobStorage();
  const job = await jobStorage.getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json({ job });
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
    .error-container {
      background: #2a0a0a;
      border: 2px solid #F44336;
      border-radius: 8px;
      padding: 15px;
      max-height: 300px;
      overflow-y: auto;
      margin-bottom: 30px;
    }
    .error-card {
      background: #1a0a0a;
      border: 1px solid #c62828;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .error-card:last-child { margin-bottom: 0; }
    .error-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .error-url {
      font-family: monospace;
      font-size: 12px;
      color: #fff;
      max-width: 500px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .error-time {
      font-size: 11px;
      color: #888;
    }
    .error-message {
      color: #F44336;
      font-size: 13px;
      font-weight: bold;
      margin-top: 8px;
      padding: 8px;
      background: #000;
      border-radius: 4px;
      border-left: 3px solid #F44336;
    }
    .error-steps {
      font-size: 11px;
      color: #888;
      margin-top: 8px;
    }
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

    <h2>🚨 Failed Enrichments</h2>
    <div class="error-container" id="errors">
      <p style="color: #888; font-size: 14px;">No failed enrichments yet</p>
    </div>

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

    <h2>🔍 Job Execution Details</h2>
    <p style="color: #888; font-size: 14px; margin-bottom: 15px;">Click on a job to view detailed execution trace</p>
    <table>
      <thead>
        <tr>
          <th>Job ID</th>
          <th>URL</th>
          <th>Status</th>
          <th>Queued</th>
          <th>Duration</th>
          <th>Quality</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="jobs"></tbody>
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

    // Fetch stats, enrichments, and jobs
    async function fetchData() {
      try {
        const [statsRes, enrichRes, jobsRes] = await Promise.all([
          fetch('/admin/stats'),
          fetch('/admin/enrichments'),
          fetch('/admin/jobs?limit=20')
        ]);

        const stats = await statsRes.json();
        const enrichments = await enrichRes.json();
        const jobs = await jobsRes.json();

        updateStats(stats);
        updateEnrichments(enrichments);
        updateJobs(jobs.jobs);
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
      // Update errors section
      const errorsDiv = document.getElementById('errors');
      const failedEnrichments = data.history.filter(e => e.status === 'failed');

      if (failedEnrichments.length === 0) {
        errorsDiv.innerHTML = '<p style="color: #888; font-size: 14px;">No failed enrichments yet</p>';
      } else {
        errorsDiv.innerHTML = failedEnrichments.slice(0, 5).map(e => {
          const time = new Date(e.startedAt).toLocaleString();
          const failedSteps = Object.keys(e.steps)
            .filter(s => !e.steps[s].success)
            .join(', ');

          return \`
            <div class="error-card">
              <div class="error-header">
                <div class="error-url" title="\${e.url}">\${e.url}</div>
                <div class="error-time">\${time}</div>
              </div>
              <div class="error-message">
                ❌ \${e.error || 'Unknown error'}
              </div>
              \${failedSteps ? \`<div class="error-steps">Failed steps: \${failedSteps}</div>\` : ''}
            </div>
          \`;
        }).join('');
      }

      // Update enrichments table
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

    function updateJobs(jobs) {
      const tbody = document.getElementById('jobs');
      if (!jobs || jobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #888;">No jobs yet</td></tr>';
        return;
      }

      tbody.innerHTML = jobs.map(job => {
        const time = new Date(job.queuedAt).toLocaleString();
        const url = job.url.length > 40 ? job.url.substring(0, 40) + '...' : job.url;
        const jobId = job.jobId.replace('enrich-', '');
        const duration = job.totalDuration ? \`\${(job.totalDuration / 1000).toFixed(2)}s\` : '-';

        // Quality metrics
        let quality = '-';
        if (job.quality) {
          const metrics = [];
          if (job.quality.contentLength) metrics.push(\`\${Math.round(job.quality.contentLength / 1000)}K content\`);
          if (job.quality.tagCount) metrics.push(\`\${job.quality.tagCount} tags\`);
          quality = metrics.join(', ') || '-';
        }

        const viewBtn = \`<button onclick="viewJob('\${job.jobId}')" style="padding: 4px 8px; font-size: 11px;">View Details</button>\`;

        return \`
          <tr>
            <td style="font-family: monospace; font-size: 11px;">\${jobId}</td>
            <td style="font-family: monospace; font-size: 11px;" title="\${job.url}">\${url}</td>
            <td><span class="status \${job.status}">\${job.status}</span></td>
            <td style="font-size: 11px;">\${time}</td>
            <td>\${duration}</td>
            <td style="font-size: 11px;">\${quality}</td>
            <td>\${viewBtn}</td>
          </tr>
        \`;
      }).join('');
    }

    async function viewJob(jobId) {
      try {
        const res = await fetch(\`/admin/jobs/\${jobId}\`);
        const data = await res.json();
        const job = data.job;

        let details = \`Job: \${jobId}\\n\`;
        details += \`URL: \${job.url}\\n\`;
        details += \`Status: \${job.status}\\n\`;
        details += \`Queued: \${new Date(job.queuedAt).toLocaleString()}\\n\`;
        if (job.startedAt) details += \`Started: \${new Date(job.startedAt).toLocaleString()}\\n\`;
        if (job.completedAt) details += \`Completed: \${new Date(job.completedAt).toLocaleString()}\\n\`;
        if (job.totalDuration) details += \`Duration: \${(job.totalDuration / 1000).toFixed(2)}s\\n\`;

        if (job.error) {
          details += \`\\nError: \${job.error.message}\\n\`;
        }

        if (job.result) {
          details += \`\\nResult:\\n\`;
          details += \`  Title: \${job.result.title || 'N/A'}\\n\`;
          details += \`  Tags: \${job.result.tags?.join(', ') || 'N/A'}\\n\`;
          if (job.result.summary) {
            details += \`  Summary: \${job.result.summary.substring(0, 200)}...\\n\`;
          }
        }

        if (job.quality) {
          details += \`\\nQuality Metrics:\\n\`;
          if (job.quality.contentLength) details += \`  Content: \${Math.round(job.quality.contentLength / 1000)}K chars\\n\`;
          if (job.quality.summaryLength) details += \`  Summary: \${job.quality.summaryLength} chars\\n\`;
          if (job.quality.tagCount) details += \`  Tags: \${job.quality.tagCount}\\n\`;
        }

        alert(details);
      } catch (error) {
        alert('Failed to load job details: ' + error.message);
      }
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
