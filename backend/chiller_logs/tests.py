from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User, UserRole
from chiller_logs.models import ChillerLog
from reports.models import Report
from datetime import timedelta


class ChillerApprovalFlowTests(APITestCase):
    def setUp(self):
        self.operator = User.objects.create_user(
            email="operator@example.com",
            password="testpass123",
            role=UserRole.OPERATOR,
            name="Operator User",
            is_active=True,
        )
        self.supervisor = User.objects.create_user(
            email="supervisor@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Supervisor User",
            is_active=True,
        )

    def _create_pending_log(self, operator):
        return ChillerLog.objects.create(
            equipment_id="CH-001",
            site_id="SITE-1",
            remarks="Initial reading",
            operator=operator,
            operator_name=operator.name or operator.email,
            status="pending",
        )

    def test_supervisor_approve_creates_report_entry(self):
        log = self._create_pending_log(self.operator)
        url = f"{reverse('chiller-log-approve', kwargs={'pk': str(log.id)}).rstrip('/')}/"

        self.client.force_authenticate(user=self.supervisor)
        response = self.client.post(url, {"action": "approve", "remarks": "Looks good"}, format="json", follow=True)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log.refresh_from_db()
        self.assertEqual(log.status, "approved")
        self.assertEqual(log.approved_by_id, self.supervisor.id)
        self.assertEqual(Report.objects.filter(source_id=log.id, source_table="chiller_logs").count(), 1)
        report = Report.objects.get(source_id=log.id, source_table="chiller_logs")
        self.assertEqual(report.report_type, "utility")
        self.assertEqual(report.approved_by_id, self.supervisor.id)

    def test_operator_cannot_approve_own_log(self):
        log = self._create_pending_log(self.operator)
        url = f"{reverse('chiller-log-approve', kwargs={'pk': str(log.id)}).rstrip('/')}/"

        self.client.force_authenticate(user=self.operator)
        response = self.client.post(url, {"action": "approve", "remarks": "self approve"}, format="json", follow=True)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        log.refresh_from_db()
        self.assertEqual(log.status, "pending")
        self.assertEqual(Report.objects.filter(source_id=log.id, source_table="chiller_logs").count(), 0)


class ChillerMissingSlotsRangeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="chiller-range@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Chiller Range",
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse("chiller-log-missing-slots")

    def test_range_response_contains_day_wise_data(self):
        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        day1 = (now - timedelta(days=1)).replace(hour=1)
        day2 = now.replace(hour=1)

        ChillerLog.objects.create(equipment_id="CH-001", timestamp=day1, status="approved")
        ChillerLog.objects.create(equipment_id="CH-001", timestamp=day2, status="approved")

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

    def test_historical_day_does_not_show_future_last_reading(self):
        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        historical_day = (now - timedelta(days=30)).replace(hour=1)
        future_reading = (now - timedelta(days=10)).replace(hour=5)
        ChillerLog.objects.create(equipment_id="CH-001", timestamp=future_reading, status="approved")

        response = self.client.get(self.url, {"date": historical_day.date().isoformat()})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next((e for e in response.data.get("equipments", []) if e.get("equipment_id") == "CH-001"), None)
        self.assertIsNotNone(row)
        ts = row.get("last_reading_timestamp")
        if ts:
            self.assertLessEqual(ts[:10], historical_day.date().isoformat())
