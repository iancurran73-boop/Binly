"""Adapter registry. Look up by council_id; fall back to None."""
from .base import AdapterUnavailable, BaseAdapter, Collection
from .gateshead import GatesheadAdapter
from .newcastle import NewcastleAdapter
from .sunderland import SunderlandAdapter
from .north_tyneside import NorthTynesideAdapter
from .south_tyneside import SouthTynesideAdapter

REGISTRY: dict[str, type[BaseAdapter]] = {
    GatesheadAdapter.council_id: GatesheadAdapter,
    NewcastleAdapter.council_id: NewcastleAdapter,
    SunderlandAdapter.council_id: SunderlandAdapter,
    NorthTynesideAdapter.council_id: NorthTynesideAdapter,
    SouthTynesideAdapter.council_id: SouthTynesideAdapter,
}


def get_adapter(council_id: str) -> BaseAdapter | None:
    cls = REGISTRY.get(council_id)
    return cls() if cls else None


__all__ = [
    "REGISTRY",
    "get_adapter",
    "BaseAdapter",
    "Collection",
    "AdapterUnavailable",
]
