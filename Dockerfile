FROM python:3.12-slim

WORKDIR /opt/mdvr

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

RUN pip install --upgrade pip

COPY . .

RUN apt-get -y update
RUN apt-get -y upgrade

RUN pip install -r requirements.txt

EXPOSE 8005

COPY services/mdvr.service /etc/systemd/system

CMD python3 dvr_web/server.py