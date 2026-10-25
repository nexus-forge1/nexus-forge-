# NEXUS FORGE small models

These Modelfiles define the first local NEXUS model family. They configure existing Ollama base models; they do not train weights.

## Build

Run these commands on the private Ollama runtime after pulling the selected base models:

```bash
ollama pull qwen2.5:1.5b
ollama pull qwen2.5-coder:3b
ollama create nexus-forge-chat:1b -f models/chat/Modelfile
ollama create nexus-forge-code:3b -f models/code/Modelfile
ollama create nexus-forge-mission:1b -f models/mission/Modelfile
ollama create nexus-forge-critic:1b -f models/critic/Modelfile
ollama create nexus-forge-research:1b -f models/research/Modelfile
```

The base tags are starting choices. Benchmark memory, latency, context length, structured-output reliability, and quality before enabling a model for customer traffic.

## Runtime configuration

```text
OLLAMA_BASE_URL=http://private-ollama-host:11434/v1
OLLAMA_MODEL_PLANNER=nexus-forge-mission:1b
OLLAMA_MODEL_WAVE1=nexus-forge-code:3b
OLLAMA_MODEL_WAVE2=nexus-forge-code:3b
OLLAMA_MODEL_CRITIC=nexus-forge-critic:1b
OLLAMA_MODEL_RESEARCH=nexus-forge-research:1b
NEXUS_OLLAMA_PRIMARY=false
```

Keep `NEXUS_OLLAMA_PRIMARY=false` during evaluation. Set it to `true` only after the local model passes the held-out evaluation suite and provider health checks. The gateway must stay in front of Ollama; do not expose port 11434 directly.
