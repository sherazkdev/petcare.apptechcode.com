module.exports = {
  apps: [
    {
      name: "petcare-reminder-api",
      cwd: "/var/www/petcare-api",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3018",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "400M",
      env_file: ".env",
      env: {
        NODE_ENV: "production",
        PORT: 3018,
      },
    },
  ],
};
