from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from datetime import timedelta

from accounts.models import User, UserRole
from chemical_prep.models import ChemicalPreparation
from reports.models import Report


class ChemicalPrepApiSmokeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="chemical-smoke@example.com",
            password="testpass123",
            role=UserRole.OPERATOR,
            name="Chemical Smoke",
            is_active=True,
        )
        self.url = reverse("chemical-list")

    def test_list_requires_authentication(self):
        response = self.client.get(self.url, follow=True)
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_list_authenticated_returns_non_server_error(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url, follow=True)
        self.assertNotEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)


class ChemicalPreparationApprovalFlowTests(APITestCase):
    def setUp(self):
        self.operator = User.objects.create_user(
            email="chemical-operator@example.com",
            password="testpass123",
            role=UserRole.OPERATOR,
            name="Chemical Operator",
            is_active=True,
        )
        self.supervisor = User.objects.create_user(
            email="chemical-supervisor@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Chemical Supervisor",
            is_active=True,
        )

    def _create_pending_log(self, operator, *, status_value="pending"):
        return ChemicalPreparation.objects.create(
            equipment_name="CT-001",
            chemical_name="Sodium Hypochlorite",
            chemical_qty=1000,
            operator=operator,
            operator_name=operator.name or operator.email,
            checked_by=operator.name or operator.email,
            status=status_value,
        )

    def test_supervisor_approve_creates_report_entry(self):
        prep = self._create_pending_log(self.operator)
        url = reverse("chemical-prep-approve", kwargs={"pk": str(prep.id)})

        self.client.force_authenticate(user=self.supervisor)
        response = self.client.post(url, {"action": "approve", "remarks": "approved"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        prep.refresh_from_db()
        self.assertEqual(prep.status, "approved")
        self.assertEqual(prep.approved_by_id, self.supervisor.id)
        self.assertEqual(
            Report.objects.filter(source_id=prep.id, source_table="chemical_preparations").count(),
            1,
        )
        report = Report.objects.get(source_id=prep.id, source_table="chemical_preparations")
        self.assertEqual(report.report_type, "chemical")
        self.assertEqual(report.approved_by_id, self.supervisor.id)

    def test_operator_cannot_approve_own_log(self):
        prep = self._create_pending_log(self.operator)
        url = reverse("chemical-prep-approve", kwargs={"pk": str(prep.id)})

        self.client.force_authenticate(user=self.operator)
        response = self.client.post(url, {"action": "approve", "remarks": "self approve"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        prep.refresh_from_db()
        self.assertEqual(prep.status, "pending")
        self.assertEqual(
            Report.objects.filter(source_id=prep.id, source_table="chemical_preparations").count(),
            0,
        )


class ChemicalMissingSlotsRangeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="chemical-range@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Chemical Range",
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse("chemical-prep-missing-slots")

    def test_range_response_contains_day_wise_data(self):
        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        day1 = (now - timedelta(days=1)).replace(hour=1)
        day2 = now.replace(hour=1)
        ChemicalPreparation.objects.create(equipment_name="C-001", timestamp=day1, status="approved")
        ChemicalPreparation.objects.create(equipment_name="C-001", timestamp=day2, status="approved")

        response = self.client.get(
            self.url,
            {"date_from": day1.date().isoformat(), "date_to": day2.date().isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("days", response.data)
        self.assertEqual(response.data["day_count"], 2)
        self.assertEqual(len(response.data["days"]), 2)
        self.assertEqual(response.data["days"][0]["date"], day1.date().isoformat())
        self.assertEqual(response.data["days"][1]["date"], day2.date().isoformat())

    def test_range_rejects_more_than_366_days(self):
        day_from = timezone.localdate() - timedelta(days=367)
        day_to = timezone.localdate()
        response = self.client.get(
            self.url,
            {"date_from": day_from.isoformat(), "date_to": day_to.isoformat()},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)

    def test_single_day_date_mode_keeps_existing_shape(self):
        day = timezone.localdate()
        response = self.client.get(self.url, {"date": day.isoformat()})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["date"], day.isoformat())
        self.assertNotIn("days", response.data)
