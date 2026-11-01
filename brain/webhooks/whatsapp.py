"""WhatsApp webhook receiver.

Receives inbound WhatsApp messages from OpenWA (gateway:2785) webhook
and forwards them to the OpenJarvis brain (port 8000) for processing.
"""

import hashlib
import hmac
import json
import logging

import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request

logger = logging.getLogger("aegis.webhooks.whatsapp")

router = APIRouter(prefix="/webhooks/whatsapp", tags=["whatsapp"])

WEBHOOK_SECRET = None  # set from env at startup


def verify_signature(payload: bytes, signature: str | None) -> bool:
    """Verify the WhatsApp webhook HMAC signature."""
    if not WEBHOOK_SECRET or not signature:
        return False
    expected = hmac.new(
        WEBHOOK_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def forward_to_brain(message_payload: dict) -> None:
    """Forward a normalized WhatsApp message to the brain core."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                "http://brain:8000/v1/messages",
                json=message_payload,
            )
            resp.raise_for_status()
            logger.info("Forwarded message to brain: %s", resp.status_code)
        except httpx.RequestError as exc:
            logger.error("Failed to forward message to brain: %s", exc)


@router.post("")
async def whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: str | None = Header(default=None),
    x_verify_token: str | None = Header(default=None),
):
    """Handle incoming WhatsApp webhook events from OpenWA."""
    body = await request.body()

    if not verify_signature(body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # WhatsApp verification handshake
    if payload.get("hub.mode") == "subscribe":
        if x_verify_token != "aegis_verify_token":
            raise HTTPException(status_code=403, detail="Verify token mismatch")
        return {"hub.challenge": payload.get("hub.challenge")}

    # Normalize inbound message
    message = {
        "source": "whatsapp",
        "type": "inbound",
        "payload": payload,
        "timestamp": payload.get("timestamp"),
    }

    background_tasks.add_task(forward_to_brain, message)
    return {"status": "queued"}
