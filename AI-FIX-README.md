# AI: Explain / Fix error — frontend (step 1)

Copy the `src/` folder over the project's `src/` (merge, keep paths).

New files
- src/components/zipbench/ai/aiFixUtils.js
- src/components/zipbench/ai/useAiFix.js
- src/components/zipbench/ai/AiFixPanel.jsx
- src/components/zipbench/ai/__tests__/aiFixUtils.test.js   (node --test)
- src/styles/css/zip-ai-fix.css

Modified files
- src/components/zipbench/ZipWorkbench.jsx
- src/components/zipbench/SandboxPanel.jsx
- src/components/zipbench/RunPanel.jsx
- src/components/zipbench/runner/useSandbox.js   (adds getOutput())

Backend: uip-laravel-ai-code-backend.zip (run the migration for ai.code_assist).
