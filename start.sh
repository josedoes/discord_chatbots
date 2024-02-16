#!/bin/bash
COMPOSE_FILE="docker-compose.yaml"


# Run 
docker-compose -f $COMPOSE_FILE down
docker-compose -f $COMPOSE_FILE build 
docker-compose -f $COMPOSE_FILE up -d --force-recreate
