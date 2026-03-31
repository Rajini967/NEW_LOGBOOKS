from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User, UserRole


class LogbooksApiSmokeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="logbook-smoke@example.com",
            password="testpass123",
            role=UserRole.OPERATOR,
            name="Logbook Smoke",
            is_active=True,
        )
        self.url = reverse("logbook-schema-list")

    def test_list_requires_authentication(self):
        response = self.client.get(self.url, follow=True)
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_list_authenticated_returns_non_server_error(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url, follow=True)
        self.assertNotEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
