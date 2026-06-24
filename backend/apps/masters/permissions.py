from rest_framework import permissions


class IsOwnerMasterOrReadOnly(permissions.BasePermission):
    """Read for anyone; write only by the master who owns the object."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        master = getattr(obj, "master", obj)
        owner = getattr(master, "user", None)
        return owner == request.user
