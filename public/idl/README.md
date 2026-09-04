# Sails IDL registry

VaraGov decodes `gear.sendMessage` payloads only for programs explicitly listed
in `manifest.json`. Keep IDL files in `public/idl/programs/` and add an entry:

```json
{
  "programId": "0x...64 hex characters...",
  "name": "Display name",
  "format": "v2",
  "path": "/idl/programs/example.idl"
}
```

`format` is `v1` for legacy string-prefixed Sails payloads and `v2` for the
binary-header format. Treat IDLs as trusted, versioned application assets. When
a program is upgraded to incompatible code, update the registered IDL together
with the deployment metadata.
