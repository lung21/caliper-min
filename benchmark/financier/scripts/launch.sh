#! /bin/bash

infoln "Running Financier Benchmark..."

CONTAINER_NAME="fabric-cli"
DOCKER_IMAGE="node:8.11.2"
NETWORK_NAME="may_bc"

ROOT_PATH="/data"
CALIPER_PATH="$ROOT_PATH/go/src/github.com/lung21/caliper-min"

WORKLOAD_FILEPATH=$CALIPER_PATH/benchmark/financier/workload/$WORKLOAD_NAME.json
OUTPUT_FILEPATH=$ROOT_PATH/fabric-experiment/stats/caliper/caliper_${WORKLOAD_NAME}t${COMPUTATION_TIME}_stat.json
NETWORK_FILEPATH=$ROOT_PATH/fabric-experiment/config/setup.json

infoln "Stopping and removing $CONTAINER_NAME"
ssh slave-59 "docker rm -f $CONTAINER_NAME && docker volume prune -f"

infoln "Starting $CONTAINER_NAME"
ssh slave-59 "docker run -dt --name $CONTAINER_NAME --volume $HOME:$ROOT_PATH --network $NETWORK_NAME $DOCKER_IMAGE"

which npx
if [ $? -ne 0 ]; then 
  fatalln "npx not found. exiting..."
fi

infoln "Transpiling .ts files..."
CWD=$PWD
infoln "cd into caliper-min project dir"

cd $HOME/go/src/github.com/lung21/caliper-min
npx tsc benchmark/financier/generator.ts
if [ $? -ne 0 ]; then 
  fatalln "failed to transpile. exiting..."
fi

cp benchmark/financier/workload/${WORKLOAD_NAME}.json $FINAL_DIR

infoln "cd back into experiment project dir"
cd $CWD

ssh slave-59 "docker exec -t $CONTAINER_NAME \
  node $CALIPER_PATH/src/main.js \
  -c $WORKLOAD_FILEPATH \
  -n $NETWORK_FILEPATH \
  -r $OUTPUT_FILEPATH"