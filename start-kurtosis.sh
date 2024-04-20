#!/bin/bash

# Run without spammers
kurtosis --enclave local-eth-testnet run github.com/kurtosis-tech/ethereum-package '{"mev_type": "null","additional_services": ["el_forkmon", "beacon_metrics_gazer", "dora", "prometheus_grafana" ]}'
