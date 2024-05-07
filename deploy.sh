#!/bin/bash

# image registry
DOCKER_REPO=seungwoncode

# current service check
if docker ps | grep -q blue; then
    echo "Blue service is active."
    CURRENT_SERVICE="blue"
    NEW_SERVICE="green"
else
    echo "Green service is active."
    CURRENT_SERVICE="green"
    NEW_SERVICE="blue"
fi

# modify nginx settings with new service (before reload)
NGINX_UPSTREAM="${NEW_SERVICE}_server"
sed -i "s/proxy_pass http:\/\/.*_server;/proxy_pass http:\/\/$NGINX_UPSTREAM;/" ./nginx/default.conf

# rebuild image with modified configuration and push it to the registry
docker build -t toollit-server-nginx ./nginx
docker tag toollit-server-nginx:latest $DOCKER_REPO/toollit-server-nginx:latest
docker push $DOCKER_REPO/toollit-server-nginx:latest


# image updates and new service deployments
docker pull $DOCKER_REPO/toollit-server-app:latest
docker pull $DOCKER_REPO/toollit-server-nginx:latest
docker compose up -d $NEW_SERVICE

# start nginx service if nginx is not present
if ! docker ps | grep -q nginx; then
    docker compose up -d nginx
fi

# latency for service to be stable
sleep 60

# nginx setup reload and existing service down
NGINX_CONTAINER=$(docker ps | grep "nginx" | awk '{print $1}')
docker exec $NGINX_CONTAINER nginx -s reload
docker compose stop $CURRENT_SERVICE

# delete unused images
docker image prune -f