from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User, UserRole
from briquette_logs.models import BriquetteLog
from reports.models import Report


class BriquetteApprovalFlowTests(APITestCase):
    def setUp(self):
        self.operator = User.objects.create_user(
            email="briquette-operator@example.com",
            password="testpass123",
            role=UserRole.OPERATOR,
            name="Briquette Operator",
            is_active=True,
        )
        self.supervisor = User.objects.create_user(
            email="briquette-supervisor@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Briquette Supervisor",
            is_active=True,
        )

    def _create_pending_log(self, operator):
        return BriquetteLog.objects.create(
            equipment_id="BR-001",
            site_id="SITE-1",
            remarks="Initial briquette reading",
            operator=operator,
            operator_name=operator.name or operator.email,
            status="pending",
        )

    def test_supervisor_approve_creates_report_entry(self):
        log = self._create_pending_log(self.operator)
        url = f"{reverse('briquette-log-approve', kwargs={'pk': str(log.id)}).rstrip('/')}/"

        self.client.force_authenticate(user=self.supervisor)
        response = self.client.post(url, {"action": "approve", "remarks": "approved"}, format="json", follow=True)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log.refresh_from_db()
        self.assertEqual(log.status, "approved")
        self.assertEqual(Report.objects.filter(source_id=log.id, source_table="briquette_logs").count(), 1)

    def test_operator_cannot_approve_own_log(self):
        log = self._create_pending_log(self.operator)
        url = f"{reverse('briquette-log-approve', kwargs={'pk': str(log.id)}).rstrip('/')}/"

        self.client.force_authenticate(user=self.operator)
        response = self.client.post(url, {"action": "approve", "remarks": "self approve"}, format="json", follow=True)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        log.refresh_from_db()
        self.assertEqual(log.status, "pending")
