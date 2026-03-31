from django.test import TestCase
from django.urls import resolve, Resolver404

class UtilityLogsModuleSmokeTests(TestCase):
    def test_route_not_mounted_in_core_urls(self):
        with self.assertRaises(Resolver404):
            resolve("/api/utility-logs/")
