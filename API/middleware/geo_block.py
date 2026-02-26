"""
Security middleware: Geo-blocking (Uzbekistan only).
Blocks ALL non-UZ IP requests with generic 403.
"""

import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from core.ip_security import is_uzbekistan_ip, extract_client_ip, is_private_ip

logger = logging.getLogger(__name__)

# Paths that bypass geo-check (health, OPTIONS preflight)
BYPASS_PATHS = {"/", "/docs", "/redoc", "/openapi.json"}


class GeoBlockMiddleware(BaseHTTPMiddleware):
    """
    Blocks requests from non-Uzbekistan IPs.
    Private/local IPs (Docker, localhost) are always allowed.
    Returns generic 403 — does NOT reveal geo-blocking.
    """

    async def dispatch(self, request: Request, call_next):
        # Always allow OPTIONS (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Allow health/docs paths
        if request.url.path in BYPASS_PATHS:
            return await call_next(request)

        ip = extract_client_ip(request)

        # Private IPs always pass
        if is_private_ip(ip):
            return await call_next(request)

        # Geo check
        if not is_uzbekistan_ip(ip):
            logger.warning(f"GEO-BLOCKED: {ip} → {request.url.path}")
            return JSONResponse(
                status_code=403,
                content={"detail": "Ruxsat berilmagan"}
            )

        return await call_next(request)
