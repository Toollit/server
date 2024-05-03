#!/bin/bash

IS_GREEN=$(docker ps --format '{{.Names}}' | grep green-container) # 현재 실행중인 app이 green인지 확인합니다.
IS_NGINX=$(docker ps --format '{{.Names}}' | grep nginx-container) # 현재 실행중인 nginx가 있는지 확인합니다.
IS_CERTBOT=$(docker ps --format '{{.Names}}' | grep certbot-container) # 현재 실행중인 certbot가 있는지 확인합니다.
DEFAULT_CONF=" /etc/nginx/nginx.conf"
NGINX_CONF="./app/nginx/default.conf"

# echo "### Delete all images to maintain ec2 storage space ..."
# docker rmi -f $(sudo docker images -aq)

if [ $IS_GREEN ];then # 현재 실행중인 app이 green인 경우

  echo "### GREEN => BLUE ###"

  echo "1. get blue image"
  docker compose -f docker-compose.prod.yml pull blue

  echo "2. blue container up"
  docker compose -f docker-compose.prod.yml up -d blue

  echo "3. change nginx proxy_pass container"  
  sed -i "s|proxy_pass http://.*:4002;|proxy_pass http://blue-container:4002;|" $NGINX_CONF

  while [ 1 = 1 ]; do
  echo "4. blue health check..."
  sleep 3

  REQUEST=$(curl http://blue-container:4002) # blue container로 request

  if [ -n "$REQUEST" ]; then # 서비스 가능하면 health check 중지
    echo "health check success"
    break ;
  fi
  done;

  echo "5. reload nginx"  
  docker exec -it nginx-container service nginx reload
  

  echo "6. green container down"
  docker compose -f docker-compose.prod.yml stop green
else
  
  echo "### BLUE => GREEN ###"

  echo "1. get green image"
  docker compose -f docker-compose.prod.yml pull green

  echo "2. green container up"
  docker compose -f docker-compose.prod.yml up -d green

  echo "3. change nginx proxy_pass container"
  sed -i "s|proxy_pass http://.*:4001;|proxy_pass http://green-container:4001;|" $NGINX_CONF

  while [ 1 = 1 ]; do
    echo "4. green health check..."
    sleep 3

    REQUEST=$(curl http://green-container:4001) # green container로 request

    if [ -n "$REQUEST" ]; then # 서비스 가능하면 health check 중지
      echo "health check success"
      break ;
    fi
  done;

  echo "5. reload nginx" 
  docker exec -it nginx-container service nginx reload

  echo "6. blue container down"
  docker compose -f docker-compose.prod.yml stop blue
fi




if [ -z $IS_NGINX ];then # nginx가 실행 중이 아닌 경우
  echo "starting nginx container..."
  docker compose -f docker-compose.prod.yml up -d nginx
else
  echo "nginx container is already running."
fi



if [ -z $IS_CERTBOT ];then # certbot가 실행 중이 아닌 경우
    echo "starting certbot container..."
    docker compose -f docker-compose.prod.yml up -d certbot
else
  echo "certbot container is already running."
fi