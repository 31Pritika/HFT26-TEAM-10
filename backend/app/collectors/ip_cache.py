"""Resolves provider hostnames so a bare remote IP can be tied to a provider."""
from __future__ import annotations

import ipaddress
import socket
from concurrent.futures import ThreadPoolExecutor

from ..fingerprints import matcher
from .base import Collector

REFRESH_S = 300
WORKERS = 8
DIRECT_CONFIDENCE = 0.8
SHARED_CONFIDENCE = 0.6
# Cloudflare and Fastly: one IP can serve thousands of unrelated sites, so a match here is only a hint.
CDN_NETWORKS = tuple(ipaddress.ip_network(cidr) for cidr in (
    "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "162.158.0.0/15", "188.114.96.0/20", "141.101.64.0/18",
    "198.41.128.0/17", "151.101.0.0/16", "199.232.0.0/16",
))


def provider_hosts() -> list[tuple[str, str]]:
    return [(provider["id"], host) for provider in matcher.PROVIDERS for host in provider["hosts"]
            if "*" not in host and host not in matcher.LOCAL_HOSTS]


def resolve(host: str) -> set[str]:
    try:
        return {info[4][0] for info in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)}
    except OSError:
        return set()


def is_shared(ip: str) -> bool:
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(address in network for network in CDN_NETWORKS if network.version == address.version)


def build_cache(resolved: list[tuple[str, set[str]]]) -> dict[str, tuple[str, float]]:
    owners: dict[str, set[str]] = {}
    for provider_id, addresses in resolved:
        for ip in addresses:
            owners.setdefault(ip, set()).add(provider_id)
    return {ip: (sorted(ids)[0], SHARED_CONFIDENCE if len(ids) > 1 or is_shared(ip) else DIRECT_CONFIDENCE) for ip, ids in owners.items()}


class IpCache(Collector):
    name = "ip_cache"
    interval = REFRESH_S

    def poll(self) -> None:
        hosts = provider_hosts()
        with ThreadPoolExecutor(WORKERS) as pool:
            results = list(pool.map(resolve, [host for _, host in hosts]))
        cache = build_cache([(provider_id, addresses) for (provider_id, _), addresses in zip(hosts, results)])
        if not cache:  # Keep the previous map: being offline should not erase what we know.
            self.report(reason="Could not resolve any provider host")
            return
        matcher.set_ip_cache(cache)
        missing = sum(not addresses for addresses in results)
        self.report(reason=f"{missing} of {len(hosts)} hosts did not resolve" if missing else None)
