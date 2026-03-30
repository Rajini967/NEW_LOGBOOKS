from uuid import UUID

from django.core.management.base import BaseCommand

from accounts.models import User, UserActivityLog
from reports.models import AuditEvent


LIFECYCLE_EVENT_TYPES = (
    "user_created",
    "password_changed",
    "user_locked",
    "user_unlocked",
)


class Command(BaseCommand):
    help = "Backfill lifecycle user events from audit trail into user activity logs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Calculate inserts without writing any records.",
        )

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        inserted = 0
        duplicate = 0
        missing_user = 0
        invalid_object_id = 0

        qs = AuditEvent.objects.filter(
            event_type__in=LIFECYCLE_EVENT_TYPES,
            object_type="user",
        ).order_by("timestamp")

        for event in qs.iterator():
            try:
                target_user_id = UUID(str(event.object_id))
            except Exception:
                invalid_object_id += 1
                continue

            user = User.all_objects.filter(id=target_user_id).first()
            if user is None:
                missing_user += 1
                continue

            exists = UserActivityLog.objects.filter(
                user_id=user.id,
                event_type=event.event_type,
                created_at=event.timestamp,
            ).exists()
            if exists:
                duplicate += 1
                continue

            inserted += 1
            if dry_run:
                continue

            row = UserActivityLog.objects.create(
                user=user,
                event_type=event.event_type,
                ip_address=None,
                user_agent="Backfilled from audit trail",
            )
            UserActivityLog.objects.filter(id=row.id).update(created_at=event.timestamp)

        mode = "DRY RUN" if dry_run else "APPLIED"
        self.stdout.write(self.style.SUCCESS(f"[{mode}] User lifecycle backfill complete"))
        self.stdout.write(f"Inserted: {inserted}")
        self.stdout.write(f"Skipped duplicates: {duplicate}")
        self.stdout.write(f"Skipped missing users: {missing_user}")
        self.stdout.write(f"Skipped invalid object_id: {invalid_object_id}")
