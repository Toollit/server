#!/bin/bash

IS_GREEN=$(docker ps | grep green) # 현재 실행중인 App이 green인지 확인
DEFAULT_CONF="/etc/nginx/nginx.conf"


echo "nginx and certbot start"
docker compose -f docker-compose.prod.yml up -d nginx
docker compose -f docker-compose.prod.yml up -d certbot


if [ -z $IS_GREEN  ];then # blue가 실행중인 경우

  echo "### BLUE => GREEN ###"

  echo "1. pulling update image"
  docker compose -f docker-compose.prod.yml pull green

  echo "2. green container up"
  docker compose -f docker-compose.prod.yml up -d green # green 컨테이너 실행

  while [ 1 = 1 ]; do
  echo "3. green health check..."
  sleep 3

  REQUEST=$(curl http://127.0.0.1:4002) # green으로 request

  if [ -n "$REQUEST" ]; then # 서비스 가능하면 health check 중지
    echo "✅ green health check success"
    break ;
  fi
  done;

  echo "4. update nginx settings with new service"
  NGINX_UPSTREAM="green:4000"
  sed -i "s/proxy_pass http:\/\/.*:4000;/proxy_pass http:\/\/$NGINX_UPSTREAM;/" ./nginx/default.conf

  echo "5. reload nginx"
  docker cp ./nginx/default.conf nginx:/etc/nginx/conf.d/default.conf
  sleep 5 # brief delay to ensure the configuration is fully updated
  docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

  echo "6. blue container down"
  docker compose -f docker-compose.prod.yml down blue

  echo "7. delete unused images"
  sudo docker image prune -a -f

else

  echo "### GREEN => BLUE ###"

  echo "1. pulling update image"
  docker compose -f docker-compose.prod.yml pull blue

  echo "2. blue container up"
  docker compose -f docker-compose.prod.yml up -d blue # blue 컨테이너 실행

  while [ 1 = 1 ]; do
  echo "3. blue health check..."
  sleep 3
  
  REQUEST=$(curl http://127.0.0.1:4001) # blue로 request

  if [ -n "$REQUEST" ]; then # 서비스 가능하면 health check 중지
    echo "✅ blue health check success"
    break ;
  fi
  done;

  echo "4. update nginx settings with new service"
  NGINX_UPSTREAM="blue:4000"
  sed -i "s/proxy_pass http:\/\/.*:4000;/proxy_pass http:\/\/$NGINX_UPSTREAM;/" ./nginx/default.conf

  echo "5. reload nginx" 
  docker cp ./nginx/default.conf nginx:/etc/nginx/conf.d/default.conf
  sleep 5 # brief delay to ensure the configuration is fully updated
  docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

  echo "6. green container down"
  docker compose -f docker-compose.prod.yml down green

  echo "7. delete unused images"
  sudo docker image prune -a -f

fi