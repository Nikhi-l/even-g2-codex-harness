# Contributing

Use Node 22.12+ and `npm ci`. Work on a feature branch and keep pull requests focused on the artifact harness. Preserve the seven extracted templates and add schemas/tests when extending the registry.

Run `npm run check`, then `npx playwright install chromium` and `npm run test:browser`. Integration tests use loopback servers and mocked hardware; they never call paid model APIs or touch glasses. Browser tests use generic fixtures only. `npm audit` and `npm run audit:files` complement review but are not guarantees that every secret or vulnerability is detected.

For visual changes, capture the actual app/gallery at desktop and phone widths. Keep screenshots free of credentials, personal content and operational URLs. Label preview/simulator imagery accurately. For device changes, update the compatibility table and provide explicit hardware evidence or mark it untested. Never count a successful mock/SDK call as physical verification.

Template image assets must be yours to publish or carry a compatible license and attribution. Do not reintroduce a customer app, proprietary data, user portraits, provider keys or copied private history. Contributions are made under the project's MIT license.
