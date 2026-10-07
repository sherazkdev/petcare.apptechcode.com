# Server setup (copy-paste)

# 1) App folder
sudo mkdir -p /var/www/petcare.apptechcode.com
sudo chown -R $USER:$USER /var/www/petcare.apptechcode.com
cd /var/www/petcare.apptechcode.com
git clone https://github.com/sherazkdev/petcare.apptechcode.com.git .

# 2) Env (fill keys, do not commit)
cp .env.example .env
nano .env
# FCM_DRY_RUN=false
# MONGODB_URI=...
# FIREBASE_ID_TOKEN_REQUIRED=true
# ALLOW_LEGACY_API_KEY=false   # true only while old app builds still use X-Api-Key
# X_API_KEY=...                # optional when Firebase ID token is required; rotate after removing from Remote Config
# FIREBASE_CLIENT_EMAIL=...
# FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# 3) Node app
npm ci
npm run build
npm run indexes

# 4) PM2
sudo npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# App listens on 3018 (see ecosystem.config.cjs).
# Restart after code pull:
# git pull && npm ci && npm run build && pm2 restart petcare-reminder-api

# 5) Nginx
sudo cp nginx/petcare.apptechcode.com.conf /etc/nginx/sites-available/petcare.apptechcode.com
sudo ln -s /etc/nginx/sites-available/petcare.apptechcode.com /etc/nginx/sites-enabled/petcare.apptechcode.com
sudo nginx -t
sudo systemctl reload nginx

# 6) HTTPS (after DNS A record points to this server)
sudo certbot --nginx -d petcare.apptechcode.com
