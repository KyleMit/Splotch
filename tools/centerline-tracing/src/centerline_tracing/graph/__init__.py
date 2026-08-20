"""clg — the common centerline graph layer: model, pruning, selection, scoring.

Public surface:
    CenterlineGraph, Node, Edge      the shared graph model
    validate_document, SCHEMA_VERSION  the schema every extraction track writes to
"""

from .graph import CenterlineGraph, Edge, Node  # noqa: F401
from .schema import SCHEMA_VERSION, validate_document  # noqa: F401

__all__ = ["CenterlineGraph", "Edge", "Node", "SCHEMA_VERSION", "validate_document"]
