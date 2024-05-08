#!/bin/bash

# image registry
DOCKER_REPO=seungwoncode

# check current service
if docker ps | grep -q blue; then
    echo "Blue service is active."
    CURRENT_SERVICE="blue"
    NEW_SERVICE="green"
    NEW_SERVICE_PORT=4002
else
    echo "Green service is active."
    CURRENT_SERVICE="green"
    NEW_SERVICE="blue"
    NEW_SERVICE_PORT=4001
fi

echo "modify nginx settings with new service (before reload)"
NGINX_UPSTREAM="${NEW_SERVICE}_server"
sed -i "s/proxy_pass http:\/\/.*_server;/proxy_pass http:\/\/$NGINX_UPSTREAM;/" ./nginx/default.conf


echo "push only modified information to the registry"
docker build -t toollit-server-nginx ./nginx
docker tag toollit-server-nginx:latest $DOCKER_REPO/toollit-server-nginx:latest
docker push $DOCKER_REPO/toollit-server-nginx:latest


echo "deploy new server (blue or green)"
docker pull $DOCKER_REPO/toollit-server-app:latest
docker pull $DOCKER_REPO/toollit-server-nginx:latest
docker compose -f docker-compose.prod.yml up -d certbot
docker compose -f docker-compose.prod.yml up -d $NEW_SERVICE


if ! docker ps | grep -q nginx; then
    echo "start nginx service if nginx is not present"
    sudo docker compose -f docker-compose.prod.yml up -d nginx
fi


echo "new server health check"
while [ 1 = 1 ]; do
echo "health check..."
sleep 3

REQUEST=$(curl http://127.0.0.1:$NEW_SERVICE_PORT) # 새로운 container로 request

if [ -n "$REQUEST" ]; then # 서비스 가능하면 health check 중지
echo "health check success"
break ;
fi
done;


echo "nginx setup reload and existing service down"
NGINX_CONTAINER=$(docker ps | grep "nginx" | awk '{print $1}')
docker exec $NGINX_CONTAINER nginx -s reload
sudo docker compose -f docker-compose.prod.yml stop $CURRENT_SERVICE


echo "remove unused images"
docker image prune -f