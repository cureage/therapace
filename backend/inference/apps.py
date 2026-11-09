from django.apps import AppConfig


class InferenceConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'inference'

    def ready(self):
        from . import registry
        registry.load()   # once per process, not per request
