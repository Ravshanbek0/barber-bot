import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Initialise Django ASGI app early so apps are loaded before importing
# anything that touches models / the ORM.
django_asgi_app = get_asgi_application()

from django.conf import settings  # noqa: E402
from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

from apps.chat.middleware import JWTAuthMiddleware  # noqa: E402
import apps.chat.routing  # noqa: E402
import apps.bookings.routing  # noqa: E402

websocket_urlpatterns = (
    apps.chat.routing.websocket_urlpatterns
    + apps.bookings.routing.websocket_urlpatterns
)

ws_app = JWTAuthMiddleware(AuthMiddlewareStack(URLRouter(websocket_urlpatterns)))

# In DEBUG, skip Origin validation so the app works over tunnels (ngrok /
# cloudflare) whose host isn't in ALLOWED_HOSTS. Enforce it in production.
if not settings.DEBUG:
    ws_app = AllowedHostsOriginValidator(ws_app)

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": ws_app,
    }
)
