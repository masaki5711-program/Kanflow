// PM2 ecosystem config — managed by the PM2 Windows Service installed via
// setup\install-pm2-service.bat. PM2 resurrects this process tree on every
// service start (i.e. on boot, on service restart, on PM2 daemon recovery).
//
// To apply changes after editing:
//   1. pm2 reload ecosystem.config.js   (zero-downtime if possible)
//   2. pm2 save                          (persist for next service start)
module.exports = {
  apps: [
    {
      name: "kanflow",
      // Invoke the Next.js CLI script with node so PM2 supervises node
      // directly (avoids .cmd shim layering that breaks on Windows).
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0 -p 3000",
      cwd: "D:\\APP\\Kanflow\\app",
      // Auto-restart policy
      autorestart: true,
      watch: false,
      max_memory_restart: "2G",
      // Exponential-ish backoff: start with 2s, grow on repeated failures
      min_uptime: "30s",
      max_restarts: 50,
      restart_delay: 2000,
      // Logs (PM2 manages rotation if pm2-logrotate is installed)
      out_file: "D:\\APP\\Kanflow\\app\\pm2-out.log",
      error_file: "D:\\APP\\Kanflow\\app\\pm2-error.log",
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
}
