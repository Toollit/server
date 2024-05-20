#!/bin/bash

if ! docker version >/dev/null 2>&1; then
  echo 'Error: docker is not installed.' >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo 'Error: docker compose is not installed.' >&2
  exit 1
fi

echo '✅ docker and docker compose are installed.'

domains="api.toollit.com"
rsa_key_size=4096
data_path="./data/certbot"
email="seungwon.code@gmail.com" # Adding a valid address is strongly recommended
staging=0 # staging=1 for development, staging=0 for production. Set to 1 if you're testing your setup to avoid hitting request limits


# Updating docker images if ssl is already issued.
if [ -d "$data_path" ]; then
  echo "### To update new docker images. Shutting down docker containers ..."
  docker compose -f docker-compose.prod.yml down
  echo

  echo "### Delete all images to maintain ec2 storage space ..."
  docker rmi -f $(sudo docker images -aq)

  echo "### To update new docker images. Run docker containers ..."
  docker compose -f docker-compose.prod.yml up -d
  echo
fi


# If a folder exists in data_path during deployment, this script here indefinitely waits for a response so that the script below does not run.
if [ -d "$data_path" ]; then
  read -p "Existing data found for $domains. Continue and replace existing certificate? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit
  fi
fi


if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
  echo "### Downloading recommended TLS parameters ..."
  mkdir -p "$data_path/conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"
  echo
fi


echo "### Shutting down docker containers ..."
docker compose -f docker-compose.prod.yml down
echo


echo "### Run docker containers ..."
docker compose -f docker-compose.prod.yml up -d
echo


echo "### Creating dummy certificate for $domains ..."
path="/etc/letsencrypt/live/$domains"
mkdir -p "$data_path/conf/live/$domains"
docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1\
    -keyout '$path/privkey.pem' \
    -out '$path/fullchain.pem' \
    -subj '/CN=localhost'" certbot
echo


echo "### Starting nginx ..."
docker compose -f docker-compose.prod.yml up --force-recreate -d nginx
echo

echo "### Deleting dummy certificate for $domains ..."
docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$domains && \
  rm -Rf /etc/letsencrypt/archive/$domains && \
  rm -Rf /etc/letsencrypt/renewal/$domains.conf" certbot
echo


echo "### Requesting Let's Encrypt certificate for $domains ..."
#Join $domains to -d args
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

# Select appropriate email arg
case "$email" in
  "") email_arg="--register-unsafely-without-email" ;;
  *) email_arg="--email $email" ;;
esac

# Enable staging mode if needed
if [ $staging != "0" ]; then staging_arg="--staging"; fi

docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --force-renewal" certbot
echo

echo "### Reloading nginx ..."
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
