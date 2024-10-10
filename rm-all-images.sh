#!/bin/bash

set -x

repositories=`docker images --format '{{ .Repository }}' | egrep '(alpine|kurtosistech|ethereum|ethpandaops|grafana|prometheus|lighthouse|flashbots|protolambda|badouralix|traefik|timberio|fluent)'`

echo $repositories

for r in $repositories
do
    docker rmi $(docker images -q $r)
done
