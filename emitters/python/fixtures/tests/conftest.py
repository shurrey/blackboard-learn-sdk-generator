"""Shared test fixtures for the Blackboard Learn SDK."""

from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture
def mock_client():
    """Create a mock HTTP client with async methods."""
    client = MagicMock()
    client.get = AsyncMock(return_value={})
    client.post = AsyncMock(return_value={})
    client.put = AsyncMock(return_value={})
    client.patch = AsyncMock(return_value={})
    client.delete = AsyncMock(return_value=None)
    return client
