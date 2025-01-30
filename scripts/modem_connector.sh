#!/bin/bash

INTERFACE="wwan0"

IP_ADDRESS=$(ip -4 addr show $INTERFACE | grep -oP '(?<=inet\s)\d+(\.\d+){3}')

if [[ -n $IP_ADDRESS ]]; then
    echo "wwan0 ok"
else
    mmcli -m 0 -e
    mmcli -m 0 --3gpp-scan --timeout=100
    mmcli -m 0 --simple-connect="apn=internet"
    dhclient wwan0
    systemctl restart tracker.service
    systemctl restart mdvr.service
fi
