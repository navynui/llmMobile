import os
import json

from utils.common import IMAGE_GEN_OUTPUT

try:
    from pywebpush import webpush, WebPushException
    HAS_WEBPUSH = True
except ImportError:
    HAS_WEBPUSH = False

VAPID_PUBLIC_KEY = ""
VAPID_PRIVATE_KEY = ""
VAPID_KEYS_FILE = os.path.join(IMAGE_GEN_OUTPUT, "vapid_keys.json")
_push_subscriptions = []
SUBS_FILE_PATH = os.path.join(IMAGE_GEN_OUTPUT, "push_subscriptions.json")

def _init_vapid_keys():
    global VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
    if os.path.exists(VAPID_KEYS_FILE):
        try:
            with open(VAPID_KEYS_FILE) as f:
                data = json.load(f)
                VAPID_PUBLIC_KEY = data.get("public_key")
                VAPID_PRIVATE_KEY = data.get("private_key")
        except Exception:
            pass
            
    if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
        if HAS_WEBPUSH:
            try:
                from cryptography.hazmat.primitives.asymmetric import ec
                from cryptography.hazmat.primitives import serialization
                import base64
                
                private_key = ec.generate_private_key(ec.SECP256R1())
                private_der = private_key.private_bytes(
                    encoding=serialization.Encoding.DER,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption()
                )
                
                public_key = private_key.public_key()
                public_bytes = public_key.public_bytes(
                    encoding=serialization.Encoding.X962,
                    format=serialization.PublicFormat.UncompressedPoint
                )
                
                VAPID_PUBLIC_KEY = base64.urlsafe_b64encode(public_bytes).decode().rstrip("=")
                VAPID_PRIVATE_KEY = base64.urlsafe_b64encode(private_der).decode().rstrip("=")
                
                os.makedirs(IMAGE_GEN_OUTPUT, exist_ok=True)
                with open(VAPID_KEYS_FILE, "w") as f:
                    json.dump({"public_key": VAPID_PUBLIC_KEY, "private_key": VAPID_PRIVATE_KEY}, f)
                print("[VAPID] Generated and saved new VAPID keys.")
            except Exception as e:
                print(f"[VAPID] Failed to generate VAPID keys programmatically: {e}. Using dev-fallback.")
                VAPID_PUBLIC_KEY = "BEl6mABClg1401306C9V8t-mC9c-L6121401306C9V8t-mC9c-L6121401306C"
                VAPID_PRIVATE_KEY = "DEV_FALLBACK_KEY"
        else:
            print("[VAPID] WebPush not available. Using dev-fallback keys.")
            VAPID_PUBLIC_KEY = "BEl6mABClg1401306C9V8t-mC9c-L6121401306C9V8t-mC9c-L6121401306C"
            VAPID_PRIVATE_KEY = "DEV_FALLBACK_KEY"

def _load_subscriptions():
    global _push_subscriptions
    if os.path.exists(SUBS_FILE_PATH):
        try:
            with open(SUBS_FILE_PATH) as f:
                _push_subscriptions = json.load(f)
        except Exception:
            _push_subscriptions = []

def _save_subscriptions():
    try:
        os.makedirs(IMAGE_GEN_OUTPUT, exist_ok=True)
        with open(SUBS_FILE_PATH, "w") as f:
            json.dump(_push_subscriptions, f)
    except Exception:
        pass

def _send_push_notification(title: str, body: str):
    global _push_subscriptions
    if not HAS_WEBPUSH or VAPID_PRIVATE_KEY == "DEV_FALLBACK_KEY":
        print(f"[Push Notifications] Push not configured/available. Logging: {title} - {body}")
        return

    vapid_claims = {
        "sub": "mailto:admin@localhost"
    }

    for sub in list(_push_subscriptions):
        try:
            webpush(
                subscription_info=sub,
                data=json.dumps({"title": title, "body": body}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=vapid_claims
            )
            print(f"[Push Notifications] Sent push to {sub.get('endpoint')}")
        except WebPushException as ex:
            print(f"[Push Notifications] Failed to send push: {ex}")
            if ex.response and ex.response.status_code in (404, 410):
                try:
                    _push_subscriptions.remove(sub)
                    _save_subscriptions()
                except Exception:
                    pass
        except Exception as e:
            print(f"[Push Notifications] Error sending push: {e}")

# ───────────────────────────────────────────────
# Public API for main.py
# ───────────────────────────────────────────────

def init_push():
    """Initialize VAPID keys and load persisted subscriptions. Call at startup."""
    _init_vapid_keys()
    _load_subscriptions()

def get_vapid_public_key() -> str:
    return VAPID_PUBLIC_KEY

def subscribe(subscription_info: dict):
    """Add a push subscription and persist it."""
    global _push_subscriptions
    endpoint = subscription_info.get("endpoint", "")
    # De-duplicate by endpoint
    if not any(s.get("endpoint") == endpoint for s in _push_subscriptions):
        _push_subscriptions.append(subscription_info)
        _save_subscriptions()

def unsubscribe(endpoint: str):
    """Remove a subscription by endpoint and persist."""
    global _push_subscriptions
    _push_subscriptions = [s for s in _push_subscriptions if s.get("endpoint") != endpoint]
    _save_subscriptions()

def send_push(title: str, body: str):
    """Public wrapper for sending a push notification."""
    _send_push_notification(title, body)
