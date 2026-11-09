from datetime import timedelta, timezone as datetime_timezone

from django.db import transaction
from django.utils import timezone

from .models import EEGSession, StreakDay, User


def current_streak(user, *, as_of=None):
    if user.last_activity_date is None:
        return 0

    if as_of is None:
        as_of = timezone.now()
    today = as_of.astimezone(datetime_timezone.utc).date()
    if user.last_activity_date not in (today, today - timedelta(days=1)):
        return 0
    return user.streak


@transaction.atomic
def complete_eeg_session(*, user, session_data):
    user = User.objects.select_for_update().get(pk=user.pk)
    session = EEGSession.objects.create(
        user=user,
        session_data=session_data,
    )
    activity_date = session.created_at.astimezone(datetime_timezone.utc).date()
    _, day_created = StreakDay.objects.get_or_create(
        user=user,
        activity_date=activity_date,
    )

    if day_created and (
        user.last_activity_date is None or activity_date > user.last_activity_date
    ):
        if user.last_activity_date == activity_date - timedelta(days=1):
            user.streak += 1
        else:
            user.streak = 1
        user.max_streak = max(user.max_streak, user.streak)
        user.last_activity_date = activity_date
        user.save(
            update_fields=("streak", "max_streak", "last_activity_date")
        )

    return session, user
