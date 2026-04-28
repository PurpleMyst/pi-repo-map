import os
from pathlib import Path

class Greeter:
    def __init__(self, name: str):
        self.name = name

    async def fetch(self) -> str:
        return self.name


def top_level() -> str:
    return os.getcwd()
