from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User, UserRole
from compressor_logs.models import CompressorLog
from reports.models import Report


class CompressorApprovalFlowTests(APITestCase):
    def setUp(self):
        self.operator = User.objects.create_user(
            email="compressor-operator@example.com",
            password="testpass123",
            role=UserRole.OPERATOR,
            name="Compressor Operator",
            is_active=True,
        )
        self.supervisor = User.objects.create_user(
            email="compressor-supervisor@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Compressor Supervisor",
            is_active=True,
        )

    def _create_pending_log(self, operator):
        return CompressorLog.objects.create(
            equipment_id="CP-001",
            site_id="SITE-1",
            remarks="Initial compressor reading",
            operator=operator,
            operator_name=operator.name or operator.email,
            status="pending",
        )

    def test_supervisor_approve_creates_report_entry(self):
        log = self._create_pending_log(self.operator)
        url = f"{reverse('compressor-log-approve', kwargs={'pk': str(log.id)}).rstrip('/')}/"

        self.client.force_authenticate(user=self.supervisor)
        response = self.client.post(url, {"action": "approve", "remarks": "approved"}, format="json", follow=True)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log.refresh_from_db()
        self.assertEqual(log.status, "approved")
        self.assertEqual(Report.objects.filter(source_id=log.id, source_table="compressor_logs").count(), 1)

    def test_operator_cannot_approve_own_log(self):
        log = self._create_pending_log(self.operator)
        url = f"{reverse('compressor-log-approve', kwargs={'pk': str(log.id)}).rstrip('/')}/"

        self.client.force_authenticate(user=self.operator)
        response = self.client.post(url, {"action": "approve", "remarks": "self approve"}, format="json", follow=True)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        log.refresh_from_db()
        self.assertEqual(log.status, "pending")
