from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User, UserRole
from chiller_logs.models import ChillerLog
from core.log_slot_utils import get_slot_day_bounds, get_slot_timezone
from reports.models import Report


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

    def test_open_maintenance_suppresses_missing_slots_for_all_days_until_approved(self):
        """
        Open maintenance suppresses missing-slot rows for days *after* the log's local start
        date until approved. The start day still appears so earlier empty slots can show as missed.
        """
        slot_tz = get_slot_timezone()
        local_today = timezone.localtime(timezone.now(), slot_tz).date()
        start_local_date = local_today - timedelta(days=5)
        day_start, _ = get_slot_day_bounds(start_local_date)
        log_ts = day_start + timedelta(hours=12)

        log = ChillerLog.objects.create(
            equipment_id="CH-MAINT-RANGE",
            status="draft",
            activity_type="maintenance",
            operator_name="test",
        )
        # timestamp uses auto_now_add; set historical time via update.
        ChillerLog.objects.filter(pk=log.pk).update(timestamp=log_ts)

        end_local_date = local_today - timedelta(days=2)
        response = self.client.get(
            self.url,
            {
                "date_from": start_local_date.isoformat(),
                "date_to": end_local_date.isoformat(),
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for day_block in response.data["days"]:
            ids = {e["equipment_id"] for e in day_block.get("equipments", [])}
            d = day_block["date"]
            if d == start_local_date.isoformat():
                self.assertIn(
                    "CH-MAINT-RANGE",
                    ids,
                    msg="start day should still list equipment (earlier slots may be missing)",
                )
            else:
                self.assertNotIn(
                    "CH-MAINT-RANGE",
                    ids,
                    msg=f"equipment should be suppressed on {d}",
                )

    def test_draft_maintenance_fills_hour_slot_same_day(self):
        """Downtime timestamps fill the slot they fall in; other hours can still be missing."""
        slot_tz = get_slot_timezone()
        local_today = timezone.localtime(timezone.now(), slot_tz).date()
        day_hist = local_today - timedelta(days=10)
        day_start, _ = get_slot_day_bounds(day_hist)
        log_ts = day_start + timedelta(hours=13, minutes=20)

        log = ChillerLog.objects.create(
            equipment_id="CH-SLOT-FILL",
            status="draft",
            activity_type="maintenance",
            operator_name="t",
        )
        ChillerLog.objects.filter(pk=log.pk).update(timestamp=log_ts)

        response = self.client.get(self.url, {"date": day_hist.isoformat()})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(
            (e for e in response.data.get("equipments", []) if e.get("equipment_id") == "CH-SLOT-FILL"),
            None,
        )
        self.assertIsNotNone(row)
        # Hourly: maintenance at 13:xx → only pre-maintenance gaps count (00:00–13:00) → 13 slots.
        self.assertEqual(row.get("missing_slot_count"), 13)

    def test_approved_maintenance_shows_missing_slots_after_downtime_window(self):
        """Approved downtime: same-day missing list includes hours after maintenance (not draft-only filter)."""
        slot_tz = get_slot_timezone()
        local_today = timezone.localtime(timezone.now(), slot_tz).date()
        day_hist = local_today - timedelta(days=10)
        day_start, _ = get_slot_day_bounds(day_hist)
        log_ts = day_start + timedelta(hours=13, minutes=20)

        log = ChillerLog.objects.create(
            equipment_id="CH-APPROVED-MS",
            status="approved",
            activity_type="maintenance",
            operator_name="t",
        )
        ChillerLog.objects.filter(pk=log.pk).update(timestamp=log_ts)

        response = self.client.get(self.url, {"date": day_hist.isoformat()})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(
            (e for e in response.data.get("equipments", []) if e.get("equipment_id") == "CH-APPROVED-MS"),
            None,
        )
        self.assertIsNotNone(row)
        # No open draft: full missing count except the one maintenance hour → 23.
        self.assertEqual(row.get("missing_slot_count"), 23)


class ChillerLogDestroyPermissionTests(APITestCase):
    def setUp(self):
        self.operator = User.objects.create_user(
            email="op-del@example.com",
            password="testpass123",
            role=UserRole.OPERATOR,
            name="Op",
            is_active=True,
        )
        self.super_admin = User.objects.create_user(
            email="sa-del@example.com",
            password="testpass123",
            role=UserRole.SUPER_ADMIN,
            name="SA",
            is_active=True,
            is_staff=True,
            is_superuser=True,
        )
        self.log = ChillerLog.objects.create(
            equipment_id="CH-DEL",
            site_id="S1",
            remarks="x",
            operator=self.operator,
            operator_name="Op",
            status="pending",
        )

    def test_operator_cannot_delete_chiller_log(self):
        url = reverse("chiller-log-detail", kwargs={"pk": str(self.log.id)})
        self.client.force_authenticate(user=self.operator)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ChillerLog.objects.filter(pk=self.log.pk).exists())

    def test_super_admin_can_delete_chiller_log(self):
        url = reverse("chiller-log-detail", kwargs={"pk": str(self.log.pk)})
        self.client.force_authenticate(user=self.super_admin)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ChillerLog.objects.filter(pk=self.log.pk).exists())
