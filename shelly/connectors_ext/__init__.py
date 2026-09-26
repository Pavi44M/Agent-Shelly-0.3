"""Drop your own connector modules here. Any Connector subclass with a `kind` is auto-registered.

Example (shelly/connectors_ext/xero.py):

    from shelly.core.connectors import Connector
    class XeroConnector(Connector):
        kind = "xero"
        def read(self, table): ...
"""
