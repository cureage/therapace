from datetime import timedelta, timezone as datetime_timezone

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from users.models import EEGSession, Fear, StreakDay, User


DEMO_USERS = (
    ("Ahmed", "Rahman", 100, 11),
    ("Tammy", "Nguyen", 87, 5),
    ("Priya", "Shah", 214, 9),
    ("Marcus", "Reed", 12, 3),
    ("Lena", "Kovac", 156, 7),
    ("Diego", "Santos", 45, 4),
    ("Yuki", "Tanaka", 301, 8),
    ("Fatima", "Hassan", 9, 2),
    ("Oliver", "Brooks", 73, 6),
    ("Chidi", "Okafor", 342, 10),
    ("Sofia", "Marin", 4, 1),
    ("Liam", "Chen", 128, 5),
)

FEAR_NAMES = (
    "Spiders",
    "Heights",
    "Public speaking",
    "Dogs",
    "Flying",
    "Crowded places",
    "Deep water",
    "Needles",
    "Driving",
    "Thunderstorms",
    "Small spaces",
)


class Command(BaseCommand):
    help = "Create or update demo users and activity for the Bloom leaderboard."

    @transaction.atomic
    def handle(self, *args, **options):
        today = timezone.now().astimezone(datetime_timezone.utc).date()
        now = timezone.now()
        streak_days = []
        seeded_count = 0

        for index, (first_name, last_name, streak, conquered) in enumerate(DEMO_USERS, start=1):
            user, created = User.objects.get_or_create(
                email=f"leaderboard-demo-{index:02d}@example.test",
                defaults={
                    "first_name": first_name,
                    "last_name": last_name,
                    "is_active": True,
                    "is_email_verified": True,
                },
            )
            if not created and (user.is_staff or user.is_superuser):
                raise CommandError(f"Refusing to overwrite privileged account {user.email}.")

            user.set_unusable_password()
            user.first_name = first_name
            user.last_name = last_name
            user.is_active = True
            user.is_email_verified = True
            user.streak = streak
            user.max_streak = max(user.max_streak, streak)
            user.last_activity_date = today
            user.save()

            for fear_index, fear_name in enumerate(FEAR_NAMES[:conquered], start=1):
                Fear.objects.get_or_create(
                    user=user,
                    name=fear_name,
                    defaults={"category": "demo", "description": "Leaderboard seed data."},
                )
                EEGSession.objects.update_or_create(
                    user=user,
                    recording_key=f"leaderboard-demo-fear-{fear_index}",
                    defaults={
                        "status": EEGSession.Status.COMPLETE,
                        "session_data": {
                            "fear": fear_name,
                            "intensity": 2,
                            "duration_seconds": 30,
                        },
                        "started_at": now - timedelta(minutes=1),
                        "ended_at": now,
                    },
                )

            streak_days.extend(
                StreakDay(user=user, activity_date=today - timedelta(days=day))
                for day in range(streak)
            )
            seeded_count += 1

        StreakDay.objects.bulk_create(streak_days, ignore_conflicts=True)
        self.stdout.write(self.style.SUCCESS(f"Seeded leaderboard activity for {seeded_count} demo users."))
