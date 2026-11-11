# CollabCode

Collaborative Python editor team project. This branch adds Person 3's local API
to the existing frontend/execution work from `ethan/frontend`.

- [Local setup and test accounts](docs/local-development.md)
- [Person 3 REST contract](docs/person3-api.md)
- [Local data model](docs/person3-data.md)
- [Person 3 handoff and remaining integration](docs/person3-handoff.md)
- [Implementation log](docs/person3-progress.md)
- [Execution data contract](schemas/SCHEMAS.md)

Use Node.js 24 or newer. The local API uses Express, TypeScript and Node's built-in
SQLite support. No AWS account, cloud deployment or Docker is needed for this flow.
`architecture.md` is an earlier proposal; the current integration boundaries are
documented in the Person 3 contract and the Person 1/4 handoffs.
