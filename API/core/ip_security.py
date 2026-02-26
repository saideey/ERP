"""
IP Security: Geo-blocking (Uzbekistan only) + Tenant IP whitelist.
Uses ip-api.com with aggressive caching for geo lookups.
"""

import time
import ipaddress
import logging
from typing import Optional
from collections import OrderedDict

import httpx

logger = logging.getLogger(__name__)

# ============================================================
#  GEO CACHE — TTL 24 hours, max 10,000 entries
# ============================================================
_GEO_CACHE: OrderedDict[str, tuple[str, float]] = OrderedDict()
_GEO_CACHE_TTL = 86400  # 24 hours
_GEO_CACHE_MAX = 10000

ALLOWED_COUNTRIES = {"UZ"}  # Only Uzbekistan

# Private/local IPs always allowed (for development, Docker, etc.)
_PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def is_private_ip(ip: str) -> bool:
    """Check if IP is private/loopback — always allowed."""
    try:
        addr = ipaddress.ip_address(ip.strip())
        return any(addr in net for net in _PRIVATE_NETS)
    except ValueError:
        return False


def _cache_get(ip: str) -> Optional[str]:
    """Get country code from cache if not expired."""
    if ip in _GEO_CACHE:
        country, ts = _GEO_CACHE[ip]
        if time.time() - ts < _GEO_CACHE_TTL:
            _GEO_CACHE.move_to_end(ip)
            return country
        del _GEO_CACHE[ip]
    return None


def _cache_set(ip: str, country: str):
    """Store country in cache with eviction."""
    if len(_GEO_CACHE) >= _GEO_CACHE_MAX:
        _GEO_CACHE.popitem(last=False)
    _GEO_CACHE[ip] = (country, time.time())


def get_country(ip: str) -> Optional[str]:
    """
    Get country code for IP. Returns 'UZ', 'RU', 'US', etc.
    Returns None if lookup fails (we allow on failure — fail-open for availability).
    """
    if is_private_ip(ip):
        return "UZ"  # Private IPs treated as local

    cached = _cache_get(ip)
    if cached is not None:
        return cached

    try:
        # ip-api.com — free, no API key needed, 45 req/min
        r = httpx.get(
            f"http://ip-api.com/json/{ip}?fields=status,countryCode",
            timeout=3.0,
        )
        data = r.json()
        if data.get("status") == "success":
            country = data.get("countryCode", "XX")
            _cache_set(ip, country)
            return country
        else:
            _cache_set(ip, "XX")
            return "XX"
    except Exception as e:
        logger.warning(f"Geo-IP lookup failed for {ip}: {e}")
        # Fail-open: if we can't determine country, allow
        return None


def is_uzbekistan_ip(ip: str) -> bool:
    """
    Check if IP is from Uzbekistan.
    Returns True for private IPs and when lookup fails (fail-open).
    """
    if is_private_ip(ip):
        return True

    country = get_country(ip)
    if country is None:
        # Lookup failed — fail-open for availability
        logger.warning(f"Geo lookup failed for {ip}, allowing (fail-open)")
        return True

    return country in ALLOWED_COUNTRIES


def is_ip_in_whitelist(ip: str, allowed_ips: list[str]) -> bool:
    """
    Check if IP matches any entry in the whitelist.
    Supports:
      - Exact IPs: "203.0.113.50"
      - CIDR ranges: "203.0.113.0/24"
      - Wildcards: "203.0.113.*"
    
    Empty whitelist = all IPs allowed (no restriction).
    """
    if not allowed_ips:
        return True  # No whitelist = no restriction

    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError:
        return False

    for entry in allowed_ips:
        entry = entry.strip()
        if not entry:
            continue

        # Wildcard: "203.0.113.*"
        if "*" in entry:
            pattern = entry.replace(".", "\\.").replace("*", "\\d+")
            import re
            if re.match(f"^{pattern}$", ip):
                return True
            continue

        # CIDR: "203.0.113.0/24"
        if "/" in entry:
            try:
                if addr in ipaddress.ip_network(entry, strict=False):
                    return True
            except ValueError:
                continue
            continue

        # Exact match
        if ip.strip() == entry:
            return True

    return False


def extract_client_ip(request) -> str:
    """Extract real client IP from request, handling proxies."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"
