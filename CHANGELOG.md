# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - unreleased

### Added

- Initial release.
- `OpenApiSpecSource` for OpenAPI 3.x specs (URL or file).
- `StaticSpecSource` for hand-curated tool catalogs and tests.
- `FetchTransport` built on native `fetch`.
- Auth providers: `NoAuth`, `StaticBearerAuth`, `ApiKeyHeaderAuth`, `CallbackAuth`.
- Visibility filters: `AllowAllFilter`, `DenyMutatingFilter`, `TagFilter`,
  `ScopeFilter`, `CompositeFilter`.
- `ConfigMasker` with `MaskingProfile` (YAML/JSON/object).
- `NoopMasker`.
- LLM clients: `OpenAiCompatClient`, `AnthropicClient` (peer dep).
- `buildServer` factory and `Agent` runtime.
- OpenTelemetry observability hooks (peer dep).
