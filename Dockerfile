FROM python:3.12-slim

WORKDIR /opt/dvr

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

RUN pip install --upgrade pip

COPY . .

RUN pip install -r requirements.txt

EXPOSE 8005

COPY services/dvr.service /etc/systemd/system

CMD python3 dvr_web/server.py