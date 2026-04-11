#!/bin/bash
set -e
ROOTFS=/var/lib/lxc/102/rootfs
HASH=$(openssl passwd -6 'WeR4thedogs')
sed -i "s|^root:[^:]*|root:${HASH}|" ${ROOTFS}/etc/shadow
echo "Password hash written OK"
head -1 ${ROOTFS}/etc/shadow | cut -d: -f1-2
pct unmount 102
pct start 102
sleep 4
pct status 102
echo "Container started"
