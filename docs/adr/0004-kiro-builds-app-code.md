# Kiro builds the app code; Claude Code makes the 3D assets

Kiroween disqualifies entries with "insufficient use of Kiro" and requires a committed `/.kiro` directory of specs, hooks and steering. So the app code is implemented through Kiro specs, with the `/.kiro` directory committed and never gitignored, while Claude Code with Blender MCP produces the 3D assets. Planning docs written outside Kiro (CONTEXT.md, these ADRs) feed into Kiro's steering and specs rather than replacing them.
