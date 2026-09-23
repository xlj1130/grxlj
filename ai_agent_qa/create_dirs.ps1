$dirs = @(
    "ai_agent_qa/backend",
    "ai_agent_qa/backend/config",
    "ai_agent_qa/backend/api",
    "ai_agent_qa/backend/api/v1",
    "ai_agent_qa/backend/api/v1/routes",
    "ai_agent_qa/backend/api/v1/models",
    "ai_agent_qa/backend/agents",
    "ai_agent_qa/backend/agents/tools",
    "ai_agent_qa/backend/agents/memory",
    "ai_agent_qa/backend/services",
    "ai_agent_qa/backend/db",
    "ai_agent_qa/backend/db/models",
    "ai_agent_qa/backend/db/schemas",
    "ai_agent_qa/backend/utils",
    "ai_agent_qa/frontend",
    "ai_agent_qa/frontend/public",
    "ai_agent_qa/frontend/src/pages/api",
    "ai_agent_qa/frontend/src/components/ui",
    "ai_agent_qa/frontend/src/components/layout",
    "ai_agent_qa/frontend/src/components/multimodal",
    "ai_agent_qa/frontend/src/hooks",
    "ai_agent_qa/frontend/src/services",
    "ai_agent_qa/frontend/src/types",
    "ai_agent_qa/frontend/styles"
)
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
}
Write-Host "All directories created."
