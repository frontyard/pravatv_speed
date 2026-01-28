## Build

### Build token module
docker build --pull --no-cache --build-arg MODULE=token -t pravatv_token:3.0.0 .

### Build speed module
docker build --pull --no-cache --build-arg MODULE=speed -t pravatv_speed:3.0.0 .

## Run from shell

### Run token module
docker run --rm -p 3000:3000 \
  -e PORT=3000 -e LOG_LEVEL=info -e LINK_SECRET=change_me \
  pravatv_token:3.0.0

### Run speed module
docker run --rm -p 3000:3000 \
  -e PORT=3000 -e LOG_LEVEL=info \
  pravatv_speed:3.0.0

## Publish

### Login to remote repo
docker login docker.klik.cc -u pravatv -p fHXsg2yDHyzUxpLE

### Publish token module
docker tag pravatv_token:latest docker.klik.cc/pravatv_token
docker push docker.klik.cc/pravatv_token

### Publish speed module
docker tag pravatv_speed:latest docker.klik.cc/pravatv_speed
docker push docker.klik.cc/pravatv_speed