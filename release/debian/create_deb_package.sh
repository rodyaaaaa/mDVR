#!/bin/bash

SERVICES_PATH="mDVR/etc/systemd/system"
PROJECT_PATH="mDVR/opt/mDVR"

echo "Check on folder exists."

if [ ! -d "$SERVICES_PATH" ]; then
  echo "$SERVICES_PATH does not exists. Try to create it."

  mkdir -p "$SERVICES_PATH"

  echo "Success!"
fi

if [ ! -d "$PROJECT_PATH" ]; then
  echo "$PROJECT_PATH does not exists. Try to create it."

  mkdir -p "$PROJECT_PATH"

  echo "Success"
fi

echo "Copy new files"

cp -r "../../services/." "$SERVICES_PATH"
cp -r "../../dvr_video/" "$PROJECT_PATH"
cp -r "../../dvr_web/" "$PROJECT_PATH"
cp "../../requirements.txt" "$PROJECT_PATH"

echo "clear for some trash"

if [ -f "$PROJECT_PATH/dvr_video/data_config.json" ]; then
  echo "data_config.json exists. Try to delete it."

  rm "$PROJECT_PATH/dvr_video/data_config.json"

  echo "Success"

fi

if [ -f "$SERVICES_PATH/mdvr_modem.service" ]; then
  echo "Delete mdvr_modem.service"

  rm "$SERVICES_PATH/mdvr_modem.service"

  echo "Success"

fi

if [ -f "$SERVICES_PATH/mdvr_modem.timer" ]; then
  echo "Delete mdvr_modem.timer"

  rm "$SERVICES_PATH/mdvr_modem.timer"

  echo "Success"

fi

echo "All is ready. Try to build deb package!"

dpkg --build mDVR

if [ -f "mDVR.deb" ]; then
  echo "Success"
fi