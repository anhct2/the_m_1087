from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # PostgreSQL
    postgres_host: str = "localhost"
    postgres_port: int = 5555
    postgres_db:   str = "m1087"
    postgres_user: str = "m1087"
    postgres_pass: str = ""

    # Frigate
    frigate_url: str = "http://10.8.0.112:5000"

    # Auth — simple mode (upgrade: set jwt_secret + use JWT)
    auth_username: str = "admin"
    auth_password: str = "changeme"
    # For JWT upgrade later:
    # jwt_secret: str = "change-me"
    # jwt_expire_minutes: int = 60 * 24

    # Misc
    tz: str = "Asia/Ho_Chi_Minh"
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
