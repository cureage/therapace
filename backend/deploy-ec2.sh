#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script with sudo, for example: sudo ./backend/deploy-ec2.sh" >&2
  exit 1
fi

if [ ! -r /etc/os-release ]; then
  echo "Cannot identify this Linux distribution." >&2
  exit 1
fi

. /etc/os-release
if [ "${ID:-}" = "ubuntu" ] && [[ "${VERSION_ID:-}" = "22.04" || "${VERSION_ID:-}" = "24.04" ]]; then
  PLATFORM="ubuntu"
elif [ "${ID:-}" = "amzn" ] && [ "${VERSION_ID:-}" = "2023" ]; then
  PLATFORM="amazon-linux-2023"
else
  echo "This installer supports Ubuntu 22.04/24.04 and Amazon Linux 2023." >&2
  exit 1
fi

BACKEND_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$(dirname "$BACKEND_DIR")"
case "$APP_DIR" in
  /opt/*) ;;
  *)
    echo "Clone the repository under /opt (for example /opt/therapace) before running this script." >&2
    exit 1
    ;;
esac
case "$APP_DIR" in
  *[[:space:]]*)
    echo "The application path must not contain spaces." >&2
    exit 1
    ;;
esac
cd "$BACKEND_DIR"

APP_HOSTNAME="${APP_HOSTNAME:-}"
if [ -z "$APP_HOSTNAME" ]; then
  read -r -p "Public DNS name or IP address for this backend: " APP_HOSTNAME
fi
if [[ ! "$APP_HOSTNAME" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "APP_HOSTNAME must be a DNS name or IPv4 address without a port." >&2
  exit 1
fi

LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
if [ -z "$LETSENCRYPT_EMAIL" ]; then
  read -r -p "Email address for Let's Encrypt certificate notices: " LETSENCRYPT_EMAIL
fi
if [[ ! "$LETSENCRYPT_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "LETSENCRYPT_EMAIL is not a valid email address." >&2
  exit 1
fi

APP_USER="therapace"
APP_GROUP="therapace"
ENV_DIR="/etc/therapace"
ENV_FILE="$ENV_DIR/backend.env"
VENV_DIR="$BACKEND_DIR/venv"
STATIC_DIR="/var/www/therapace/static"
CERTBOT_VENV="/opt/certbot"
CERTBOT_BIN="$CERTBOT_VENV/bin/certbot"
CERT_DIR="/etc/letsencrypt/live/$APP_HOSTNAME"
if [ "$PLATFORM" = "ubuntu" ]; then
  NGINX_SITE="/etc/nginx/sites-available/therapace"
  PYTHON_BIN="python3"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    git \
    nginx \
    openssl \
    python3 \
    python3-dev \
    python3-venv
else
  NGINX_SITE="/etc/nginx/conf.d/therapace.conf"
  PYTHON_BIN="python3.13"
  dnf install -y \
    gcc \
    git \
    nginx \
    openssl \
    policycoreutils-python-utils \
    python3.13 \
    python3.13-devel
fi

"$PYTHON_BIN" -m venv "$CERTBOT_VENV"
"$CERTBOT_VENV/bin/python" -m pip install --upgrade pip
"$CERTBOT_VENV/bin/python" -m pip install --upgrade 'certbot>=5.4,<6'

if ! getent group "$APP_GROUP" >/dev/null; then
  groupadd --system "$APP_GROUP"
fi
if ! id "$APP_USER" >/dev/null 2>&1; then
  NOLOGIN="$(command -v nologin)"
  useradd --system --gid "$APP_GROUP" --home-dir "$APP_DIR" --no-create-home \
    --shell "$NOLOGIN" "$APP_USER"
fi

if [ "$PLATFORM" = "amazon-linux-2023" ] && ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python 3.13 is required but was not installed." >&2
  exit 1
fi
"$PYTHON_BIN" -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install -r "$BACKEND_DIR/requirements.txt"

mkdir -p "$ENV_DIR"
secret_key=""
if [ -f "$ENV_FILE" ]; then
  secret_key="$(sed -n 's/^DJANGO_SECRET_KEY=//p' "$ENV_FILE" | head -n 1)"
fi
if [ -z "$secret_key" ]; then
  secret_key="$(openssl rand -base64 48 | tr -d '\n')"
fi
gemini_api_key="${GEMINI_API_KEY:-}"
if [ -z "$gemini_api_key" ] && [ -f "$ENV_FILE" ]; then
  gemini_api_key="$(sed -n 's/^GEMINI_API_KEY=//p' "$ENV_FILE" | head -n 1)"
fi
if [ -z "$gemini_api_key" ]; then
  echo "GEMINI_API_KEY is not set; exposure video generation stays disabled until it is added to $ENV_FILE." >&2
fi

secure_redirect=True
csrf_origin="https://$APP_HOSTNAME"

tmp_env_file="$(mktemp "$ENV_DIR/backend.env.XXXXXX")"
cat > "$tmp_env_file" <<EOF
DJANGO_SECRET_KEY=$secret_key
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=$APP_HOSTNAME,localhost,127.0.0.1
DJANGO_STATIC_ROOT=$STATIC_DIR
CORS_ALLOW_ALL_ORIGINS=False
CSRF_TRUSTED_ORIGINS=$csrf_origin
DJANGO_SECURE_SSL_REDIRECT=$secure_redirect
DJANGO_SESSION_COOKIE_SECURE=$secure_redirect
DJANGO_CSRF_COOKIE_SECURE=$secure_redirect
SENSOR_STREAM_LOG_LEVEL=WARNING
GEMINI_API_KEY=$gemini_api_key
EOF
chmod 0640 "$tmp_env_file"
chown root:"$APP_GROUP" "$tmp_env_file"
mv "$tmp_env_file" "$ENV_FILE"

cat > /etc/systemd/system/therapace-gunicorn.service <<EOF
[Unit]
Description=Therapace Django HTTP application
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$BACKEND_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$VENV_DIR/bin/gunicorn --workers 2 --bind 127.0.0.1:8000 backend.wsgi:application
Restart=on-failure
RestartSec=5
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/therapace-daphne.service <<EOF
[Unit]
Description=Therapace Django WebSocket application
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$BACKEND_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$VENV_DIR/bin/daphne -b 127.0.0.1 -p 8001 backend.asgi:application
Restart=on-failure
RestartSec=5
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

install -d -o "$APP_USER" -g "$APP_GROUP" "$STATIC_DIR"
chown -R "$APP_USER:$APP_GROUP" "$BACKEND_DIR"

runuser -u "$APP_USER" -- env \
  DJANGO_SECRET_KEY="$secret_key" \
  DJANGO_DEBUG=False \
  DJANGO_ALLOWED_HOSTS="$APP_HOSTNAME,localhost,127.0.0.1" \
  DJANGO_STATIC_ROOT="$STATIC_DIR" \
  CORS_ALLOW_ALL_ORIGINS=False \
  CSRF_TRUSTED_ORIGINS="$csrf_origin" \
  DJANGO_SECURE_SSL_REDIRECT="$secure_redirect" \
  DJANGO_SESSION_COOKIE_SECURE="$secure_redirect" \
  DJANGO_CSRF_COOKIE_SECURE="$secure_redirect" \
  SENSOR_STREAM_LOG_LEVEL=WARNING \
  "$VENV_DIR/bin/python" "$BACKEND_DIR/manage.py" migrate --noinput
runuser -u "$APP_USER" -- env \
  DJANGO_SECRET_KEY="$secret_key" \
  DJANGO_DEBUG=False \
  DJANGO_ALLOWED_HOSTS="$APP_HOSTNAME,localhost,127.0.0.1" \
  DJANGO_STATIC_ROOT="$STATIC_DIR" \
  "$VENV_DIR/bin/python" "$BACKEND_DIR/manage.py" collectstatic --noinput

systemctl daemon-reload
systemctl enable therapace-gunicorn.service therapace-daphne.service nginx
systemctl restart therapace-gunicorn.service therapace-daphne.service
systemctl stop nginx

if [ ! -s "$CERT_DIR/fullchain.pem" ] || [ ! -s "$CERT_DIR/privkey.pem" ]; then
  certbot_args=(
    certonly
    --standalone
    --non-interactive
    --agree-tos
    --email "$LETSENCRYPT_EMAIL"
    --cert-name "$APP_HOSTNAME"
  )
  if [[ "$APP_HOSTNAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    certbot_args+=(--preferred-profile shortlived --ip-address "$APP_HOSTNAME")
  else
    certbot_args+=(-d "$APP_HOSTNAME")
  fi
  if ! "$CERTBOT_BIN" "${certbot_args[@]}"; then
    systemctl start nginx
    echo "Certificate issuance failed. Nginx was restarted; check DNS/IP reachability and inbound TCP 80." >&2
    exit 1
  fi
fi

cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    server_name $APP_HOSTNAME;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $APP_HOSTNAME;
    client_max_body_size 20m;

    ssl_certificate $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;

    location /static/ {
        alias $STATIC_DIR/;
        access_log off;
        expires 7d;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF

if [ "$PLATFORM" = "ubuntu" ]; then
  ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/therapace
  rm -f /etc/nginx/sites-enabled/default
else
  old_nginx_config="/etc/nginx/conf.d/django.conf"
  if [ -f "$old_nginx_config" ] && grep -q 'app\.sock' "$old_nginx_config"; then
    old_nginx_backup="$old_nginx_config.disabled.$(date +%Y%m%d%H%M%S)"
    cp -a "$old_nginx_config" "$old_nginx_backup"
    mv "$old_nginx_config" "$old_nginx_config.disabled"
    echo "Disabled obsolete Nginx socket config; backup saved to $old_nginx_backup"
  fi
  if [ "$(getenforce)" != "Disabled" ]; then
    semanage fcontext -a -t httpd_sys_content_t "$STATIC_DIR(/.*)?" 2>/dev/null \
      || semanage fcontext -m -t httpd_sys_content_t "$STATIC_DIR(/.*)?"
    restorecon -R /var/www/therapace
    setsebool -P httpd_can_network_connect 1
  fi
fi
nginx -t
systemctl start nginx

cat > /etc/systemd/system/therapace-certbot-renew.service <<EOF
[Unit]
Description=Renew Therapace TLS certificate

[Service]
Type=oneshot
ExecStart=$CERTBOT_BIN renew --quiet --pre-hook "/bin/systemctl stop nginx" --post-hook "/bin/systemctl start nginx" --deploy-hook "/bin/systemctl reload nginx"
EOF

cat > /etc/systemd/system/therapace-certbot-renew.timer <<'EOF'
[Unit]
Description=Check for Therapace TLS certificate renewal every six hours

[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
RandomizedDelaySec=300
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now therapace-certbot-renew.timer

echo
echo "Deployment complete: https://$APP_HOSTNAME"
echo "Gunicorn and Daphne listen only on localhost; Nginx handles HTTPS and HTTP redirects."
echo "Services: systemctl status therapace-gunicorn therapace-daphne nginx"
echo "Certificate renewal: systemctl status therapace-certbot-renew.timer"
if [[ "$APP_HOSTNAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "The IP-address certificate is short-lived; the renewal timer checks every six hours."
fi
