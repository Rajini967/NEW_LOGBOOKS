from datetime import date, timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User, UserRole
from filter_logs.models import FilterLog
from reports.models import Report


class FilterApprovalFlowTests(APITestCase):
    def setUp(self):
        self.operator = User.objects.create_user(
            email="filter-operator@example.com",
            password="testpass123",
            role=UserRole.OPERATOR,
            name="Filter Operator",
            is_active=True,
        )
        self.supervisor = User.objects.create_user(
            email="filter-supervisor@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Filter Supervisor",
            is_active=True,
        )

    def _create_pending_log(self, operator):
        return FilterLog.objects.create(
            equipment_id="FL-001",
            category="HEPA",
            filter_no="F-100",
            installed_date=date.today(),
            remarks="Initial filter reading",
            operator=operator,
            operator_name=operator.name or operator.email,
            status="pending",
        )

    def test_supervisor_approve_creates_report_entry(self):
        log = self._create_pending_log(self.operator)
        url = reverse("filter-log-approve", kwargs={"pk": str(log.id)})

        self.client.force_authenticate(user=self.supervisor)
        response = self.client.post(url, {"action": "approve", "remarks": "approved"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log.refresh_from_db()
        self.assertEqual(log.status, "approved")
        self.assertEqual(Report.objects.filter(source_id=log.id, source_table="filter_logs").count(), 1)

    def test_operator_cannot_approve_own_log(self):
        log = self._create_pending_log(self.operator)
        url = reverse("filter-log-approve", kwargs={"pk": str(log.id)})

        self.client.force_authenticate(user=self.operator)
        response = self.client.post(url, {"action": "approve", "remarks": "self approve"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        log.refresh_from_db()
        self.assertEqual(log.status, "pending")


class FilterMissingSlotsRangeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="filter-range@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Filter Range",
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse("filter-log-missing-slots")

    def test_range_response_contains_day_wise_data(self):
        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        day1 = (now - timedelta(days=1)).replace(hour=1)
        day2 = now.replace(hour=1)

        FilterLog.objects.create(
            equipment_id="FL-001",
            category="HEPA",
            filter_no="F-100",
            installed_date=date.today(),
            timestamp=day1,
            status="approved",
        )
        FilterLog.objects.create(
            equipment_id="FL-001",
            category="HEPA",
            filter_no="F-100",
            installed_date=date.today(),
            timestamp=day2,
            status="approved",
        )

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
