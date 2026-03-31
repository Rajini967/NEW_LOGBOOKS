from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User, UserRole
from reports.models import AuditEvent


class ReportsApiSmokeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="reports-smoke@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Reports Smoke",
            is_active=True,
        )
        self.url = reverse("report-list")
        self.audit_url = reverse("audit-report-list")

    def test_report_list_requires_authentication(self):
        response = self.client.get(self.url, follow=True)
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_audit_list_authenticated_returns_non_server_error(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.audit_url, follow=True)
        self.assertNotEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)


class AuditRoleVisibilityTests(APITestCase):
    def setUp(self):
        self.super_admin = User.objects.create_user(
            email="super-admin-audit@example.com",
            password="testpass123",
            role=UserRole.SUPER_ADMIN,
            name="Super Admin",
            is_active=True,
        )
        self.admin = User.objects.create_user(
            email="admin-audit@example.com",
            password="testpass123",
            role=UserRole.ADMIN,
            name="Admin User",
            is_active=True,
        )
        self.supervisor = User.objects.create_user(
            email="supervisor-audit@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Supervisor User",
            is_active=True,
        )
        self.audit_url = reverse("audit-report-list")

        AuditEvent.objects.create(
            user=self.super_admin,
            event_type="log_created",
            object_type="chiller_log",
            object_id="ch-super",
            field_name="created",
            new_value="created",
            extra={},
        )
        AuditEvent.objects.create(
            user=self.admin,
            event_type="log_created",
            object_type="boiler_log",
            object_id="bl-admin",
            field_name="created",
            new_value="created",
            extra={},
        )

    def test_super_admin_sees_all_role_audit_rows(self):
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.get(self.audit_url, follow=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data if isinstance(response.data, list) else response.data.get("results", [])
        actor_roles = {str((row.get("user_email") or "")).strip() for row in rows}
        self.assertIn("super-admin-audit@example.com", actor_roles)
        self.assertIn("admin-audit@example.com", actor_roles)

    def test_admin_does_not_see_super_admin_audit_rows(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.audit_url, follow=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data if isinstance(response.data, list) else response.data.get("results", [])
        actor_roles = {str((row.get("user_email") or "")).strip() for row in rows}
        self.assertNotIn("super-admin-audit@example.com", actor_roles)
        self.assertIn("admin-audit@example.com", actor_roles)

    def test_supervisor_does_not_see_super_admin_audit_rows(self):
        self.client.force_authenticate(user=self.supervisor)
        response = self.client.get(self.audit_url, follow=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data if isinstance(response.data, list) else response.data.get("results", [])
        actor_roles = {str((row.get("user_email") or "")).strip() for row in rows}
        self.assertNotIn("super-admin-audit@example.com", actor_roles)
        self.assertIn("admin-audit@example.com", actor_roles)
