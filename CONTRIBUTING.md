# Contributing to audit-nest-observability

Thanks for wanting to contribute. This library is small on purpose, so every
change should protect the core idea: NestJS observability helpers with clear
architecture boundaries and predictable extension points.

## How to contribute

1. Fork the repository.
2. Create a branch from the default branch.
3. Make a focused change.
4. Add or update tests when behavior changes.
5. Update documentation when public APIs, examples, or configuration change.
6. Open a pull request with a clear explanation of the problem and solution.

## Before opening a pull request

Run the relevant local checks:

```sh
npm test
```

If your change affects generated package output, mention that clearly in the PR.
Do not include unrelated formatting, generated files, or dependency updates in
the same pull request unless they are required by the change.

## Branch names

Use short, descriptive branch names:

- `fix/request-context-metadata`
- `feat/kafka-adapter`
- `docs/contributing-guide`
- `test/audit-mapper-fallbacks`

## Commit messages

Use conventional commits:

- `feat: add kafka event context adapter`
- `fix: preserve request id in consumer context`
- `docs: explain wildcard audit consumer`
- `test: cover recursive actor resolution`
- `refactor: simplify audit mapper fallback flow`

Keep commits focused. If a commit mixes documentation, refactors, and behavior
changes, split it.

## Pull request checklist

- [ ] The PR explains the motivation and trade-offs.
- [ ] The change is focused and avoids unrelated edits.
- [ ] Tests were added or updated when behavior changed.
- [ ] Documentation was updated when public behavior changed.
- [ ] `npm test` passes locally.
- [ ] The code preserves the existing architecture boundaries.

## Architecture expectations

The project follows explicit boundaries:

- `domain` owns contracts and payload shapes.
- `application` orchestrates use cases and mapping.
- `infrastructure` owns external transport details.
- request context is propagated as library context, not as raw Express requests.

When adding features, prefer extension points over framework leakage. If a
transport integration needs framework-specific behavior, keep it isolated in the
infrastructure layer.

## Reporting bugs

Please include:

- the library version
- your NestJS version
- a minimal reproduction or failing test when possible
- expected behavior
- actual behavior
- relevant configuration

## Requesting features

Explain the use case before proposing the implementation. Good feature requests
describe the real problem, constraints, and alternatives considered.

## Code of Conduct

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
