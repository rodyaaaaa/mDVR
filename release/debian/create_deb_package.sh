#!/bin/bash

SERVICES_PATH="mdvr/etc/systemd/system"
PROJECT_PATH="mdvr/opt/mdvr"

echo "Check on folder exists."

if [ ! -d "$SERVICES_PATH" ]; then
  echo "$SERVICES_PATH does not exists. Try to create it."

  mkdir -p "$SERVICES_PATH"

  echo "Success!"
fi

echo "Clear $SERVICES_PATH"

# shellcheck disable=SC2115
rm -rf $SERVICES_PATH/*

if [ ! -d "$PROJECT_PATH" ]; then
  echo "$PROJECT_PATH does not exists. Try to create it."

  mkdir -p "$PROJECT_PATH"

  echo "Success"
fi

echo "Copy new files"

cp -r "../../services/." "$SERVICES_PATH"
cp -r "../../dvr_video/" "$PROJECT_PATH"
cp -r "../../dvr_web/" "$PROJECT_PATH"
cp -r "../../scripts/" "$PROJECT_PATH"
cp "../../requirements.txt" "$PROJECT_PATH"
cp "../../init_project.py" "$PROJECT_PATH"

echo "clear for some trash"

if [ -f "$PROJECT_PATH/dvr_video/data_config.json" ]; then
  echo "data_config.json exists. Try to delete it."

  rm "$PROJECT_PATH/dvr_video/data_config.json"

  echo "Success"

fi

if [ -d "$PROJECT_PATH/dvr_video/logs" ]; then
  echo "Folder logs exists. It will be deleted."

  rm -r "$PROJECT_PATH/dvr_video/logs"

  echo "Success"

fi

if [ -d "$PROJECT_PATH/dvr_video/materials" ]; then
  echo "The folder materials exists. It will be deleted."

  rm -r "$PROJECT_PATH/dvr_video/materials"

  echo "Success"

fi

if [ -d "$PROJECT_PATH/dvr_video/temp" ]; then
  echo "The folder temp exists. It will be deleted."

  rm -r "$PROJECT_PATH/dvr_video/temp"

  echo "Success"

fi

if [ -f "$PROJECT_PATH/scripts/modem_connector.sh" ]; then
  echo "Delete modem_connector.sh"

  rm "$PROJECT_PATH/scripts/modem_connector.sh"

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

echo "Success"

echo "All is ready. Try to build deb package!"

dpkg --build mdvr

if [ -f "mdvr.deb" ]; then
  echo "Success"
fi