"""
Login and authentication API test cases.
Professional messages: invalid credentials, missing email, missing password.
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User, UserActivityLog


class LoginAPITests(APITestCase):
    """Test cases for POST /api/auth/login/ with professional error messages."""

    def setUp(self):
        self.login_url = reverse("token_obtain_pair")
        self.valid_email = "testuser@example.com"
        self.valid_password = "TestPass123!"
        self.user = User.objects.create_user(
            email=self.valid_email,
            password=self.valid_password,
            is_active=True,
        )

    def test_invalid_email_and_invalid_password_returns_401(self):
        """Invalid User ID & Invalid Password: wrong email, wrong password."""
        response = self.client.post(
            self.login_url,
            {"email": "wrong@example.com", "password": "WrongPass456!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            response.data.get("error"),
            "Invalid credentials. Please check your email and password.",
        )
        row = UserActivityLog.objects.latest("created_at")
        self.assertEqual(row.event_type, "login_failed_unknown_email")
        self.assertIsNone(row.user)
        self.assertEqual(row.attempted_email, User.objects.normalize_email("wrong@example.com"))

    def test_invalid_email_and_blank_password_returns_400(self):
        """Invalid User ID & Blank Password: wrong email, blank password."""
        response = self.client.post(
            self.login_url,
            {"email": "wrong@example.com", "password": ""},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("error"), "Please enter your password.")
        row = UserActivityLog.objects.latest("created_at")
        self.assertEqual(row.event_type, "login_failed_blank_password")
        self.assertIsNone(row.user)
        self.assertEqual(row.attempted_email, User.objects.normalize_email("wrong@example.com"))

    def test_valid_email_and_blank_password_returns_400(self):
        """Valid User ID & Blank Password: valid email, blank password."""
        response = self.client.post(
            self.login_url,
            {"email": self.valid_email, "password": ""},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("error"), "Please enter your password.")
        row = UserActivityLog.objects.latest("created_at")
        self.assertEqual(row.event_type, "login_failed_blank_password")
        self.assertEqual(row.user, self.user)
        self.assertEqual(row.attempted_email, User.objects.normalize_email(self.valid_email))

    def test_valid_email_and_invalid_password_returns_401(self):
        """Valid User ID & Invalid Password: correct email, wrong password."""
        response = self.client.post(
            self.login_url,
            {"email": self.valid_email, "password": "WrongPass456!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            response.data.get("error"),
            "Invalid credentials. Please check your email and password.",
        )
        row = UserActivityLog.objects.latest("created_at")
        self.assertEqual(row.event_type, "login_failed_invalid_password")
        self.assertEqual(row.user, self.user)

    def test_invalid_email_and_valid_password_returns_401(self):
        """Invalid User ID & Valid Password: wrong email, correct password."""
        response = self.client.post(
            self.login_url,
            {"email": "wrong@example.com", "password": self.valid_password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            response.data.get("error"),
            "Invalid credentials. Please check your email and password.",
        )
        row = UserActivityLog.objects.latest("created_at")
        self.assertEqual(row.event_type, "login_failed_unknown_email")

    def test_valid_email_and_valid_password_returns_200_with_tokens(self):
        """Valid User ID & Valid Password: correct credentials."""
        response = self.client.post(
            self.login_url,
            {"email": self.valid_email, "password": self.valid_password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertNotIn("error", response.data)
        row = UserActivityLog.objects.latest("created_at")
        self.assertEqual(row.event_type, "manual_login")
        self.assertEqual(row.user, self.user)

    def test_missing_email_returns_400(self):
        """Missing email: omit or blank email."""
        response = self.client.post(
            self.login_url,
            {"email": "", "password": self.valid_password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("error"), "Please enter your email.")
        row = UserActivityLog.objects.latest("created_at")
        self.assertEqual(row.event_type, "login_failed_blank_email")
