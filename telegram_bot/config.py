"""
Telegram Bot Configuration — Multi-Tenant SaaS

Single bot for all tenants. No tenant-specific config here.
Tenant context comes per-request from API.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Telegram Bot (single bot for all tenants)
    BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

    # HTTP Server
    HTTP_HOST = os.getenv("BOT_HTTP_HOST", "0.0.0.0")
    HTTP_PORT = int(os.getenv("BOT_HTTP_PORT", "8081"))

    # API URL (for deep linking callbacks)
    API_URL = os.getenv("API_URL", "http://api:8000")

    @classmethod
    def validate(cls):
        if not cls.BOT_TOKEN:
            raise ValueError("TELEGRAM_BOT_TOKEN is required")
        return True


config = Config()
