from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import EEGSession, StreakDay, User


class LeaderboardViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="leader@example.com",
            password="test-password",
            first_name="Bloom",
            last_name="Member",
        )
        self.client.force_authenticate(self.user)

    def create_exposure(self, user, fear, status=EEGSession.Status.COMPLETE):
        return EEGSession.objects.create(
            user=user,
            status=status,
            session_data={"fear": fear} if fear is not None else {},
        )

    def test_leaderboard_counts_unique_fears_from_completed_sessions_only(self):
        self.create_exposure(self.user, "Spiders")
        self.create_exposure(self.user, " spiders ")
        self.create_exposure(self.user, "   ")
        self.create_exposure(self.user, "Crowds")
        self.create_exposure(self.user, "Dogs", status=EEGSession.Status.PARTIAL)
        self.create_exposure(self.user, None)

        response = self.client.get("/api/leaderboard/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data[0],
            {
                "id": self.user.pk,
                "name": "Bloom Member",
                "conquered": 2,
                "streak": 0,
            },
        )
        self.assertNotIn("email", response.data[0])

    def test_sort_options_use_current_streak_and_completed_fear_count(self):
        today = timezone.now().date()
        most_fears = User.objects.create_user(
            email="fears@example.com",
            password="test-password",
            first_name="Fears",
            streak=3,
            last_activity_date=today,
        )
        longest_streak = User.objects.create_user(
            email="streak@example.com",
            password="test-password",
            first_name="Streak",
            streak=8,
            last_activity_date=today,
        )
        expired = User.objects.create_user(
            email="expired@example.com",
            password="test-password",
            first_name="Expired",
            streak=50,
            last_activity_date=today - timedelta(days=3),
        )
        for fear in ("Spiders", "Crowds"):
            self.create_exposure(most_fears, fear)
        self.create_exposure(longest_streak, "Heights")
        self.create_exposure(expired, "Dogs")

        streak_response = self.client.get("/api/leaderboard/?sort=streak")
        conquered_response = self.client.get("/api/leaderboard/?sort=conquered")

        self.assertEqual(streak_response.data[0]["id"], longest_streak.pk)
        self.assertEqual(streak_response.data[-1]["streak"], 0)
        self.assertEqual(conquered_response.data[0]["id"], most_fears.pk)

    def test_invalid_sort_is_rejected(self):
        response = self.client.get("/api/leaderboard/?sort=recent")

        self.assertEqual(response.status_code, 400)
        self.assertIn("sort", response.data)

    def test_endpoint_requires_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get("/api/leaderboard/")

        self.assertEqual(response.status_code, 401)


class SeedLeaderboardCommandTests(APITestCase):
    def test_command_is_repeatable_and_creates_real_streak_and_session_records(self):
        call_command("seed_leaderboard", stdout=StringIO(), stderr=StringIO())
        call_command("seed_leaderboard", stdout=StringIO(), stderr=StringIO())

        user = User.objects.get(email="leaderboard-demo-01@example.test")
        self.assertEqual(user.streak, 100)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.eeg_sessions.filter(status=EEGSession.Status.COMPLETE).count(), 11)
        self.assertEqual(StreakDay.objects.filter(user=user).count(), 100)
