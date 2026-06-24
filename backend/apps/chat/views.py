from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User
from apps.masters.models import MasterProfile

from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer


class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Conversation.objects.filter(
            Q(client=user) | Q(master=user)
        ).prefetch_related("messages")

    @action(detail=False, methods=["post"])
    def start(self, request):
        """Open (or reuse) a thread with a master by handle."""
        handle = request.data.get("handle")
        master_profile = MasterProfile.objects.filter(handle=handle).first()
        if not master_profile:
            return Response({"detail": "Master topilmadi"}, status=404)
        conv, _ = Conversation.objects.get_or_create(
            client=request.user, master=master_profile.user
        )
        return Response(ConversationSerializer(conv).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"])
    def messages(self, request, pk=None):
        conv = self.get_object()
        if not conv.has_member(request.user):
            return Response({"detail": "Ruxsat yo'q"}, status=403)
        Message.objects.filter(conversation=conv).exclude(sender=request.user).update(
            is_read=True
        )
        return Response(MessageSerializer(conv.messages.all(), many=True).data)
