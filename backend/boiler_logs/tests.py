from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User, UserRole
from boiler_logs.models import BoilerLog
from reports.models import Report
from datetime import timedelta


class BoilerApprovalFlowTests(APITestCase):
    def setUp(self):
        self.operator = User.objects.create_user(
            email="boiler-operator@example.com",
            password="testpass123",
            role=UserRole.OPERATOR,
            name="Boiler Operator",
            is_active=True,
        )
        self.supervisor = User.objects.create_user(
            email="boiler-supervisor@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Boiler Supervisor",
            is_active=True,
        )

    def _create_pending_log(self, operator):
        return BoilerLog.objects.create(
            equipment_id="BL-001",
            site_id="SITE-1",
            remarks="Initial boiler reading",
            operator=operator,
            operator_name=operator.name or operator.email,
            status="pending",
        )

    def test_supervisor_approve_creates_report_entry(self):
        log = self._create_pending_log(self.operator)
        url = f"{reverse('boiler-log-approve', kwargs={'pk': str(log.id)}).rstrip('/')}/"

        self.client.force_authenticate(user=self.supervisor)
        response = self.client.post(url, {"action": "approve", "remarks": "approved"}, format="json", follow=True)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log.refresh_from_db()
        self.assertEqual(log.status, "approved")
        self.assertEqual(log.approved_by_id, self.supervisor.id)
        self.assertEqual(Report.objects.filter(source_id=log.id, source_table="boiler_logs").count(), 1)
        report = Report.objects.get(source_id=log.id, source_table="boiler_logs")
        self.assertEqual(report.report_type, "utility")
        self.assertEqual(report.approved_by_id, self.supervisor.id)

    def test_operator_cannot_approve_own_log(self):
        log = self._create_pending_log(self.operator)
        url = f"{reverse('boiler-log-approve', kwargs={'pk': str(log.id)}).rstrip('/')}/"

        self.client.force_authenticate(user=self.operator)
        response = self.client.post(url, {"action": "approve", "remarks": "self approve"}, format="json", follow=True)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        log.refresh_from_db()
        self.assertEqual(log.status, "pending")
        self.assertEqual(Report.objects.filter(source_id=log.id, source_table="boiler_logs").count(), 0)


class BoilerMissingSlotsRangeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="boiler-range@example.com",
            password="testpass123",
            role=UserRole.SUPERVISOR,
            name="Boiler Range",
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse("boiler-log-missing-slots")

    def test_range_response_contains_day_wise_data(self):
        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        day1 = (now - timedelta(days=1)).replace(hour=1)
        day2 = now.replace(hour=1)

        BoilerLog.objects.create(equipment_id="BL-001", timestamp=day1, status="approved")
        BoilerLog.objects.create(equipment_id="BL-001", timestamp=day2, status="approved")

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
        BoilerLog.objects.create(equipment_id="BL-001", timestamp=future_reading, status="approved")

        response = self.client.get(self.url, {"date": historical_day.date().isoformat()})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next((e for e in response.data.get("equipments", []) if e.get("equipment_id") == "BL-001"), None)
        self.assertIsNotNone(row)
        ts = row.get("last_reading_timestamp")
        if ts:
            self.assertLessEqual(ts[:10], historical_day.date().isoformat())


class BoilerTankLevelLimitTests(APITestCase):
    """NLT 200 Ltr / NLT 2 KL for operation activity (serializer)."""

    def setUp(self):
        self.operator = User.objects.create_user(
            email="boiler-tank-op@example.com",
            password="testpass123",
            role=UserRole.OPERATOR,
            name="Tank Op",
            is_active=True,
        )
        self.client.force_authenticate(user=self.operator)
        self.url = reverse("boiler-log-list")

    def _base_operation_payload(self, **overrides):
        payload = {
            "equipment_id": "BL-TANK-BASE",
            "remarks": "Operation with valid tank levels",
            "activity_type": "operation",
            "fo_hsd_ng_day_tank_level": 250,
            "feed_water_tank_level": 2.5,
        }
        payload.update(overrides)
        return payload

    def test_operation_rejects_fo_day_tank_below_200(self):
        response = self.client.post(
            self.url,
            self._base_operation_payload(
                equipment_id="BL-TANK-FO-LOW",
                fo_hsd_ng_day_tank_level=199,
            ),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("fo_hsd_ng_day_tank_level", response.data)

    def test_operation_rejects_feed_water_tank_below_2_kl(self):
        response = self.client.post(
            self.url,
            self._base_operation_payload(
                equipment_id="BL-TANK-FW-LOW",
                feed_water_tank_level=1.9,
            ),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("feed_water_tank_level", response.data)

    def test_maintenance_without_tank_levels_succeeds(self):
        response = self.client.post(
            self.url,
            {
                "equipment_id": "BL-TANK-MAINT",
                "remarks": "Scheduled maintenance",
                "activity_type": "maintenance",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(BoilerLog.objects.filter(equipment_id="BL-TANK-MAINT").count(), 1)
