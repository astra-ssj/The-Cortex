# Microsoft 365 / Graph connector package.

from .mock_adapter import is_m365_mock_mode, run_microsoft365_sync

__all__ = ["is_m365_mock_mode", "run_microsoft365_sync"]
