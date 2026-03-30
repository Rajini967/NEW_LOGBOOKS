"""
User Creation and Role Management API tests.
Covers: create+role, duplicate email, admin change password, deactivate,
login deactivated, lock after 3 attempts, login locked, admin unlock, login after unlock.
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User, UserRole


class UserCreationAndLockAPITests(APITestCase):
    """Test cases for user creation, role assignment, lockout, and unlock."""

    def setUp(self):
        self.login_url = reverse("token_obtain_pair")
        self.manager = User.objects.create_user(
            email="manager@example.com",
            password="ManagerPass123!",
            role=UserRole.ADMIN,
            is_active=True,
        )
        self.operator_email = "operator@example.com"
        self.operator_password = "OperatorPass123!"

    def test_1_create_new_user_and_assign_role(self):
        """Create new user and assign role: POST user list -> 201, response has email and role."""
        url = reverse("user-list")
        self.client.force_authenticate(user=self.manager)
        data = {
            "email": self.operator_email,
            "password": self.operator_password,
            "password_confirm": self.operator_password,
            "role": UserRole.OPERATOR,
            "is_active": True,
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data.get("email"), self.operator_email)
        self.assertEqual(response.data.get("role"), UserRole.OPERATOR)
        self.assertTrue(User.objects.filter(email=self.operator_email, role=UserRole.OPERATOR).exists())

    def test_2_unique_email_validation(self):
        """Duplicate email: POST create with existing email -> 400, message indicates duplicate."""
        User.objects.create_user(
            email=self.operator_email,
            password=self.operator_password,
            role=UserRole.OPERATOR,
            is_active=True,
        )
        url = reverse("user-list")
        self.client.force_authenticate(user=self.manager)
        data = {
            "email": self.operator_email,
            "password": "OtherPass123!",
            "password_confirm": "OtherPass123!",
            "role": UserRole.SUPERVISOR,
            "is_active": True,
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        email_errors = response.data.get("email")
        self.assertTrue(email_errors is not None)
        msg = email_errors[0] if isinstance(email_errors, list) else str(email_errors)
        self.assertIn("already exists", msg.lower())

    def test_3_admin_change_user_password(self):
        """Admin change user password: PATCH user with new password -> 200; check_password works."""
        user = User.objects.create_user(
            email=self.operator_email,
            password=self.operator_password,
            role=UserRole.OPERATOR,
            is_active=True,
        )
        url = reverse("user-detail", args=[user.id])
        self.client.force_authenticate(user=self.manager)
        new_password = "NewSecurePass456!"
        response = self.client.patch(
            url,
            {"password": new_password, "password_confirm": new_password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.check_password(new_password))

    def test_4_deactivate_user(self):
        """Deactivate user: PATCH user with is_active false -> 200, user.is_active is False."""
        user = User.objects.create_user(
            email=self.operator_email,
            password=self.operator_password,
            role=UserRole.OPERATOR,
            is_active=True,
        )
        url = reverse("user-detail", args=[user.id])
        self.client.force_authenticate(user=self.manager)
        response = self.client.patch(url, {"is_active": False}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertFalse(user.is_active)

    def test_5_login_with_deactivated_user(self):
        """Login with deactivated user -> 401 and 'inactive or deleted' in message."""
        user = User.objects.create_user(
            email=self.operator_email,
            password=self.operator_password,
            role=UserRole.OPERATOR,
            is_active=False,
        )
        response = self.client.post(
            self.login_url,
            {"email": self.operator_email, "password": self.operator_password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("inactive", response.data.get("error", "").lower())

    def test_6_lock_after_3_invalid_attempts(self):
        """Lock after 3 invalid attempts: 3x login with valid email, wrong password -> user locked."""
        user = User.objects.create_user(
            email=self.operator_email,
            password=self.operator_password,
            role=UserRole.OPERATOR,
            is_active=True,
        )
        wrong_password = "WrongPass123!"
        for _ in range(3):
            self.client.post(
                self.login_url,
                {"email": self.operator_email, "password": wrong_password},
                format="json",
            )
        user.refresh_from_db()
        self.assertTrue(user.is_locked(), "User should be locked after 3 failed attempts")
        self.assertIsNotNone(user.locked_until)

    def test_7_login_with_locked_user(self):
        """Login with locked user (correct credentials) -> 401 and 'locked' in message."""
        user = User.objects.create_user(
            email=self.operator_email,
            password=self.operator_password,
            role=UserRole.OPERATOR,
            is_active=True,
        )
        wrong_password = "WrongPass123!"
        for _ in range(3):
            self.client.post(
                self.login_url,
                {"email": self.operator_email, "password": wrong_password},
                format="json",
            )
        response = self.client.post(
            self.login_url,
            {"email": self.operator_email, "password": self.operator_password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("locked", response.data.get("error", "").lower())

    def test_8_admin_unlock(self):
        """Admin unlock: POST unlock for locked user -> 200, message; user.locked_until None, failed_login_attempts 0."""
        user = User.objects.create_user(
            email=self.operator_email,
            password=self.operator_password,
            role=UserRole.OPERATOR,
            is_active=True,
        )
        wrong_password = "WrongPass123!"
        for _ in range(3):
            self.client.post(
                self.login_url,
                {"email": self.operator_email, "password": wrong_password},
                format="json",
            )
        user.refresh_from_db()
        self.assertTrue(user.is_locked())
        url = reverse("user-unlock", args=[user.id])
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("unlocked successfully", response.data.get("message", "").lower())
        user.refresh_from_db()
        self.assertIsNone(user.locked_until)
        self.assertEqual(user.failed_login_attempts, 0)

    def test_9_login_after_unlock(self):
        """Login after unlock: POST login with same credentials -> 200 and access token."""
        user = User.objects.create_user(
            email=self.operator_email,
            password=self.operator_password,
            role=UserRole.OPERATOR,
            is_active=True,
        )
        wrong_password = "WrongPass123!"
        for _ in range(3):
            self.client.post(
                self.login_url,
                {"email": self.operator_email, "password": wrong_password},
                format="json",
            )
        user.refresh_from_db()
        self.assertTrue(user.is_locked())
        unlock_url = reverse("user-unlock", args=[user.id])
        self.client.force_authenticate(user=self.manager)
        self.client.post(unlock_url, {}, format="json")
        self.client.force_authenticate(user=None)
        response = self.client.post(
            self.login_url,
            {"email": self.operator_email, "password": self.operator_password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
