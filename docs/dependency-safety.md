# Dependency safety policy

**Status: required project policy.** Applies to Ruby gems, direct and transitive dependencies, development and build tools, and any future JavaScript/npm or firmware libraries. Proposed stack choices and scaffold-generated dependencies must meet this policy before installation or adoption.

## Choose established, reviewed dependencies

Use only dependencies with substantial evidence of independent use and security scrutiny, a credible maintenance history, and verified upstream provenance. Prefer existing framework or standard-library functionality when it meets the need without another dependency.

Actively avoid brand-new gems and packages that have not had sufficient independent scrutiny. Review the exact version too: a mature package does not automatically make its newest release trustworthy. Do not select a dependency just because it is popular, recommended by an agent, or the latest available version. No fixed age or download threshold proves safety.

Here, “verified” means the checks below have been performed and their evidence recorded; it is not a guarantee that a dependency is vulnerability-free. If the evidence is missing or inconclusive, defer adoption and use a vetted alternative or existing functionality.

## Review before installing or updating

1. Explain why the dependency is necessary and why existing functionality is insufficient.
2. Verify the exact package name, registry source, upstream repository, and maintainers through the project's official sources. Check for unexpected ownership changes, lookalike names, or unexplained release activity.
3. Assess independent adoption, maintenance and security-response history, and scrutiny of the selected release. Record concrete evidence rather than describing it as “safe” without support.
4. Review release notes and relevant source changes from the previously vetted version. Examine new transitive dependencies, install/build hooks, native extensions, and unexpected network or filesystem behavior before executing them.
5. Check current security advisories for the resolved dependency tree, using ecosystem-appropriate advisory sources and auditing tools that themselves meet this policy. A clean scan is one input, not proof against malicious or undiscovered behavior. Do not knowingly adopt a vulnerable release to avoid a newer one.
6. Pin the reviewed resolution in the ecosystem's lockfile and commit it. Review lockfile changes, including transitive version and source changes; avoid broad, unrelated upgrades or unreviewed Git branches. Run relevant application tests after the dependency review passes.

## Updates and security fixes

Prefer supported, vetted releases over automatic upgrades to the newest release. Dependency-update automation may propose changes, but must not bypass review or automatically merge them solely because tests and advisory scans pass.

Do not impose a waiting period that leaves a known vulnerability in place. Review upstream security fixes promptly, verify their provenance and scope, and test them before adoption. If a fix cannot yet be vetted, document and apply an appropriate mitigation or remove the affected dependency rather than silently retaining the risk.

## Evidence in dependency pull requests

Record the dependency's purpose, exact version and source, evidence of independent scrutiny and maintenance, advisory sources and date checked, review of transitive and install-time changes, and test results. Include unresolved concerns; do not label unchecked dependencies as verified.

When implementation begins, document the selected dependency-audit tools and actual commands in the README and development workflow. This policy does not claim that the proposed stack or the dependencies in an open implementation PR have already been audited.
