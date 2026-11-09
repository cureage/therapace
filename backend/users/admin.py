from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import AIVideo, Fear, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    # The built-in UserAdmin expects a username field, so override everything that mentions it
    ordering = ("email",)
    list_display = ("email", "first_name", "last_name", "is_email_verified", "is_staff", "date_joined")
    list_filter = ("is_staff", "is_superuser", "is_active", "is_email_verified")
    search_fields = ("email", "first_name", "last_name")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name")}),
        ("Status", {"fields": ("is_active", "is_email_verified", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),
    )


class AIVideoInline(admin.TabularInline):
    """Show a fear's videos directly on the fear's page."""
    model = AIVideo
    extra = 0
    fields = ("intensity", "status", "provider", "video_url", "duration_seconds")
    ordering = ("intensity",)
    show_change_link = True


@admin.register(Fear)
class FearAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "user", "initial_severity", "current_level", "is_active", "created_at")
    list_filter = ("category", "is_active")
    search_fields = ("name", "description", "user__email")
    autocomplete_fields = ("user",)
    inlines = [AIVideoInline]


@admin.register(AIVideo)
class AIVideoAdmin(admin.ModelAdmin):
    list_display = ("id", "fear", "intensity", "status", "provider", "created_at")
    list_filter = ("status", "provider", "fear__category")
    search_fields = ("prompt", "fear__name", "external_job_id")
    autocomplete_fields = ("fear",)
    readonly_fields = ("created_at",)
