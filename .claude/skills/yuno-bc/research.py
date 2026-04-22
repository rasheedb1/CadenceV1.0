#!/usr/bin/env python3
"""
Research a company's payment stack using Firecrawl.
Usage: python3 research.py <Client Name>
Output: JSON on stdout with {providers, rawFindings, debug}
"""
import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

# Maintained list of known PSPs/acquirers. Matching is case-insensitive, whitespace-normalized.
# Key = canonical display name (used in slide 06 chips). Aliases = alternate spellings found in content.
KNOWN_PSPS = {
    # Global
    "stripe": ["stripe"],
    "adyen": ["adyen"],
    "checkout.com": ["checkout.com", "checkout com"],
    "worldpay": ["worldpay"],
    "cybersource": ["cybersource"],
    "braintree": ["braintree"],
    "paypal": ["paypal", "pay pal"],
    "fiserv": ["fiserv", "first data"],
    "nuvei": ["nuvei"],
    "rapyd": ["rapyd"],
    "global payments": ["global payments"],
    "authorize.net": ["authorize.net", "authorize net"],
    "square": ["square inc", "squareup"],
    "bluesnap": ["bluesnap"],
    "payoneer": ["payoneer"],
    # LATAM
    "dlocal": ["dlocal", "d local"],
    "mercado pago": ["mercado pago", "mercadopago"],
    "payu": ["payu", "pay u "],
    "ebanx": ["ebanx"],
    "kushki": ["kushki"],
    "openpay": ["openpay", "open pay"],
    "conekta": ["conekta"],
    "culqi": ["culqi"],
    "izipay": ["izipay", "izipay "],
    "mobbex": ["mobbex"],
    "prisma": ["prisma medios de pago", "prismaspago"],
    "getnet": ["getnet"],
    "redeban": ["redeban"],
    "credibanco": ["credibanco"],
    "wompi": ["wompi"],
    "niubiz": ["niubiz"],
    "pagoefectivo": ["pagoefectivo", "pago efectivo"],
    # Asia / India
    "razorpay": ["razorpay"],
    "ccavenue": ["ccavenue"],
    "paytm": ["paytm"],
    "payu india": ["payu india"],
    "billdesk": ["billdesk"],
    "gmo": ["gmo payment"],
    # EMEA
    "mollie": ["mollie"],
    "klarna": ["klarna"],
    "trustly": ["trustly"],
    "sofort": ["sofort"],
    "ingenico": ["ingenico"],
    # Alternative payment methods (some clients list these too — include commonly cited ones)
    # Note: these are APMs not PSPs, but frequently conflated in content. We keep a separate list.
}

APM_HINTS = {
    # Payment methods often mentioned alongside PSPs
    "pix", "boleto", "oxxo", "spei", "codi", "ideal", "bancontact", "sepa",
    "upi", "paytm wallet", "gcash", "grabpay", "alipay", "wechat pay",
    "apple pay", "google pay", "samsung pay", "mada", "knet", "fawry",
}


def load_api_key() -> str:
    """Load FIRECRAWL_API_KEY from env or project .env.local."""
    key = os.environ.get("FIRECRAWL_API_KEY")
    if key:
        return key
    # Try project .env.local
    env_path = Path(__file__).resolve().parents[3] / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("FIRECRAWL_API_KEY"):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val:
                    return val
    raise SystemExit(
        "FIRECRAWL_API_KEY not found. Set it in env or add to .env.local at project root."
    )


def firecrawl_search(api_key: str, query: str, limit: int = 5) -> list:
    """Call Firecrawl /search endpoint. Returns list of {url, title, description}."""
    body = json.dumps({"query": query, "limit": limit}).encode()
    req = urllib.request.Request(
        "https://api.firecrawl.dev/v2/search",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return [{"_error": f"HTTP {e.code}: {e.read().decode()[:200]}"}]
    except Exception as e:
        return [{"_error": f"{type(e).__name__}: {e}"}]

    results = data.get("data")
    if isinstance(results, dict):
        results = results.get("web", [])
    return results or []


def firecrawl_scrape(api_key: str, url: str, max_chars: int = 4000) -> str:
    """Call Firecrawl /scrape endpoint. Returns markdown content (truncated)."""
    body = json.dumps({"url": url, "formats": ["markdown"], "onlyMainContent": True}).encode()
    req = urllib.request.Request(
        "https://api.firecrawl.dev/v2/scrape",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read())
        md = (data.get("data") or {}).get("markdown", "")
        return md[:max_chars] if md else ""
    except Exception:
        return ""


def extract_psps(corpus: str) -> list:
    """Scan content for known PSP names. Returns canonical names in order of first occurrence."""
    lower = corpus.lower()
    # Normalize whitespace
    normalized = re.sub(r"\s+", " ", lower)

    hits = []  # list of (position, canonical_name)
    for canonical, aliases in KNOWN_PSPS.items():
        for alias in aliases:
            # Word-boundary match for short names, substring for long/compound
            if len(alias) <= 4:
                pattern = r"\b" + re.escape(alias) + r"\b"
            else:
                pattern = re.escape(alias)
            m = re.search(pattern, normalized)
            if m:
                hits.append((m.start(), canonical))
                break  # one hit per canonical
    # Order by first occurrence, dedupe
    hits.sort(key=lambda t: t[0])
    seen = set()
    ordered = []
    for _, name in hits:
        if name not in seen:
            ordered.append(name)
            seen.add(name)
    return ordered


def research(client_name: str, api_key: str) -> dict:
    queries = [
        f'"{client_name}" payment providers stripe adyen PSP',
        f'"{client_name}" checkout payment processor acquirer',
        f'"{client_name}" pagos dlocal mercadopago payu',
    ]

    all_results = []
    debug = {"queries": [], "scraped": []}

    for q in queries:
        res = firecrawl_search(api_key, q, limit=5)
        debug["queries"].append({"query": q, "count": len(res)})
        all_results.extend(res)

    # Dedupe by URL
    seen_urls = set()
    unique = []
    for r in all_results:
        u = r.get("url") if isinstance(r, dict) else None
        if u and u not in seen_urls:
            seen_urls.add(u)
            unique.append(r)

    # Build corpus from titles + descriptions first (cheap)
    corpus_parts = []
    for r in unique:
        if isinstance(r, dict):
            corpus_parts.append(r.get("title", ""))
            corpus_parts.append(r.get("description", ""))
    corpus_cheap = " ".join(corpus_parts)

    providers_cheap = extract_psps(corpus_cheap)

    # If cheap scan yields < 3 providers, scrape top 2 URLs for deeper content
    providers = providers_cheap
    if len(providers) < 3:
        for r in unique[:2]:
            if not isinstance(r, dict) or not r.get("url"):
                continue
            md = firecrawl_scrape(api_key, r["url"])
            if md:
                debug["scraped"].append({"url": r["url"], "chars": len(md)})
                corpus_parts.append(md)
        corpus_full = " ".join(corpus_parts)
        providers = extract_psps(corpus_full)

    # Cap at 12 providers (slide 06 design constraint)
    providers = providers[:12]

    return {
        "client": client_name,
        "providers": providers,
        "providerCount": len(providers),
        "debug": debug,
        "rawFindings": [
            {"title": r.get("title", ""), "url": r.get("url", "")}
            for r in unique[:10] if isinstance(r, dict)
        ],
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 research.py <Client Name>", file=sys.stderr)
        sys.exit(2)
    client = " ".join(sys.argv[1:]).strip()
    if not client:
        sys.exit(2)
    api_key = load_api_key()
    out = research(client, api_key)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
