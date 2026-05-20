import os
from functools import wraps


def my_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper


@my_decorator
def simple_decorated():
    return "hello"


@app.route("/api/items")
@auth.required
def multi_decorated():
    return []


class Controller:
    @app.route("/")
    def index(self):
        return "index"

    @app.route("/async")
    async def async_index(self):
        return "async"


@dataclass
class Config:
    name: str


def bare_function():
    pass
