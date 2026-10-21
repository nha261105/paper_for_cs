"""Tiny HTTP helper with per-key throttling and retries (stdlib only)."""
import time
import urllib.error
import urllib.request

USER_AGENT = "paperfetch/0.1 (personal research CLI; python-urllib)"
RETRY_STATUS = {429, 500, 502, 503, 504}

_last_request: dict[str, float] = {}


def get(url: str, *, throttle_key: str, min_interval: float = 0.0,
        timeout: float = 60, retries: int = 3) -> bytes:
    """GET `url`, waiting so that requests sharing `throttle_key` are at least
    `min_interval` seconds apart. Retries transient errors with backoff."""
    for attempt in range(1, retries + 1):
        wait = _last_request.get(throttle_key, 0.0) + min_interval - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code not in RETRY_STATUS or attempt == retries:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == retries:
                raise
        finally:
            _last_request[throttle_key] = time.monotonic()
        time.sleep(min_interval * attempt)
    raise RuntimeError("unreachable")
