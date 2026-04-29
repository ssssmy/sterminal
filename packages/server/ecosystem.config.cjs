module.exports = {
  apps: [
    {
      name: 'sterminal-server',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // 日志
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      // 重启策略
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      // 监控
      max_memory_restart: '512M',
    },
  ],
}
