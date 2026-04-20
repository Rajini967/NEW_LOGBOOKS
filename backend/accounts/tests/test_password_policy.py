"""
Password policy API tests: first-time force, complexity, min/max length,
change own password, password history (last 3), password expiry.
"""
from datetime import timedelta
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User, UserRole, UserPasswordHistory, SessionSetting, UserActivityLog


class PasswordPolicyAPITests(APITestCase):
    def setUp(self):
        self.login_url = reverse("token_obtain_pair")
        self.change_password_url = reverse("auth_change_password")
        self.me_url = reverse("user-me")
        self.valid_password = "ValidPass1!"
        self.manager = User.objects.create_user(
            email="manager@example.com",
            password=self.valid_password,
            role=UserRole.ADMIN,
            is_active=True,
            must_change_password=False,
            password_changed_at=timezone.now(),
        )

    def test_login_returns_must_change_password_flag(self):
        """First-time login: user with must_change_password=True gets flag in response."""
        user = User.objects.create_user(
            email="newuser@example.com",
            password=self.valid_password,
            role=UserRole.OPERATOR,
            is_active=True,
            must_change_password=True,
        )
        response = self.client.post(
            self.login_url,
            {"email": user.email, "password": self.valid_password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("must_change_password") is True)

    def test_password_complexity_enforcement(self):
        """Create user with weak password (no uppercase) -> 400."""
        url = reverse("user-list")
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(
            url,
            {
                "email": "weak@example.com",
                "password": "lowercase1!",
                "password_confirm": "lowercase1!",
                "role": UserRole.OPERATOR,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_minimum_password_length(self):
        """Password shorter than 8 characters -> 400."""
        url = reverse("user-list")
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(
            url,
            {
                "email": "short@example.com",
                "password": "Ab1!",
                "password_confirm": "Ab1!",
                "role": UserRole.OPERATOR,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_maximum_password_length(self):
        """Password longer than 128 characters -> 400."""
        url = reverse("user-list")
        self.client.force_authenticate(user=self.manager)
        long_password = "A" * 121 + "a1!aaaaa"  # 129 chars (max 128)
        self.assertGreater(len(long_password), 128)
        response = self.client.post(
            url,
            {
                "email": "long@example.com",
                "password": long_password,
                "password_confirm": long_password,
                "role": UserRole.OPERATOR,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_user_change_own_password_success(self):
        """Authenticated user can change own password -> 200 and new password works."""
        self.client.force_authenticate(user=self.manager)
        new_password = "NewValidPass2!"
        response = self.client.post(
            self.change_password_url,
            {
                "current_password": self.valid_password,
                "new_password": new_password,
                "new_password_confirm": new_password,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.check_password(new_password))
        self.assertFalse(self.manager.must_change_password)
        self.assertIsNotNone(self.manager.password_changed_at)

    def test_user_change_own_password_wrong_current(self):
        """Change password with wrong current password -> 400."""
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(
            self.change_password_url,
            {
                "current_password": "WrongPass1!",
                "new_password": "NewValidPass2!",
                "new_password_confirm": "NewValidPass2!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", response.data)

    def test_password_history_reuse_rejected(self):
        """Using one of last 3 passwords when changing -> 400."""
        self.client.force_authenticate(user=self.manager)
        pass_a = "NewValidPass2!"
        pass_b = "AnotherValid3!"
        pass_c = "ThirdValidPass4!"
        for current, new in [
            (self.valid_password, pass_a),
            (pass_a, pass_b),
            (pass_b, pass_c),
        ]:
            r = self.client.post(
                self.change_password_url,
                {
                    "current_password": current,
                    "new_password": new,
                    "new_password_confirm": new,
                },
                format="json",
            )
            self.assertEqual(r.status_code, status.HTTP_200_OK)
        before = UserActivityLog.objects.filter(
            user=self.manager, event_type="password_reuse_rejected"
        ).count()
        response = self.client.post(
            self.change_password_url,
            {
                "current_password": pass_c,
                "new_password": pass_a,
                "new_password_confirm": pass_a,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        after = UserActivityLog.objects.filter(
            user=self.manager, event_type="password_reuse_rejected"
        ).count()
        self.assertEqual(after, before + 1)

    def test_me_returns_password_expired_when_overdue(self):
        """GET /users/me/ returns password_expired True when past expiry."""
        self.manager.password_changed_at = timezone.now() - timedelta(days=100)
        self.manager.save()
        setting = SessionSetting.get_solo()
        setting.password_expiry_days = 90
        setting.save()
        self.client.force_authenticate(user=self.manager)
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("password_expired") is True)
