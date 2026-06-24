from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .models import Conversation, Message


class ChatConsumer(AsyncJsonWebsocketConsumer):
    """Realtime 1:1 chat within a conversation."""

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.user = user
        self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        conv = await self._get_conversation(self.conversation_id, user)
        if conv is None:
            await self.close(code=4403)
            return
        self.client_id = conv.client_id
        self.master_id = conv.master_id
        self.group = f"chat_{self.conversation_id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content):
        text = (content or {}).get("text", "").strip()
        if not text:
            return
        msg = await self._save_message(self.conversation_id, self.user, text)
        await self.channel_layer.group_send(
            self.group, {"type": "chat_message", "message": msg}
        )
        # Also ping the recipient's personal notification stream so they get a
        # "new message" badge even when they're not viewing this thread.
        recipient = self.master_id if self.user.id == self.client_id else self.client_id
        await self.channel_layer.group_send(
            f"notify_{recipient}",
            {
                "type": "notify",
                "payload": {
                    "event": "chat.message",
                    "conversation": self.conversation_id,
                    "from_name": msg["sender_name"],
                    "text": msg["text"],
                },
            },
        )

    async def chat_message(self, event):
        await self.send_json({"event": "message", **event["message"]})

    @database_sync_to_async
    def _get_conversation(self, conv_id, user):
        conv = Conversation.objects.filter(id=conv_id).first()
        if conv and conv.has_member(user):
            return conv
        return None

    @database_sync_to_async
    def _save_message(self, conv_id, user, text):
        msg = Message.objects.create(conversation_id=conv_id, sender=user, text=text)
        Conversation.objects.filter(id=conv_id).update(updated_at=msg.created_at)
        return {
            "id": msg.id,
            "conversation": conv_id,
            "sender": user.id,
            "sender_name": user.display_name,
            "text": msg.text,
            "created_at": msg.created_at.isoformat(),
        }
