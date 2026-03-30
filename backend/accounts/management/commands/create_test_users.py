"""
Management command to create test users for each role.
"""
from django.core.management.base import BaseCommand
from accounts.models import User, UserRole


class Command(BaseCommand):
    help = 'Creates test users for each role'

    def handle(self, *args, **options):
        """Create test users."""
        test_users = [
            {
                'email': 'superadmin@test.com',
                'password': 'testpass123',
                'role': UserRole.SUPER_ADMIN,
                'is_staff': True,
                'is_superuser': True,
            },
            {
                'email': 'admin@test.com',
                'password': 'testpass123',
                'role': UserRole.ADMIN,
                'is_staff': True,
            },
            {
                'email': 'supervisor@test.com',
                'password': 'testpass123',
                'role': UserRole.SUPERVISOR,
            },
            {
                'email': 'operator@test.com',
                'password': 'testpass123',
                'role': UserRole.OPERATOR,
            },
            {
                'email': 'manager@test.com',
                'password': 'testpass123',
                'role': UserRole.MANAGER,
            },
        ]

        created_count = 0
        skipped_count = 0

        for user_data in test_users:
            email = user_data['email']
            password = user_data.pop('password')
            
            if User.objects.filter(email=email, is_deleted=False).exists():
                self.stdout.write(
                    self.style.WARNING(f'User {email} already exists. Skipping.')
                )
                skipped_count += 1
                continue

            user = User.objects.create_user(password=password, **user_data)
            self.stdout.write(
                self.style.SUCCESS(f'✓ Created user: {email} ({user.get_role_display()})')
            )
            created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'\n✓ Created {created_count} users, skipped {skipped_count} existing users.'
            )
        )
        self.stdout.write(
            self.style.WARNING(
                '\n⚠ All test users have password: testpass123'
            )
        )

