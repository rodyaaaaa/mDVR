import os
import pathlib
import aioftp

from data.utils import get_date


class FTPCon:
    def __init__(self, host_addr: str, port: int, username: str, password: str, car_name: str):
        self.port = port
        self.host = host_addr
        self.username = username
        self.password = password
        self.car_name = car_name

    async def upload_to_ftp(self):
        async with aioftp.Client.context(self.host, self.port, self.username, self.password) as client:
            if self.car_name not in await client.list():
                await client.make_directory(self.car_name)
            await client.change_directory(self.car_name)

            try:
                videos = os.listdir("materials")
            except FileNotFoundError as e:
                pathlib.Path("materials").mkdir(exist_ok=True)

            for video in videos:
                data = await get_date(video)
                print(data)
                if data not in await client.list():
                    await client.make_directory(data)
                await client.change_directory(data)

                vd = pathlib.Path("materials", video)
                await client.upload(vd)
                os.remove(vd)

                await client.change_directory()
